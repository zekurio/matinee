package io.github.zekurio.matinee.ui.player

import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.C
import androidx.media3.common.MediaItem as ExoItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import io.github.zekurio.matinee.api.AudioTrack
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.PlaybackOptions
import io.github.zekurio.matinee.api.SubtitleTrack
import io.github.zekurio.matinee.api.Trickplay
import io.github.zekurio.matinee.api.await
import io.github.zekurio.matinee.downloads.PendingProgress
import io.github.zekurio.matinee.downloads.PendingReport
import java.io.File
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Where the video comes from, as the web player has it: the file as it is,
 * with byte ranges and ExoPlayer's own seeking; a stream of the copied video
 * with one audio track that starts [Stream.offset] seconds into the file;
 * or an encode as HLS on the file's timeline.
 */
sealed interface Source {
    data object Direct : Source

    data class Stream(val audio: Int, val offset: Double) : Source

    data class Hls(val audio: Int, val quality: String, val subtitle: String?) : Source

    /** A download on the phone, which plays without the server. */
    data object Local : Source
}

/**
 * ExoPlayer's renderers, trying the hardware decoders first as Android lists
 * them, or the software ones when settings say so. Either way a decoder that
 * fails to start hands over to the next.
 */
@OptIn(UnstableApi::class)
private fun renderers(context: Context, decoders: Decoders): DefaultRenderersFactory {
    val factory = DefaultRenderersFactory(context).setEnableDecoderFallback(true)
    if (decoders == Decoders.SOFTWARE) {
        factory.setMediaCodecSelector { mime, secure, tunneling ->
            MediaCodecSelector.DEFAULT.getDecoderInfos(mime, secure, tunneling).sortedByDescending { it.softwareOnly }
        }
    }
    return factory
}

/**
 * Plays one file: picks the source, follows the viewer's audio, subtitle,
 * and quality picks, falls back when the device can't play what came, and
 * reports progress for Continue watching and the statistics.
 */
