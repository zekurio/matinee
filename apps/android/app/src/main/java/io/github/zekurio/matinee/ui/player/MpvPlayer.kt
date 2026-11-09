package io.github.zekurio.matinee.ui.player

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes as SystemAudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import androidx.annotation.OptIn
import androidx.core.content.ContextCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import dev.jdtech.mpv.MPVLib
import dev.jdtech.mpv.MPVLib.MpvEvent
import dev.jdtech.mpv.MPVLib.MpvFormat
import dev.jdtech.mpv.MPVLib.MpvLogLevel
import java.io.File
import java.io.IOException
import java.security.KeyStore
import java.security.cert.X509Certificate
import java.util.Locale
import org.json.JSONArray
import org.json.JSONException

/** A subtitle mpv draws itself: a stream in the file, by its index, or a file at a URL. */
sealed interface MpvSubtitle {
    data class Stream(val index: Int) : MpvSubtitle

    data class External(val url: String) : MpvSubtitle
}

/**
 * mpv as a Media3 player: any codec and container through mpv's own FFmpeg,
 * and subtitles drawn by libass with their styling and fonts. The rest of
 * the app talks to it as to any Player: the screen's surface, the media
 * session, play, pause, and seeking. Tracks are picked by their index in
 * the file, with [selectAudio] and [selectSubtitle].
 *
 * Its options follow Findroid's MPVPlayer (GPL-3.0), here on Media3's
 * SimpleBasePlayer, which keeps the state and tells listeners.
 */
