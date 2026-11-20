// Copyright (C) edde746 and Plezy contributors.
// SPDX-License-Identifier: GPL-3.0-only
// MediaCodec output and surface handoff are adapted from Plezy.
package io.github.zekurio.matinee.player

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import com.edde746.mpv.EndFileReason
import com.edde746.mpv.MpvEvent
import com.edde746.mpv.MpvPlaceholderSurface
import com.edde746.mpv.MpvPlayer
import com.edde746.mpv.MpvPlayerConfig
import com.edde746.mpv.PropertyChange
import com.edde746.mpv.PropertyFormat
import java.io.File
import java.security.KeyStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.roundToLong
import org.json.JSONArray
import org.json.JSONObject

internal class MpvEngine(context: Context, private val output: PlaybackOutput) : PlaybackEngine {
    private val app = context.applicationContext
    private val main = Handler(Looper.getMainLooper())
    private val audio = app.getSystemService(AudioManager::class.java)
    private val thread = HandlerThread("MatineeMpv").apply { start() }
    private val worker = Handler(thread.looper)
    @Volatile private var closed = false
    private var resumeOnFocus = false
    private var focusHeld = false
    private var noisyRegistered = false
    private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(
            AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE).build(),
        )
        .setWillPauseWhenDucked(true)
        .setOnAudioFocusChangeListener(::audioFocusChanged, main)
        .build()
    private val noisy = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = pause()
    }

    // The worker owns mpv and every property below. Native callbacks rejoin its queue.
    private var player: MpvPlayer? = null
    private var placeholder: MpvPlaceholderSurface? = null
    private var surfaces: PlaybackSurfaces? = null
    private var attached: OutputSurfaces? = null
    private var pendingUrl: String? = null
    private var waitForVideo = false
    private var loaded = false
    private var started = false
    private var ended = false
    private var error: String? = null
    private var serverUnavailable = false
    private var wantPause = true
    private var seekOnLoad: Long? = null
    private var sidecarUrl: String? = null
    private var sourceTracks: SourceTracksMessage? = null
    private var fit = FitMessage.CONTAIN
    private var software = false
    private var lastRect: String? = null
    private var lastSize: String? = null
    private val lastEvent = mutableMapOf<Class<out PlaybackEventMessage>, PlaybackEventMessage>()

    private val ticker = object : Runnable {
        override fun run() {
            if (closed || error != null) return
            runCommand("read playback") { publishPlayback() }
            worker.postDelayed(this, 250L)
        }
    }

    override fun open(request: OpenMessage) {
        require(request.headers.isEmpty()) { "Authenticated mpv requests must use the playback relay." }
        ContextCompat.registerReceiver(
            app, noisy, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        noisyRegistered = true
        val autoplay = request.autoplay && requestFocus()
        enqueue("initialize", fatal = true) {
            wantPause = !autoplay
            // Settings can ask for FFmpeg's decoders from the start, drawn as
            // when MediaCodec rejects a format.
            software = request.softwareDecoders
            fit = request.fit
            sourceTracks = request.tracks
            sidecarUrl = request.tracks?.subtitleUrl
            val certificates = systemCertificates()
            placeholder = MpvPlaceholderSurface.create()
            val mpv = MpvPlayer.create(app, listener) {
                configureOutput()
                setOption("pause", if (autoplay) "no" else "yes")
                setOption("start", (request.startMs.coerceAtLeast(0) / 1000.0).toString())
                // Tracks only as picked. Subtitles start off and nothing is found next to the file.
                setOption("sid", "no")
                setOption("sub-auto", "no")
                setOption("sub-delay", (-(request.tracks?.subtitleOffset ?: 0.0)).toString())
                setOption("sub-scale-with-window", "yes")
                // Pause on the last frame at the end rather than unloading the file, so a seek still works.
                setOption("keep-open", "yes")
                setOption("cache", "yes")
                setOption("cache-pause-initial", "yes")
                // Matinee only opens its own server's URLs, and reads no config file or script.
                setOption("ytdl", "no")
                setOption("config", "no")
                for (script in UNUSED_SCRIPTS) setOption(script, "no")
                // This libmpv has no fontconfig, so libass finds fonts only in a directory it is given.
                if (SYSTEM_FONTS.isDirectory) {
                    setOption("sub-fonts-dir", SYSTEM_FONTS.path)
                    setOption("sub-font", "Roboto")
                }
                setOption("tls-verify", "yes")
                setOption("tls-ca-file", certificates.path)
            }
            player = mpv
            mpv.setLogLevel("error")
            mpv.observeProperty("track-list", PropertyFormat.String)
            mpv.observeProperty("vo-format-rejected", PropertyFormat.Flag)
            pendingUrl = request.url
            waitForVideo = request.viewport != null
            if (software) main.post { if (!closed) output.useGpuSurface() }
            applySurfaces()
            worker.post(ticker)
        }
    }

    private fun MpvPlayerConfig.configureOutput() {
        setOption("vo", "mediacodec,gpu-next")
        setOption("hwdec", if (software) "no" else "mediacodec")
        setOption("hwdec-codecs", "h264,hevc,mpeg2video,vp8,vp9,av1")
        val async = if (Build.VERSION.SDK_INT >= 31) ",async=1" else ""
        setOption("vd-lavc-o", "ndk_codec=0,priority=0$async")
        setOption("gpu-context", "android")
        setOption("opengl-es", "yes")
        setOption("ao", "audiotrack,opensles")
        // Keep AV1 film grain in the decoder: the GLES renderer's own grain pass draws luma upside down.
        setOption("vd-lavc-film-grain", "cpu")
        // A MediaCodec decoder holds several frames. A queue lets mpv decode ahead of the video output.
        setOption("vd-queue-enable", "yes")
        setOption("vd-queue-max-samples", "12")
        setOption("vd-queue-max-secs", "0.5")
        setOption("vd-queue-max-bytes", "48MiB")
        setOption("demuxer-max-bytes", "64MiB")
        setOption("demuxer-max-back-bytes", "32MiB")
    }

    override fun play() {
        resumeOnFocus = false
        if (!requestFocus()) return
        enqueue("play") {
            if (ended || player?.getFlag("eof-reached") == true) {
                player?.command("seek", "0", "absolute+exact")
                ended = false
                started = false
            }
            setPaused(false)
        }
    }

    override fun pause() {
        resumeOnFocus = false
        abandonFocus()
        enqueue("pause") { setPaused(true) }
    }

    override fun seekTo(positionMs: Long) = enqueue("seek") {
        if (!loaded) {
            seekOnLoad = positionMs
        } else {
            seek(positionMs)
        }
    }

    override fun setRate(rate: Double) = enqueue("set playback rate") {
        player?.setProperty("speed", rate)
    }

    // The id is checked here so a bad one is an error for Dart, not a failed session.
    override fun selectAudioTrack(id: String?) {
        val selector = trackSelector(id)
        enqueue("select audio") { player?.setProperty("aid", selector) }
    }

    override fun selectSubtitleTrack(id: String?) {
        val selector = trackSelector(id)
        enqueue("select subtitles") { player?.setProperty("sid", selector) }
    }

    override fun setSourceTracks(tracks: SourceTracksMessage) = enqueue("set source tracks") {
        sourceTracks = tracks
        player?.setProperty("sub-delay", -tracks.subtitleOffset)
        changeSidecar(tracks.subtitleUrl)
        player?.getString("track-list")?.let(::publishTracks)
    }

    override fun setSubtitleUrl(url: String?) = enqueue("set external subtitles") {
        changeSidecar(url)
    }

    private fun changeSidecar(url: String?) {
        val mpv = player ?: return
        if (loaded) {
            val previous = sidecarId(mpv)
            if (url != sidecarUrl) {
                previous?.let { mpv.command("sub-remove", it) }
                url?.let { mpv.command("sub-add", it, "select") }
            } else if (previous != null) {
                mpv.setProperty("sid", previous)
            }
        }
        sidecarUrl = url
    }

    override fun setVideoFit(fit: FitMessage) = enqueue("set video fit") {
        this.fit = fit
        applyGeometry()
    }

    override fun setSurfaces(surfaces: PlaybackSurfaces, retiring: Boolean) {
        if (closed) return
        val updated = CountDownLatch(if (retiring) 1 else 0)
        worker.post {
            try {
                if (!closed) runCommand("attach video output", fatal = true) {
                    this.surfaces = surfaces
                    // A viewport can disappear before it produces its first surface.
                    if (retiring) waitForVideo = false
                    applySurfaces()
                }
            } finally {
                updated.countDown()
            }
        }
        if (retiring) awaitHandoff(updated)
    }

    override fun close() {
        closed = true
        if (noisyRegistered) app.unregisterReceiver(noisy)
        abandonFocus()
        worker.removeCallbacksAndMessages(null)
        val retired = CountDownLatch(1)
        worker.post {
            try {
                val target = placeholder?.surface
                if (target != null && attached?.video?.generation != 0L) {
                    player?.attachSurfaces(target, null, 0L, 0L)
                }
            } catch (failure: Exception) {
                Log.w(TAG, "Could not retire the video surface (${failure.javaClass.simpleName})")
            } finally {
                retired.countDown()
                try {
                    player?.close()
                } finally {
                    placeholder?.close()
                    certificatesFile?.delete()
                    thread.quitSafely()
                }
            }
        }
        awaitHandoff(retired)
    }

    private val listener = object : MpvPlayer.Listener {
        override fun onEvent(event: MpvEvent) = enqueue("handle playback event") {
            when (event) {
                is MpvEvent.StartFile -> {
                    loaded = false
                    started = false
                    ended = false
                    serverUnavailable = false
                }
                is MpvEvent.FileLoaded -> {
                    loaded = true
                    seekOnLoad?.let(::seek)
                    seekOnLoad = null
                    sidecarUrl?.let { player?.command("sub-add", it, "select") }
                    player?.getString("track-list")?.let(::publishTracks)
                }
                is MpvEvent.PlaybackRestart -> {
                    started = true
                    serverUnavailable = false
                }
                is MpvEvent.EndFile -> when (event.reason) {
                    EndFileReason.Error -> fail(event.errorMessage ?: "mpv could not play this source.", serverUnavailable)
                    EndFileReason.Eof -> ended = true
                    else -> Unit
                }
                is MpvEvent.LogMessage -> {
                    // libmpv exposes a generic error on EndFile. The HTTP error or
                    // connection failure that led to it comes from FFmpeg's log.
                    if (event.prefix.startsWith("ffmpeg")) {
                        val status = HTTP_ERROR.find(event.text)?.groupValues?.get(1)
                        if (status != null) {
                            serverUnavailable = status == "502" || status == "504"
                        } else if (CONNECTION_ERROR.containsMatchIn(event.text)) {
                            serverUnavailable = true
                        }
                    }
                }
            }
            publishPlayback()
        }

        override fun onPropertyChange(change: PropertyChange) = enqueue("handle playback change") {
            when (change) {
                is PropertyChange.Flag -> if (change.name == "vo-format-rejected" && change.value && !software) {
                    software = true
                    player?.setProperty("hwdec", "no")
                    applySurfaces()
                    main.post { if (!closed) output.useGpuSurface() }
                }
                is PropertyChange.Str -> if (change.name == "track-list") publishTracks(change.value)
                else -> Unit
            }
        }
    }

    private fun applySurfaces() {
        val mpv = player ?: return
        val realVideo = surfaces?.video?.takeIf { it.surface.isValid }
        val osd = surfaces?.osd?.takeIf { !software && realVideo != null && it.surface.isValid }

        // The hardware path starts with both planes when a viewport is present.
        if (pendingUrl != null && waitForVideo && (realVideo == null || (!software && osd == null))) return
        val video = realVideo ?: SurfacePlane(checkNotNull(placeholder).surface, 0L)
        val target = OutputSurfaces(video, osd, software)
        if (target != attached) {
            mpv.attachSurfaces(
                video.surface, osd?.surface, video.generation, osd?.generation ?: 0L,
                if (software) "gpu-next" else null,
            )
            attached = target
            lastRect = null
            lastSize = null
        }
        applyGeometry()
        pendingUrl?.let { url ->
            pendingUrl = null
            mpv.command("loadfile", url, "replace")
        }
    }

    private fun applyGeometry() {
        val mpv = player ?: return
        val geometry = surfaces ?: return
        if (geometry.width <= 0 || geometry.height <= 0 || attached?.video?.generation == 0L) return
        if (software) {
            val size = "${geometry.width}x${geometry.height}"
            if (size != lastSize) {
                mpv.setProperty("android-surface-size", size)
                lastSize = size
            }
            mpv.setProperty("keepaspect", fit != FitMessage.FILL)
            mpv.setProperty("panscan", if (fit == FitMessage.COVER) 1.0 else 0.0)
        } else {
            val rect = listOf(
                geometry.width, geometry.height, geometry.videoLeft, geometry.videoTop, geometry.videoRight, geometry.videoBottom,
            ).joinToString(",")
            if (rect != lastRect) {
                mpv.setProperty("vo-mediacodec-video-rect", rect)
                lastRect = rect
            }
        }
    }

    private fun setPaused(paused: Boolean) {
        wantPause = paused
        player?.setProperty("pause", paused)
        publishPlayback()
    }

    private fun seek(positionMs: Long) {
        player?.command("seek", (positionMs / 1000.0).toString(), "absolute+exact")
        ended = false
        started = false
        // EOF pauses mpv internally. Seeking away from it should preserve the user's intent.
        player?.setProperty("pause", wantPause)
    }

    private fun publishPlayback() {
        val mpv = player ?: return
        if (error != null) return
        val eof = ended || mpv.getFlag("eof-reached") == true
        val phase = when {
            eof -> PhaseMessage.ENDED
            !started || mpv.getFlag("seeking") == true || mpv.getFlag("paused-for-cache") == true -> PhaseMessage.BUFFERING
            else -> PhaseMessage.READY
        }
        publish(StateMessage(phase, phase == PhaseMessage.READY && mpv.getFlag("pause") == false, serverUnavailable = false))
        if (!loaded) return
        publish(
            TimelineMessage(
                positionMs = milliseconds(mpv.getDouble("time-pos")) ?: 0L,
                durationMs = milliseconds(mpv.getDouble("duration")),
                bufferedMs = milliseconds(mpv.getDouble("demuxer-cache-time")),
            ),
        )
        val width = mpv.getInt("width")?.takeIf { it > 0 } ?: return
        val height = mpv.getInt("height")?.takeIf { it > 0 } ?: return
        val displayWidth = mpv.getInt("dwidth")?.takeIf { it > 0 } ?: width
        val displayHeight = mpv.getInt("dheight")?.takeIf { it > 0 } ?: height
        val aspect = displayWidth.toDouble() / displayHeight
        val fps = mpv.getDouble("container-fps")?.takeIf { it.isFinite() && it > 0 }
        if (publish(VideoMessage(width.toLong(), height.toLong(), fps))) {
            main.post { if (!closed) output.videoAspect(aspect) }
        }
    }

    private fun publishTracks(json: String) {
        val (audio, subtitles) = trackList(json).partition { it.optString("type") == "audio" }
        val plan = sourceTracks
        if (loaded && plan != null) {
            val mpv = player ?: return
            val sound = plan.audioIndex?.let { index ->
                audio.firstOrNull { !it.optBoolean("external") && it.optLong("ff-index", -1) == index }
            }
            if (sound != null && !sound.optBoolean("selected")) mpv.setProperty("aid", sound.getString("id"))
            if (plan.subtitleUrl == null) {
                val subtitle = plan.subtitleIndex?.let { index ->
                    subtitles.firstOrNull { !it.optBoolean("external") && it.optLong("ff-index", -1) == index }
                }
                if (subtitle != null && !subtitle.optBoolean("selected")) {
                    mpv.setProperty("sid", subtitle.getString("id"))
                } else if (subtitle == null && subtitles.any { it.optBoolean("selected") }) {
                    mpv.setProperty("sid", "no")
                }
            }
        }
        publish(TracksMessage(audio.map(::trackMessage), subtitles.map(::trackMessage)))
    }

    private fun sidecarId(mpv: MpvPlayer): String? = mpv.getString("track-list")?.let { json ->
        trackList(json).firstOrNull {
            it.optString("type") == "sub" && it.optBoolean("external") &&
                it.optString("external-filename") == sidecarUrl
        }?.optString("id")
    }

    private fun publish(event: PlaybackEventMessage): Boolean {
        if (lastEvent.put(event.javaClass, event) == event) return false
        main.post {
            if (!closed) {
                if (event is StateMessage && (event.phase == PhaseMessage.ENDED || event.phase == PhaseMessage.ERROR)) {
                    abandonFocus()
                }
                output.emit(event)
            }
        }
        return true
    }

    private fun audioFocusChanged(change: Int) {
        if (closed) return
        when (change) {
            AudioManager.AUDIOFOCUS_GAIN -> if (resumeOnFocus) {
                resumeOnFocus = false
                enqueue("restore audio focus") { setPaused(false) }
            }
            AudioManager.AUDIOFOCUS_LOSS -> pause()
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                resumeOnFocus = focusHeld
                enqueue("pause for audio focus") { setPaused(true) }
            }
        }
    }

    private fun requestFocus(): Boolean {
        focusHeld = audio.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        return focusHeld
    }

    private fun abandonFocus() {
        if (focusHeld) audio.abandonAudioFocusRequest(focus)
        focusHeld = false
        resumeOnFocus = false
    }

    private fun enqueue(label: String, fatal: Boolean = false, command: () -> Unit) {
        if (closed) return
        worker.post { if (!closed) runCommand(label, fatal, command) }
    }

    /**
     * Setup and surface work failing ends the session. A command the user sent
     * (a seek, a track) failing is logged: mpv rejects some at the wrong moment,
     * and the next state it reports is the truth.
     */
    private fun runCommand(label: String, fatal: Boolean = false, command: () -> Unit) {
        try {
            command()
        } catch (failure: Exception) {
            Log.w(TAG, "Could not $label (${failure.javaClass.simpleName})")
            if (fatal) fail("mpv could not $label.")
        } catch (failure: LinkageError) {
            Log.w(TAG, "Could not load libmpv", failure)
            fail("Could not load libmpv on this device.")
        }
    }

    private fun fail(message: String, unreachable: Boolean = false) {
        if (error != null) return
        error = message
        runCatching { player?.setProperty("pause", true) }
        publish(StateMessage(PhaseMessage.ERROR, playing = false, message = message, serverUnavailable = unreachable))
    }

    private fun systemCertificates(): File {
        val store = KeyStore.getInstance("AndroidCAStore").apply { load(null) }
        val aliases = store.aliases().toList().filter { it.startsWith("system:") }
        check(aliases.isNotEmpty()) { "Android's trusted certificate store is empty" }
        val file = File.createTempFile("mpv-certs-", ".pem", app.cacheDir)
        certificatesFile = file
        file.bufferedWriter().use { pem ->
            for (alias in aliases) {
                val certificate = store.getCertificate(alias) ?: continue
                pem.appendLine("-----BEGIN CERTIFICATE-----")
                pem.append(Base64.encodeToString(certificate.encoded, Base64.DEFAULT))
                pem.appendLine("-----END CERTIFICATE-----")
            }
        }
        return file
    }

    private var certificatesFile: File? = null

    private data class OutputSurfaces(val video: SurfacePlane, val osd: SurfacePlane?, val software: Boolean)

    private companion object {
        const val TAG = "MatineeMpv"
        val HTTP_ERROR = Regex("""\bHTTP error (\d{3})\b""")
        val CONNECTION_ERROR = Regex(
            "Connection refused|Connection timed out|Network is unreachable|No route to host|Failed to resolve hostname",
            RegexOption.IGNORE_CASE,
        )
        val SYSTEM_FONTS = File("/system/fonts")

        // mpv's bundled Lua scripts. None answers anything Matinee sends mpv.
        val UNUSED_SCRIPTS = listOf(
            "load-stats-overlay", "load-console", "load-auto-profiles", "load-select",
            "load-positioning", "load-commands", "load-context-menu",
        )

        fun awaitHandoff(handoff: CountDownLatch) {
            if (!handoff.await(750, TimeUnit.MILLISECONDS)) Log.w(TAG, "Timed out retiring the video surface")
        }

        fun milliseconds(seconds: Double?): Long? =
            seconds?.takeIf { it.isFinite() && it >= 0 }?.let { (it * 1000).roundToLong() }

        fun trackSelector(id: String?): String =
            if (id == null) "no" else requireNotNull(id.toIntOrNull()) { "Unknown track $id." }.toString()

        fun trackList(json: String): List<JSONObject> {
            val list = JSONArray(json)
            return (0 until list.length()).mapNotNull(list::optJSONObject)
                .filter { it.has("id") && it.optString("type") in setOf("audio", "sub") }
        }

        fun trackMessage(track: JSONObject) = TrackMessage(
            id = track.getString("id"),
            language = track.optString("lang").ifBlank { null },
            title = track.optString("title").ifBlank { null },
            codec = track.optString("codec").ifBlank { null },
            isDefault = track.optBoolean("default"),
            isForced = track.optBoolean("forced"),
            selected = track.optBoolean("selected"),
        )
    }
}