class PlayerController(
    context: Context,
    private val api: MatineeApi,
    private val http: OkHttpClient,
    val item: MediaItem,
    val audioTracks: List<AudioTrack>,
    val subtitles: List<SubtitleTrack>,
    private val options: PlaybackOptions,
    initialAudio: AudioTrack?,
    initialSubtitle: SubtitleTrack?,
    initialQuality: String,
    /** This device's settings: codecs, converted formats, and decoders. */
    private val prefs: PlayerPrefs,
    /** The downloaded file, which plays instead of anything from the server. */
    private val local: File? = null,
    /** Subtitles saved beside the download, by track id. */
    private val localSubtitles: Map<String, File> = emptyMap(),
    /** Where reports that don't reach the server wait. */
    private val pending: PendingProgress? = null,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val sessionId = UUID.randomUUID().toString()

    val player: ExoPlayer = ExoPlayer.Builder(context, renderers(context, prefs.decoders))
        // Files on the phone, and the server through the session's client.
        .setMediaSourceFactory(DefaultMediaSourceFactory(DefaultDataSource.Factory(context, OkHttpDataSource.Factory(http))))
        .build()
        .apply {
            // Subtitles are drawn by the player screen from the server's WebVTT.
            trackSelectionParameters = trackSelectionParameters.buildUpon()
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                .build()
        }

    var source by mutableStateOf<Source?>(null)
        private set
    var audio by mutableStateOf(initialAudio)
        private set
    var subtitle by mutableStateOf(initialSubtitle)
        private set
    var cues by mutableStateOf<CueTrack?>(null)
        private set
    var subtitleError by mutableStateOf(false)
        private set
    var quality by mutableStateOf(initialQuality)
        private set
    var speed by mutableFloatStateOf(1f)
        private set
    var position by mutableDoubleStateOf(0.0)
        private set
    var buffered by mutableDoubleStateOf(0.0)
        private set
    var playing by mutableStateOf(false)
        private set
    var loading by mutableStateOf(true)
        private set
    var ended by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var trickplay by mutableStateOf<Trickplay?>(null)
        private set

    val duration: Double
        get() = item.durationSeconds
            ?: player.duration.takeIf { it != C.TIME_UNSET }?.let { it / 1000.0 + offset }
            ?: 0.0

    private val offset get() = (source as? Source.Stream)?.offset ?: 0.0
    private val videoPlays = item.probe?.video?.let(Capabilities::decodesVideo) ?: true
    private val containerPlays = Capabilities.playsContainer(item.container)
    private val audioCodecs = Capabilities.streamAudioCodecs(prefs)
    private val videoCodecs = Capabilities.encodeVideoCodecs(options.videoCodecs, prefs)

    /** Set once a source failed, so the next try asks the server for more. */
    private var noDirect = false
    private var noStream = false
    private var pendingAudioOverride = false
    private var playedSeconds = 0.0
    private var lastReport = 0L
    private var loadJob: Job? = null

    init {
        player.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                playing = isPlaying
                report()
            }

            override fun onPlaybackStateChanged(state: Int) {
                loading = state == Player.STATE_BUFFERING || state == Player.STATE_IDLE
                if (state == Player.STATE_ENDED) {
                    ended = true
                    report()
                }
            }

            override fun onTracksChanged(tracks: Tracks) {
                if (pendingAudioOverride) applyAudioOverride(tracks)
            }

            override fun onPlayerError(e: PlaybackException) {
                fallBack(e)
            }
        })
        scope.launch { tick() }
        scope.launch { loadTrickplay() }
        subtitle?.let { loadCues(it) }
    }

    /** Start at [at] seconds into the file. */
    fun start(at: Double) {
        load(plan(), at)
        player.playWhenReady = true
    }

    /** Plays a download, which offers no other qualities. */
    val isLocal get() = local != null

    private fun plan(): Source {
        if (local != null) return Source.Local
        val track = audio
        val burnIn = subtitle?.takeIf { !drawable(it) }
        if (burnIn != null || quality != ORIGINAL_QUALITY || !videoPlays || (noDirect && noStream)) {
            val encode = if (quality == ORIGINAL_QUALITY) fallbackQuality(item.probe?.video?.width) else quality
            return Source.Hls(track?.index ?: 0, encode, burnIn?.id)
        }
        val audioPlays = track == null || Capabilities.takesAudio(track.codec, prefs)
        if (containerPlays && audioPlays && !noDirect) return Source.Direct
        return Source.Stream(track?.index ?: 0, 0.0)
    }

    private fun load(next: Source, at: Double) {
        loadJob?.cancel()
        error = null
        ended = false
        loadJob = scope.launch {
            val resolved = when (next) {
                is Source.Stream -> {
                    // A copied video starts on a keyframe; begin at the one before.
                    val start = if (at <= 0.5) 0.0 else try {
                        api.keyframes(item.id, at).before
                    } catch (_: IOException) {
                        at
                    }
                    next.copy(offset = start)
                }
                else -> next
            }
            source = resolved
            position = at
            val paths = api.paths
            val exo = when (resolved) {
                Source.Direct -> ExoItem.Builder().setUri(paths.stream(item.id)).build()
                is Source.Stream -> ExoItem.Builder()
                    .setUri(paths.play(item.id, resolved.audio, resolved.offset, ORIGINAL_QUALITY, audioCodecs, videoCodecs, sessionId))
                    .setMimeType(MimeTypes.VIDEO_MP4)
                    .build()
                is Source.Hls -> ExoItem.Builder()
                    .setUri(paths.hls(item.id, resolved.audio, resolved.quality, at, audioCodecs, videoCodecs, sessionId, resolved.subtitle))
                    .setMimeType(MimeTypes.APPLICATION_M3U8)
                    .build()
                Source.Local -> ExoItem.Builder().setUri(Uri.fromFile(checkNotNull(local))).build()
            }
            val startMs = when (resolved) {
                is Source.Stream -> 0L
                else -> (at * 1000).toLong()
            }
            pendingAudioOverride = resolved == Source.Direct || resolved == Source.Local
            player.setMediaItem(exo, startMs)
            player.prepare()
        }
    }

    /** Pick the audio track inside the file, for the file as it is. */
    private fun applyAudioOverride(tracks: Tracks) {
        val wanted = audio ?: return
        val groups = tracks.groups.filter { it.type == C.TRACK_TYPE_AUDIO }
        if (groups.isEmpty()) return
        pendingAudioOverride = false
        // Matroska and MP4 number tracks from 1 in file order, as ffprobe's indexes from 0.
        val ordinal = audioTracks.indexOf(wanted)
        val group = groups.firstOrNull { it.mediaTrackGroup.length > 0 && it.mediaTrackGroup.getFormat(0).id == "${wanted.index + 1}" }
            ?: groups.getOrNull(ordinal)
            ?: return
        player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
            .setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, 0))
            .build()
    }

    /** What didn't play falls back to what asks more of the server: the file, a stream, an encode. */
    private fun fallBack(e: PlaybackException) {
        val at = position
        when (source) {
            Source.Direct -> {
                noDirect = true
                load(plan(), at)
            }
            is Source.Stream -> {
                noDirect = true
                noStream = true
                load(plan(), at)
            }
            // A download or an encode has nothing further to fall back to.
            else -> error = e.errorCodeName.takeIf { e.cause == null } ?: (e.cause?.message ?: e.errorCodeName)
        }
    }

    fun retry() {
        noDirect = false
        noStream = false
        load(plan(), position)
        player.playWhenReady = true
    }

    fun togglePlay() {
        if (ended) {
            seekTo(0.0)
            player.play()
            return
        }
        if (player.isPlaying) player.pause() else player.play()
    }

    fun seekTo(seconds: Double) {
        val target = seconds.coerceIn(0.0, maxOf(duration - 1, 0.0))
        ended = false
        when (val current = source) {
            is Source.Stream -> load(current, target)
            null -> Unit
            else -> {
                player.seekTo((target * 1000).toLong())
                position = target
            }
        }
        report()
    }

    fun skip(seconds: Double) = seekTo(position + seconds)

    fun pickAudio(track: AudioTrack) {
        if (track == audio) return
        audio = track
        val current = source
        // A download holds only its own tracks, so it picks among them whatever plays.
        if (current == Source.Local || (current == Source.Direct && Capabilities.takesAudio(track.codec, prefs))) {
            pendingAudioOverride = true
            applyAudioOverride(player.currentTracks)
        } else {
            noStream = false
            load(plan(), position)
        }
    }

    fun pickSubtitle(track: SubtitleTrack?) {
        val before = subtitle
        subtitle = track
        cues = null
        subtitleError = false
        if (track != null && drawable(track)) loadCues(track)
        // A burned-in track comes with its own encode, and leaving one goes back.
        val burnedBefore = before != null && !drawable(before)
        val burnNow = track != null && !drawable(track)
        if (burnedBefore || burnNow) load(plan(), position)
    }

    fun pickQuality(id: String) {
        if (id == quality || isLocal) return
        quality = id
        noDirect = false
        noStream = false
        load(plan(), position)
    }

    fun pickSpeed(rate: Float) {
        speed = rate
        player.setPlaybackSpeed(rate)
    }

    private fun loadCues(track: SubtitleTrack) {
        scope.launch {
            try {
                val saved = localSubtitles[track.id]
                val text = if (saved != null) withContext(Dispatchers.IO) { saved.readText() } else withContext(Dispatchers.IO) {
                    http.newCall(Request.Builder().url(api.paths.subtitle(item.id, track.id)).build()).await().use {
                        if (!it.isSuccessful) throw IOException("HTTP ${it.code}")
                        it.body.string()
                    }
                }
                val parsed = withContext(Dispatchers.Default) { CueTrack.parse(text) }
                if (subtitle == track) cues = parsed
            } catch (_: IOException) {
                if (subtitle == track) subtitleError = true
            }
        }
    }

    private suspend fun loadTrickplay() {
        try {
            api.trickplay(item.id).collect { status -> if (status.images != null) trickplay = status.images }
        } catch (_: IOException) {
            // The seek bar does without previews.
        }
    }

    /** Follows the position for the screen and counts the time spent playing. */
    private suspend fun tick() {
        var last = System.nanoTime()
        while (scope.isActive) {
            delay(250)
            val now = System.nanoTime()
            if (player.isPlaying) playedSeconds += (now - last) / 1e9 * speed
            last = now
            if (player.playbackState != Player.STATE_IDLE) {
                position = offset + player.currentPosition / 1000.0
                buffered = offset + player.bufferedPosition / 1000.0
            }
            val every = if (player.isPlaying) 10_000 else 30_000
            if (System.currentTimeMillis() - lastReport >= every) report()
        }
    }

    /** Tell the server where the viewer is; on play, pause, seek, close, and every so often. */
    fun report(closed: Boolean = false) {
        if (source == null) return
        lastReport = System.currentTimeMillis()
        val at = position
        val length = item.durationSeconds ?: duration.takeIf { it > 0 }
        val played = playedSeconds
        val paused = !player.isPlaying
        val send: suspend () -> Unit = {
            try {
                api.report(item.id, at, length, sessionId, played, paused, closed)
                pending?.drop(item.id)
            } catch (_: IOException) {
                // Offline, as when watching a download: send it once the server answers.
                pending?.put(item.id, PendingReport(at, length))
            }
        }
        if (closed) CoroutineScope(Dispatchers.IO + NonCancellable).launch { send() } else scope.launch { send() }
    }

    fun release() {
        report(closed = true)
        scope.cancel()
        player.release()
    }
}