@OptIn(UnstableApi::class)
class MpvPlayer(
    context: Context,
    /** Sent with every request: the session's token for the server. */
    headers: Map<String, String>,
    userAgent: String,
    /** Hardware decoders through MediaCodec, or FFmpeg's in software. */
    hardware: Boolean,
) : SimpleBasePlayer(Looper.getMainLooper()), MPVLib.EventObserver, MPVLib.LogObserver {
    private val appContext = context.applicationContext
    private val main = Handler(Looper.getMainLooper())
    private val mpv: MPVLib = checkNotNull(MPVLib.create(appContext)) { "mpv didn't start" }
    private val audioManager = appContext.getSystemService(AudioManager::class.java)

    private var item: MediaItem? = null
    private var startMs = 0L
    private var playWhenReady = false

    /** A file went to mpv; before that, and after a stop or a failure, the player is idle. */
    private var prepared = false

    /** mpv opened the file: its tracks are known and it seeks. */
    private var loaded = false

    /** The first frame since opening showed, so the player is ready. */
    private var started = false
    private var seeking = false
    private var cacheWait = false
    private var ended = false
    private var failure: PlaybackException? = null
    private var positionMs = 0L
    private var bufferedMs = 0L
    private var durationMs = C.TIME_UNSET
    private var speed = 1f
    private var videoSize = VideoSize.UNKNOWN
    private var firstFrame = false

    /** A seek asked for before the file opened, done once it has. */
    private var pendingSeekMs: Long? = null

    /** A file is open in mpv; [expectEnd] says its end is ours, by a stop or the next file. */
    private var fileOpen = false
    private var expectEnd = false
    private var released = false

    @Volatile private var lastError: String? = null

    private var tracks: List<MpvTrack> = emptyList()
    private var wantedAudio: Int? = null
    private var wantedSubtitle: MpvSubtitle? = null

    /** Subtitle files added to the file open now, so each is added once. */
    private val added = mutableSetOf<String>()

    private var holder: SurfaceHolder? = null
    private var surface: Surface? = null

    /** Another app's sound pauses the video, and gives it back after a moment's interruption. */
    private var resumeOnFocus = false
    private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(
            SystemAudioAttributes.Builder()
                .setUsage(SystemAudioAttributes.USAGE_MEDIA)
                .setContentType(SystemAudioAttributes.CONTENT_TYPE_MOVIE)
                .build(),
        )
        .setOnAudioFocusChangeListener({ change ->
            when (change) {
                AudioManager.AUDIOFOCUS_LOSS -> pauseForSystem(resume = false)
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> pauseForSystem(resume = true)
                AudioManager.AUDIOFOCUS_GAIN -> if (resumeOnFocus) {
                    resumeOnFocus = false
                    play()
                }
            }
        }, main)
        .build()

    /** Headphones unplugged: pause rather than play out loud. */
    private val noisy = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) pauseForSystem(resume = false)
        }
    }

    init {
        val config = File(appContext.filesDir, "mpv").apply { mkdirs() }
        val cache = File(appContext.cacheDir, "mpv").apply { mkdirs() }
        writeFontsConf(config)
        val certificates = writeCertificates(cache)
        with(mpv) {
            setOptionString("config", "yes")
            setOptionString("config-dir", config.path)
            setOptionString("gpu-shader-cache-dir", cache.path)
            setOptionString("icc-cache-dir", cache.path)
            setOptionString("profile", "fast")
            setOptionString("vo", VIDEO_OUTPUT)
            setOptionString("gpu-context", "android")
            setOptionString("opengl-es", "yes")
            setOptionString("ao", "audiotrack,aaudio")
            setOptionString("hwdec", if (hardware) "mediacodec" else "no")
            setOptionString("hwdec-codecs", "h264,hevc,mpeg4,mpeg2video,vp8,vp9,av1")
            // Certificates checked as the rest of the app checks them, with the device's own.
            if (certificates != null) {
                setOptionString("tls-verify", "yes")
                setOptionString("tls-ca-file", certificates.path)
            }
            setOptionString("user-agent", userAgent)
            setOptionString("http-header-fields", headers.entries.joinToString(",") { (name, value) -> "$name: ${escape(value)}" })
            setOptionString("cache", "yes")
            setOptionString("cache-pause-initial", "yes")
            setOptionString("demuxer-max-bytes", "64MiB")
            setOptionString("demuxer-max-back-bytes", "32MiB")
            setOptionString("sub-scale-with-window", "yes")
            setOptionString("sub-use-margins", "no")
            // Tracks only as picked, starting paused until told to play.
            setOptionString("sid", "no")
            setOptionString("pause", "yes")
            setOptionString("force-window", "no")
            setOptionString("keep-open", "always")
            setOptionString("save-position-on-quit", "no")
            setOptionString("ytdl", "no")
            setOptionString("audio-set-media-role", "yes")
            init()
            addObserver(this@MpvPlayer)
            addLogObserver(this@MpvPlayer)
            observeProperty("time-pos", MpvFormat.MPV_FORMAT_DOUBLE)
            observeProperty("duration", MpvFormat.MPV_FORMAT_DOUBLE)
            observeProperty("demuxer-cache-time", MpvFormat.MPV_FORMAT_DOUBLE)
            observeProperty("paused-for-cache", MpvFormat.MPV_FORMAT_FLAG)
            observeProperty("eof-reached", MpvFormat.MPV_FORMAT_FLAG)
            observeProperty("track-list", MpvFormat.MPV_FORMAT_STRING)
        }
        ContextCompat.registerReceiver(appContext, noisy, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    /** The audio stream to play, by its index in the file, or null for the one mpv picks. */
    fun selectAudio(index: Int?) {
        wantedAudio = index
        applyTracks()
    }

    /** The subtitle mpv draws, or null for none. */
    fun selectSubtitle(subtitle: MpvSubtitle?) {
        wantedSubtitle = subtitle
        applyTracks()
    }

    /** Moves subtitles by [seconds], for a stream that starts partway into the file. */
    fun setSubtitleDelay(seconds: Double) {
        if (released) return
        mpv.setPropertyDouble("sub-delay", seconds)
    }

    /** How much bigger than their own size subtitles draw. */
    fun setSubtitleScale(scale: Float) {
        if (released) return
        mpv.setPropertyDouble("sub-scale", scale.toDouble())
    }

    /**
     * The video filling the surface, cut at its edges, or shown whole. Its
     * subtitles keep to the screen either way.
     */
    fun setFill(fill: Boolean) {
        if (released) return
        mpv.setPropertyDouble("panscan", if (fill) 1.0 else 0.0)
        mpv.setPropertyString("sub-use-margins", if (fill) "yes" else "no")
        mpv.setPropertyString("sub-ass-force-margins", if (fill) "yes" else "no")
    }

    override fun getState(): State {
        val builder = State.Builder()
            .setAvailableCommands(COMMANDS)
            .setPlayWhenReady(playWhenReady, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
            .setPlaybackParameters(PlaybackParameters(speed))
            .setAudioAttributes(AUDIO_ATTRIBUTES)
            .setVideoSize(videoSize)
            .setNewlyRenderedFirstFrame(firstFrame)
        firstFrame = false
        val current = item ?: return builder.setPlaybackState(Player.STATE_IDLE).build()
        val state = when {
            failure != null || !prepared -> Player.STATE_IDLE
            ended -> Player.STATE_ENDED
            !loaded || !started || seeking || cacheWait -> Player.STATE_BUFFERING
            else -> Player.STATE_READY
        }
        return builder
            .setPlaylist(
                listOf(
                    MediaItemData.Builder(ITEM_UID)
                        .setMediaItem(current)
                        .setMediaMetadata(current.mediaMetadata)
                        .setDurationUs(if (durationMs == C.TIME_UNSET) C.TIME_UNSET else durationMs * 1000)
                        .setIsSeekable(true)
                        .build(),
                ),
            )
            .setCurrentMediaItemIndex(0)
            .setContentPositionMs { pendingSeekMs ?: positionMs }
            .setContentBufferedPositionMs { maxOf(positionMs, bufferedMs) }
            .setPlaybackState(state)
            .setPlayerError(failure)
            .build()
    }

    override fun handleSetMediaItems(mediaItems: List<MediaItem>, startIndex: Int, startPositionMs: Long): ListenableFuture<*> {
        item = mediaItems.getOrNull(startIndex) ?: mediaItems.firstOrNull()
        startMs = if (startPositionMs == C.TIME_UNSET) 0L else startPositionMs
        positionMs = startMs
        bufferedMs = 0L
        durationMs = C.TIME_UNSET
        // A player already going opens the next file at once, as ExoPlayer does.
        if (prepared) load() else failure = null
        return Futures.immediateVoidFuture()
    }

    override fun handlePrepare(): ListenableFuture<*> {
        if (item != null) load()
        return Futures.immediateVoidFuture()
    }

    override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
        this.playWhenReady = playWhenReady
        if (playWhenReady) audioManager?.requestAudioFocus(focus)
        mpv.setPropertyBoolean("pause", !playWhenReady)
        return Futures.immediateVoidFuture()
    }

    override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
        val target = if (positionMs == C.TIME_UNSET) 0L else positionMs
        this.positionMs = target
        ended = false
        if (loaded) {
            seeking = true
            mpv.command(arrayOf("seek", seconds(target), "absolute+exact"))
        } else {
            startMs = target
            if (prepared) pendingSeekMs = target
        }
        // At the end mpv pauses by itself; seeking back plays on if asked to.
        mpv.setPropertyBoolean("pause", !playWhenReady)
        return Futures.immediateVoidFuture()
    }

    override fun handleSetPlaybackParameters(playbackParameters: PlaybackParameters): ListenableFuture<*> {
        speed = playbackParameters.speed
        mpv.setPropertyDouble("speed", speed.toDouble())
        return Futures.immediateVoidFuture()
    }

    override fun handleStop(): ListenableFuture<*> {
        expectEnd = fileOpen
        mpv.command(arrayOf("stop"))
        prepared = false
        loaded = false
        return Futures.immediateVoidFuture()
    }

    override fun handleRelease(): ListenableFuture<*> {
        released = true
        audioManager?.abandonAudioFocusRequest(focus)
        runCatching { appContext.unregisterReceiver(noisy) }
        holder?.removeCallback(surfaceCallback)
        holder = null
        mpv.removeObserver(this)
        mpv.removeLogObserver(this)
        mpv.destroy()
        return Futures.immediateVoidFuture()
    }

    override fun handleSetVideoOutput(videoOutput: Any): ListenableFuture<*> {
        when (videoOutput) {
            is SurfaceView -> attachHolder(videoOutput.holder)
            is SurfaceHolder -> attachHolder(videoOutput)
            is Surface -> attach(videoOutput)
        }
        return Futures.immediateVoidFuture()
    }

    override fun handleClearVideoOutput(videoOutput: Any?): ListenableFuture<*> {
        val matches = videoOutput == null || videoOutput == surface || videoOutput == holder ||
            (videoOutput is SurfaceView && videoOutput.holder == holder)
        if (matches) {
            holder?.removeCallback(surfaceCallback)
            holder = null
            detach()
        }
        return Futures.immediateVoidFuture()
    }

    private fun load() {
        val uri = item?.localConfiguration?.uri ?: return
        failure = null
        ended = false
        loaded = false
        started = false
        seeking = false
        pendingSeekMs = null
        expectEnd = fileOpen
        tracks = emptyList()
        added.clear()
        mpv.setPropertyString("start", seconds(startMs))
        mpv.command(arrayOf("loadfile", if (uri.scheme == "file") uri.path.orEmpty() else uri.toString(), "replace"))
        prepared = true
    }

    private fun attachHolder(next: SurfaceHolder) {
        if (next == holder) return
        holder?.removeCallback(surfaceCallback)
        holder = next
        next.addCallback(surfaceCallback)
        if (next.surface?.isValid == true) {
            attach(next.surface)
            val frame = next.surfaceFrame
            mpv.setPropertyString("android-surface-size", "${frame.width()}x${frame.height()}")
        }
    }

    private fun attach(next: Surface) {
        surface = next
        mpv.attachSurface(next)
        mpv.setOptionString("force-window", "yes")
        mpv.setOptionString("vo", VIDEO_OUTPUT)
    }

    private fun detach() {
        if (surface == null) return
        surface = null
        mpv.setOptionString("vo", "null")
        mpv.setOptionString("force-window", "no")
        mpv.detachSurface()
    }

    private val surfaceCallback = object : SurfaceHolder.Callback {
        override fun surfaceCreated(holder: SurfaceHolder) = attach(holder.surface)

        override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
            mpv.setPropertyString("android-surface-size", "${width}x$height")
        }

        override fun surfaceDestroyed(holder: SurfaceHolder) = detach()
    }

    /** Picks the wanted tracks among the file's once it has them, and adds a subtitle file once. */
    private fun applyTracks() {
        if (!loaded || released) return
        val audio = wantedAudio?.let { index -> tracks.firstOrNull { it.type == "audio" && !it.external && it.ffIndex == index } }
        if (audio == null) {
            mpv.setPropertyString("aid", "auto")
        } else if (!audio.selected) {
            mpv.setPropertyString("aid", audio.id.toString())
        }
        val subtitles = tracks.filter { it.type == "sub" }
        val subtitle = when (val wanted = wantedSubtitle) {
            null -> null
            is MpvSubtitle.Stream -> subtitles.firstOrNull { !it.external && it.ffIndex == wanted.index }
            is MpvSubtitle.External -> subtitles.firstOrNull { it.externalFilename == wanted.url } ?: run {
                if (added.add(wanted.url)) mpv.command(arrayOf("sub-add", wanted.url, "select"))
                return
            }
        }
        if (subtitle == null) {
            if (subtitles.any { it.selected }) mpv.setPropertyString("sid", "no")
        } else if (!subtitle.selected) {
            mpv.setPropertyString("sid", subtitle.id.toString())
        }
    }

    private fun post(block: () -> Unit) {
        main.post { if (!released) block() }
    }

    override fun eventProperty(property: String) = Unit

    override fun eventProperty(property: String, value: Long) = Unit

    override fun eventProperty(property: String, value: Double) = post {
        val ms = (value * 1000).toLong()
        when (property) {
            // A seek on its way still shows where it goes.
            "time-pos" -> if (!seeking && pendingSeekMs == null) positionMs = ms
            "demuxer-cache-time" -> bufferedMs = ms
            "duration" -> if (ms != durationMs) {
                durationMs = ms
                invalidateState()
            }
        }
    }

    override fun eventProperty(property: String, value: Boolean) = post {
        when (property) {
            "paused-for-cache" -> cacheWait = value
            "eof-reached" -> ended = value && loaded
            else -> return@post
        }
        invalidateState()
    }

    override fun eventProperty(property: String, value: String) = post {
        if (property == "track-list") {
            tracks = parseTracks(value)
            applyTracks()
        }
    }

    override fun event(eventId: Int) = post {
        when (eventId) {
            MpvEvent.MPV_EVENT_START_FILE -> fileOpen = true
            MpvEvent.MPV_EVENT_FILE_LOADED -> {
                loaded = true
                pendingSeekMs?.let { at ->
                    pendingSeekMs = null
                    positionMs = at
                    seeking = true
                    mpv.command(arrayOf("seek", seconds(at), "absolute+exact"))
                }
                applyTracks()
            }
            MpvEvent.MPV_EVENT_SEEK -> seeking = true
            MpvEvent.MPV_EVENT_PLAYBACK_RESTART -> {
                seeking = false
                if (!started) {
                    started = true
                    firstFrame = true
                }
            }
            MpvEvent.MPV_EVENT_VIDEO_RECONFIG -> {
                val width = mpv.getPropertyInt("dwidth") ?: 0
                val height = mpv.getPropertyInt("dheight") ?: 0
                videoSize = if (width > 0 && height > 0) VideoSize(width, height) else VideoSize.UNKNOWN
            }
            MpvEvent.MPV_EVENT_END_FILE -> {
                fileOpen = false
                // With keep-open, a file ends only for the next one, a stop, or a failure.
                if (expectEnd) {
                    expectEnd = false
                } else if (prepared) {
                    prepared = false
                    loaded = false
                    failure = PlaybackException(
                        lastError ?: "mpv couldn't play the file",
                        null,
                        PlaybackException.ERROR_CODE_IO_UNSPECIFIED,
                    )
                }
            }
            else -> return@post
        }
        invalidateState()
    }

    override fun logMessage(prefix: String, level: Int, text: String) {
        if (level > MpvLogLevel.MPV_LOG_LEVEL_WARN) return
        val line = "[$prefix] ${text.trim()}"
        if (level <= MpvLogLevel.MPV_LOG_LEVEL_ERROR) lastError = line
        Log.w(TAG, line)
    }

    private fun pauseForSystem(resume: Boolean) {
        if (released || !playWhenReady) return
        resumeOnFocus = resume
        pause()
    }

    private fun writeFontsConf(config: File) {
        val file = File(config, "fonts.conf")
        if (file.exists()) return
        val cache = File(appContext.cacheDir, "fontconfig").apply { mkdirs() }
        try {
            file.writeText(
                """
                <fontconfig>
                    <dir>/system/fonts/</dir>
                    <dir>/product/fonts/</dir>
                    <cachedir>${cache.path}</cachedir>
                    <alias><family>sans-serif</family><prefer><family>Roboto</family><family>Noto Sans</family></prefer></alias>
                    <alias><family>serif</family><prefer><family>Noto Serif</family></prefer></alias>
                    <alias><family>monospace</family><prefer><family>Droid Sans Mono</family></prefer></alias>
                </fontconfig>
                """.trimIndent(),
            )
        } catch (e: IOException) {
            Log.w(TAG, "fonts.conf: $e")
        }
    }

    /**
     * The certificates the device trusts, its own and those the user added,
     * as one PEM file for mpv's TLS. Null when the store can't be read, and
     * mpv then connects without checking.
     */
    private fun writeCertificates(cache: File): File? = try {
        val store = KeyStore.getInstance("AndroidCAStore").apply { load(null) }
        val pem = buildString {
            for (alias in store.aliases()) {
                val certificate = store.getCertificate(alias) as? X509Certificate ?: continue
                append("-----BEGIN CERTIFICATE-----\n")
                append(Base64.encodeToString(certificate.encoded, Base64.DEFAULT))
                append("-----END CERTIFICATE-----\n")
            }
        }
        File(cache, "cacerts.pem").apply { writeText(pem) }.takeIf { pem.isNotEmpty() }
    } catch (e: Exception) {
        Log.w(TAG, "certificates: $e")
        null
    }

    private data class MpvTrack(
        val id: Int,
        val type: String,
        val ffIndex: Int?,
        val external: Boolean,
        val externalFilename: String?,
        val selected: Boolean,
    )

    private fun parseTracks(json: String): List<MpvTrack> = try {
        val list = JSONArray(json)
        (0 until list.length()).map { i ->
            val track = list.getJSONObject(i)
            MpvTrack(
                id = track.getInt("id"),
                type = track.optString("type"),
                ffIndex = if (track.has("ff-index")) track.getInt("ff-index") else null,
                external = track.optBoolean("external"),
                externalFilename = track.optString("external-filename").ifEmpty { null },
                selected = track.optBoolean("selected"),
            )
        }
    } catch (_: JSONException) {
        emptyList()
    }

    private companion object {
        const val TAG = "mpv"
        const val VIDEO_OUTPUT = "gpu-next"
        const val ITEM_UID = "item"

        val COMMANDS: Player.Commands = Player.Commands.Builder()
            .addAll(
                Player.COMMAND_PLAY_PAUSE,
                Player.COMMAND_PREPARE,
                Player.COMMAND_STOP,
                Player.COMMAND_RELEASE,
                Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM,
                Player.COMMAND_SEEK_TO_DEFAULT_POSITION,
                Player.COMMAND_SET_SPEED_AND_PITCH,
                Player.COMMAND_SET_MEDIA_ITEM,
                Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
                Player.COMMAND_GET_TIMELINE,
                Player.COMMAND_GET_METADATA,
                Player.COMMAND_GET_AUDIO_ATTRIBUTES,
                Player.COMMAND_SET_VIDEO_SURFACE,
            )
            .build()

        val AUDIO_ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build()

        fun seconds(ms: Long): String = String.format(Locale.ROOT, "%.3f", ms / 1000.0)

        /** A value in mpv's comma-separated list, with its commas kept. */
        fun escape(value: String): String = value.replace("\\", "\\\\").replace(",", "\\,")
    }
}
