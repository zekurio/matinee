package io.github.zekurio.matinee.ui.player

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.accessibility.CaptioningManager
import androidx.annotation.OptIn
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem as ExoItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.VideoSize
import androidx.media3.common.text.CueGroup
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSourceBitmapLoader
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import io.github.zekurio.matinee.PlaybackService
import io.github.zekurio.matinee.PlayerActivity
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.AudioTrack
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.OfflinePlay
import io.github.zekurio.matinee.api.PlaybackOptions
import io.github.zekurio.matinee.api.SubtitleDelivery
import io.github.zekurio.matinee.api.SubtitleTrack
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.Trickplay
import io.github.zekurio.matinee.api.await
import io.github.zekurio.matinee.downloads.PendingProgress
import io.github.zekurio.matinee.downloads.PendingReport
import io.github.zekurio.matinee.ui.itemLabel
import java.io.File
import java.io.IOException
import java.time.Instant
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

/** What the video's sound is, for audio focus and the system's routing. */
private val MOVIE_AUDIO = AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build()

/**
 * ExoPlayer's renderers, trying the hardware decoders first as Android lists
 * them, or the software ones when settings say so. Either way a decoder that
 * fails to start hands over to the next.
 */
@OptIn(UnstableApi::class)
private fun renderers(context: Context, decoders: Decoders): DefaultRenderersFactory {
    val factory = DefaultRenderersFactory(context)
        .setEnableDecoderFallback(true)
        // FFmpeg's audio decoders after the device's own: DTS and TrueHD,
        // which Android has none for, play without the server converting them.
        .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
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
    /** What mpv sends the server, which doesn't go through [http]: the session's token. */
    serverHeaders: Map<String, String> = emptyMap(),
    userAgent: String = "Matinee",
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val sessionId = UUID.randomUUID().toString()

    /** When this sitting with the file began, for a play kept offline. */
    private val startedAt = Instant.now()

    private val appContext = context.applicationContext
    private val resources = context.resources

    /** ExoPlayer, or mpv when settings pick it. */
    val player: Player = if (prefs.engine == PlayerEngine.MPV) {
        MpvPlayer(context, serverHeaders, userAgent, hardware = prefs.decoders == Decoders.HARDWARE)
    } else {
        ExoPlayer.Builder(context, renderers(context, prefs.decoders))
            // Files on the phone, and the server through the session's client.
            .setMediaSourceFactory(DefaultMediaSourceFactory(DefaultDataSource.Factory(context, OkHttpDataSource.Factory(http))))
            // Pauses for a call or another app's sound, and when headphones come out.
            .setAudioAttributes(MOVIE_AUDIO, true)
            .setHandleAudioBecomingNoisy(true)
            .build()
            .apply {
                // Subtitles are drawn by the player screen from the server's WebVTT,
                // but for picture tracks in the file itself; see applyTextOverride.
                trackSelectionParameters = trackSelectionParameters.buildUpon()
                    .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                    .build()
            }
    }
    private val mpv = player as? MpvPlayer

    /** mpv plays the video, which draws it to fill the screen itself. */
    val usesMpv get() = mpv != null

    /**
     * The system's handle on this player: its controls in the notification
     * shade, on the lock screen, and on headsets. Artwork comes through the
     * session's client, which sends the token. Tapping the notification
     * brings the player back.
     */
    private val session = MediaSession.Builder(context, player)
        .setId(sessionId)
        .setSessionActivity(
            PendingIntent.getActivity(
                context,
                0,
                Intent(context, PlayerActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            ),
        )
        .setBitmapLoader(DataSourceBitmapLoader.Builder(context).setDataSourceFactory(OkHttpDataSource.Factory(http)).build())
        .build()
    private val controls = PlaybackService.start(appContext, session)

    var source by mutableStateOf<Source?>(null)
        private set
    var audio by mutableStateOf(initialAudio)
        private set
    var subtitle by mutableStateOf(initialSubtitle)
        private set
    var cues by mutableStateOf<CueTrack?>(null)
        private set

    /** The track [cues] are for, or loading for. */
    private var cuesFor: SubtitleTrack? = null

    /** What a picture track in the file shows now, as ExoPlayer draws it from the file itself. */
    var pictureCues by mutableStateOf<List<androidx.media3.common.text.Cue>>(emptyList())
        private set

    /** The video's shape, width over height, for placing picture subtitles on it. */
    var videoAspect by mutableFloatStateOf(16f / 9f)
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

    // mpv plays every codec and container with FFmpeg, so the file goes as it is.
    private val videoPlays = mpv != null || item.probe?.video?.let(Capabilities::decodesVideo) ?: true
    private val containerPlays = mpv != null || Capabilities.playsContainer(item.container)

    private fun takesAudio(track: AudioTrack?) = track == null || mpv != null || Capabilities.takesAudio(track.codec, prefs)
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
                applyTextOverride(tracks)
            }

            override fun onCues(cueGroup: CueGroup) {
                pictureCues = cueGroup.cues.filter { it.bitmap != null }
            }

            override fun onVideoSizeChanged(videoSize: VideoSize) {
                if (videoSize.width > 0 && videoSize.height > 0) {
                    videoAspect = videoSize.width * videoSize.pixelWidthHeightRatio / videoSize.height
                }
            }

            override fun onPlayerError(e: PlaybackException) {
                fallBack(e)
            }
        })
        scope.launch { tick() }
        scope.launch { loadTrickplay() }
        mpv?.setSubtitleScale(
            if (prefs.subtitleSystemStyle) context.getSystemService(CaptioningManager::class.java)?.fontScale ?: 1f else prefs.subtitleScale,
        )
        showSubtitle()
    }

    /** Start at [at] seconds into the file. */
    fun start(at: Double) {
        load(plan(), at)
        player.playWhenReady = true
    }

    /** Plays a download, which offers no other qualities. */
    val isLocal get() = local != null

    /**
     * Whether the file itself plays, as it does unless something needs the
     * server: a lower quality, video or audio this device doesn't decode, a
     * container ExoPlayer doesn't read, or a try that failed.
     */
    private fun directPlays(): Boolean =
        quality == ORIGINAL_QUALITY && videoPlays && containerPlays && !noDirect && takesAudio(audio)

    /**
     * Whether the player draws [track] itself rather than the screen or the
     * server: a picture track, like PGS, inside the file, while the file
     * itself plays, which then needs no burning in; a download that's the
     * file as it is holds them too. mpv also draws ASS inside the file, with
     * its styling and fonts, and PGS files beside it.
     */
    fun playerDraws(track: SubtitleTrack?): Boolean {
        if (track == null) return false
        val filePlays = local != null || directPlays()
        return when {
            pictureInFile(track) -> filePlays
            mpv == null -> false
            styledInFile(track) -> filePlays
            else -> track.source == "sidecar" && track.delivery == SubtitleDelivery.PGS && local == null
        }
    }

    /** What [track] needs to show: drawn by the screen, by ExoPlayer, or burned in by the server. */
    private fun burns(track: SubtitleTrack?): Boolean = track != null && !drawable(track) && !playerDraws(track)

    private fun plan(): Source {
        if (local != null) return Source.Local
        val track = audio
        val burnIn = subtitle?.takeIf(::burns)
        if (burnIn != null || quality != ORIGINAL_QUALITY || !videoPlays || (noDirect && noStream)) {
            val encode = if (quality == ORIGINAL_QUALITY) fallbackQuality(item.probe?.video?.width) else quality
            return Source.Hls(track?.index ?: 0, encode, burnIn?.id)
        }
        if (containerPlays && takesAudio(track) && !noDirect) return Source.Direct
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
            val fileTracks = resolved == Source.Direct || resolved == Source.Local
            pendingAudioOverride = mpv == null && fileTracks
            mpv?.selectAudio(audio?.index?.takeIf { fileTracks })
            mpv?.setSubtitleDelay(-((resolved as? Source.Stream)?.offset ?: 0.0))
            player.setMediaItem(exo.buildUpon().setMediaMetadata(metadata()).build(), startMs)
            player.prepare()
            showSubtitle()
        }
    }

    /**
     * Shows the subtitle picked the way the source needs: the screen draws
     * text from the server's WebVTT, the player what [playerDraws], and an
     * encode brings a burned-in one along.
     */
    private fun showSubtitle() {
        val track = subtitle
        if (track != null && drawable(track) && !playerDraws(track)) {
            if (cuesFor != track) loadCues(track)
        } else {
            cues = null
            cuesFor = null
        }
        val mpv = mpv
        if (mpv != null) mpv.selectSubtitle(mpvSubtitle()) else applyTextOverride(player.currentTracks)
    }

    /** What mpv draws of the subtitle picked: a stream in the file, or a PGS file from the server. */
    private fun mpvSubtitle(): MpvSubtitle? {
        val track = subtitle?.takeIf(::playerDraws) ?: return null
        if (track.source == "embedded") return track.id.removePrefix("stream-").toIntOrNull()?.let(MpvSubtitle::Stream)
        return MpvSubtitle.External(api.paths.subtitle(item.id, track.id))
    }

    /** Fills the screen with the video, cut at its edges, or shows it whole; mpv does it itself. */
    fun showFilled(fill: Boolean) {
        mpv?.setFill(fill)
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

    /**
     * Lets ExoPlayer draw the picture track picked, from the file it plays,
     * and keeps its text output off otherwise: the screen draws text tracks
     * from the server's WebVTT, styled the viewer's way.
     */
    private fun applyTextOverride(tracks: Tracks) {
        val wanted = subtitle?.takeIf(::playerDraws)
        val index = wanted?.id?.removePrefix("stream-")?.toIntOrNull()
        val builder = player.trackSelectionParameters.buildUpon().clearOverridesOfType(C.TRACK_TYPE_TEXT)
        val group = index?.let { i ->
            // Matroska numbers its tracks from 1 in file order, as ffprobe's indexes from 0.
            tracks.groups.firstOrNull {
                it.type == C.TRACK_TYPE_TEXT && it.mediaTrackGroup.length > 0 && it.mediaTrackGroup.getFormat(0).id == "${i + 1}"
            }
        }
        val next = if (group != null) {
            builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false).setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, 0))
        } else {
            builder.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
        }.build()
        if (next != player.trackSelectionParameters) player.trackSelectionParameters = next
        if (group == null) pictureCues = emptyList()
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
        if (current == Source.Local || (current == Source.Direct && takesAudio(track))) {
            val mpv = mpv
            if (mpv != null) {
                mpv.selectAudio(track.index)
            } else {
                pendingAudioOverride = true
                applyAudioOverride(player.currentTracks)
            }
        } else {
            noStream = false
            load(plan(), position)
        }
    }

    fun pickSubtitle(track: SubtitleTrack?) {
        val before = subtitle
        subtitle = track
        cues = null
        cuesFor = null
        pictureCues = emptyList()
        subtitleError = false
        // A burned-in track comes with its own encode, and leaving one goes back.
        val burnedBefore = before != null && burns(before)
        val burnNow = track != null && burns(track)
        if (burnedBefore || burnNow) load(plan(), position) else showSubtitle()
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
        cuesFor = track
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
                pending?.dropPlay(sessionId)
            } catch (_: IOException) {
                // Offline, as when watching a download: send it once the server answers.
                pending?.put(item.id, PendingReport(at, length))
                // The sitting so far, for watch time, under this session's id.
                if (played > 0) {
                    pending?.putPlay(
                        OfflinePlay(sessionId, item.id, startedAt.toString(), Instant.now().toString(), played, at, length),
                    )
                }
            }
        }
        if (closed) CoroutineScope(Dispatchers.IO + NonCancellable).launch { send() } else scope.launch { send() }
    }

    /** What the system's controls show: the episode and its show, or the movie, and its picture. */
    private fun metadata(): MediaMetadata {
        val label = itemLabel(item, resources)
        val artwork = item.episode?.still ?: item.title?.images?.backdrop ?: item.title?.images?.poster
        return MediaMetadata.Builder()
            .setTitle(label.title)
            .setArtist(if (item.title?.kind == TitleKind.SHOW) listOfNotNull(label.showName, label.code).joinToString(" · ") else label.year)
            .setArtworkUri(artwork?.let { Uri.parse(api.paths.artwork(it.id, ArtworkSize.Small)) })
            .build()
    }

    fun release() {
        report(closed = true)
        PlaybackService.stop(appContext, controls)
        session.release()
        scope.cancel()
        player.release()
    }
}
