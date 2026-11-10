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
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import io.github.zekurio.matinee.PlaybackService
import io.github.zekurio.matinee.PlayerActivity
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ApiException
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.AudioTrack
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.OfflinePlay
import io.github.zekurio.matinee.api.PLAYBACK_UNPLAYABLE
import io.github.zekurio.matinee.api.PlaybackDevice
import io.github.zekurio.matinee.api.PlaybackOptions
import io.github.zekurio.matinee.api.PlaybackQualityPreset
import io.github.zekurio.matinee.api.PlaybackSeekInput
import io.github.zekurio.matinee.api.PlaybackSnap
import io.github.zekurio.matinee.api.PlaybackStart
import io.github.zekurio.matinee.api.SubtitleDelivery
import io.github.zekurio.matinee.api.SubtitlePick
import io.github.zekurio.matinee.api.SubtitleTrack
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.Trickplay
import io.github.zekurio.matinee.api.TrickplayStatus
import io.github.zekurio.matinee.api.await
import io.github.zekurio.matinee.downloads.PendingProgress
import io.github.zekurio.matinee.downloads.PendingReport
import io.github.zekurio.matinee.ui.describeFailure
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
import kotlinx.serialization.SerializationException
import okhttp3.OkHttpClient
import okhttp3.Request

/** How a sitting with a file begins: the server's first answer, or a download. */
sealed interface Opening {
    val item: MediaItem

    /** A file the server plays, with its first `playback.start` answer and what that asked for. */
    class Server(val plan: PlaybackStart, val sessionId: String, val quality: String) : Opening {
        override val item: MediaItem get() = plan.item
    }

    /** A download on the phone, which plays without the server, from [at] seconds in. */
    class Local(
        override val item: MediaItem,
        val file: File,
        val audio: List<AudioTrack>,
        val subtitles: List<SubtitleTrack>,
        /** Subtitles saved beside it, by track id. */
        val saved: Map<String, File>,
        val startAudio: AudioTrack?,
        val startSubtitle: SubtitleTrack?,
        val at: Double,
    ) : Opening
}

/** A note over the picture about the last answer: its kind and, for some, the server's words. */
class Notice(val kind: NoticeKind, val detail: String? = null)

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

/** A `playback.start` with what changed since the last one. */
private data class Ask(
    /** Seconds into the file to start from. */
    val at: Double,
    /** What the report calls the source it loads; null for a seek. */
    val reason: AttemptReason?,
    /** The viewer's picks that change. */
    val picks: Picks? = null,
    /** The method of the source that just failed. */
    val failed: String? = null,
    /** The answer whose source failed. */
    val lost: PlaybackStart? = null,
    val snap: String = PlaybackSnap.BEFORE,
    /** Load the answer even when it's what plays, as a retry does. */
    val reload: Boolean = false,
)

/**
 * Plays one file as the server says: loads the source of each
 * `playback.start` answer into ExoPlayer or mpv, asks again with the
 * viewer's picks and with the methods that failed, seeks in a copied
 * stream with `playback.seek`, draws the subtitles the answer gives the
 * player, and reports progress for Continue watching and the statistics.
 * A download plays from the phone without asking.
 */
class PlayerController(
    context: Context,
    private val api: MatineeApi,
    private val http: OkHttpClient,
    private val opening: Opening,
    options: PlaybackOptions,
    /** What this device plays, which every call to the server carries. */
    private val device: PlaybackDevice,
    /** This device's settings: the engine, decoders, and how subtitles look. */
    private val prefs: PlayerPrefs,
    /** Where reports that don't reach the server wait. */
    private val pending: PendingProgress? = null,
    /** What mpv sends the server, which doesn't go through [http]: the session's token. */
    serverHeaders: Map<String, String> = emptyMap(),
    userAgent: String = "Matinee",
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val server = opening as? Opening.Server
    private val local = opening as? Opening.Local
    private val sessionId = server?.sessionId ?: UUID.randomUUID().toString()

    /** When this sitting with the file began, for a play kept offline. */
    private val startedAt = Instant.now()

    private val appContext = context.applicationContext
    private val resources = context.resources

    val item: MediaItem = opening.item

    /** The encodes the quality menu offers, from `playback.options`. */
    val qualities: List<PlaybackQualityPreset> = options.qualities

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

    /** The server's latest answer: the tracks, the subtitle, and the source it last loaded. Null for a download. */
    private var plan by mutableStateOf(server?.plan)

    /** What the player loads now. */
    var source by mutableStateOf<Source?>(null)
        private set

    /** The picks and failures every call carries. */
    private var asking = Asking(Picks(quality = server?.quality))

    /** A download's subtitle, which it picks itself. */
    private var localSubtitle = local?.startSubtitle

    /** The audio in the menu: the viewer's pick, else the one that plays. */
    var audio by mutableStateOf(server?.plan?.audio ?: local?.startAudio)
        private set

    /** The subtitle in the menu: the viewer's pick, else the one that shows. */
    var subtitle by mutableStateOf(server?.plan?.subtitle ?: local?.startSubtitle)
        private set

    /** The quality in the menu: the one that plays, or the one on its way. */
    var quality by mutableStateOf(server?.plan?.quality ?: ORIGINAL_QUALITY)
        private set
    var cues by mutableStateOf<CueTrack?>(null)
        private set

    /** The track [cues] are for, or loading for. */
    private var cuesFor: String? = null

    /** What a picture track in the file shows now, as ExoPlayer draws it from the file itself. */
    var pictureCues by mutableStateOf<List<androidx.media3.common.text.Cue>>(emptyList())
        private set

    /** The video's shape, width over height, for placing picture subtitles on it. */
    var videoAspect by mutableFloatStateOf(16f / 9f)
        private set
    var subtitleError by mutableStateOf(false)
        private set
    var speed by mutableFloatStateOf(1f)
        private set

    /** Seconds into the file. */
    var position by mutableDoubleStateOf(0.0)
        private set

    /** How far the file is buffered, in its own time. */
    var buffered by mutableDoubleStateOf(0.0)
        private set
    var playing by mutableStateOf(false)
        private set
    var loading by mutableStateOf(true)
        private set
    var ended by mutableStateOf(false)
        private set

    /** Why nothing plays, once nothing is left to try. */
    var error by mutableStateOf<String?>(null)
        private set
    var notice by mutableStateOf<Notice?>(null)
        private set
    var trickplay by mutableStateOf<Trickplay?>(null)
        private set

    val audioTracks: List<AudioTrack> get() = plan?.audioTracks ?: local?.audio.orEmpty()
    val subtitles: List<SubtitleTrack> get() = plan?.subtitleTracks ?: local?.subtitles.orEmpty()

    /** The file after this one in its show, as the server answered. Null for a download, which asks itself. */
    val next: MediaItem? get() = plan?.next

    val duration: Double
        get() = item.durationSeconds
            ?: player.duration.takeIf { it != C.TIME_UNSET }?.let { source?.fileSeconds(it) }
            ?: 0.0

    /** Where a switch or seek is headed, shown until the source for it loads. */
    private var pendingAt: Double? = null

    /** The source failed, so nothing plays until another loads. */
    private var sourceFailed = false
    private var pendingAudioOverride = false
    private var playedSeconds = 0.0
    private var lastReport = 0L
    private var askJob: Job? = null
    private var seekJob: Job? = null

    /** The `playback.start` on its way, and the picks to put back if it fails. */
    private var inFlight: Pair<Ask, Asking>? = null

    /** Where the viewer sought while an answer was on its way, for when the source it answers is the one that plays. */
    private var seekOnAnswer: Double? = null

    /** The report Settings shows of this sitting: codes and formats, never names or addresses. */
    private val diagnostics = DiagnosticsRecorder(
        PlaybackReport(
            device = deviceDiagnostics(context),
            settings = SettingsDiagnostics.of(prefs.engine, prefs.decoders, server?.quality ?: prefs.quality, prefs.videoCodec, prefs.audioCodec, prefs.convertAudio),
            file = FileDiagnostics.of(item),
            selection = selectionDiagnostics(),
            capabilities = CapabilityDiagnostics.of(device, options),
        ),
    )

    init {
        player.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                playing = isPlaying
                report()
            }

            override fun onPlaybackStateChanged(state: Int) {
                loading = state == Player.STATE_BUFFERING || state == Player.STATE_IDLE
                if (state == Player.STATE_READY) diagnostics.playing()
                if (state == Player.STATE_ENDED) {
                    ended = true
                    report()
                }
            }

            override fun onTracksChanged(tracks: Tracks) {
                if (pendingAudioOverride) applyAudioOverride(tracks)
                applyTextOverride(tracks)
                if (mpv == null) diagnostics.tracks(trackDiagnostics(tracks))
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
                diagnostics.failed(errorDiagnostics(e))
                fallBack(e)
            }
        })
        listenForDecoders()
        scope.launch { tick() }
        scope.launch { loadTrickplay() }
        mpv?.setSubtitleScale(
            if (prefs.subtitleSystemStyle) context.getSystemService(CaptioningManager::class.java)?.fontScale ?: 1f else prefs.subtitleScale,
        )
    }

    /** Loads the first answer's source, or the download, and plays. */
    fun start() {
        val first = plan
        val download = local
        if (first != null) {
            take(first, Ask(at = first.position, reason = AttemptReason.START, reload = true))
        } else if (download != null) {
            load(Source.local(Uri.fromFile(download.file).toString(), download.at), AttemptReason.START)
        }
        player.playWhenReady = true
    }

    /** Plays a download, which offers no other qualities. */
    val isLocal get() = local != null

    /** A path from an answer as an address on the server. */
    private fun resolve(path: String) = api.paths.server(path)

    /** Who draws the subtitle that shows: the answer's, or the download's. */
    private fun shown(): SubtitleShow {
        val plan = plan
        if (plan != null) return subtitleShow(plan, mpv != null)
        val track = localSubtitle
        return downloadSubtitleShow(track, mpv != null, track?.let { api.paths.subtitle(item.id, it.id) }.orEmpty())
    }

    /** Whether [track] in the menu is burned into the picture: the one shown as the answer has it, else by its format alone. */
    fun burnsIn(track: SubtitleTrack): Boolean {
        val show = shown()
        if (show.track?.id == track.id) return show is SubtitleShow.Burned
        return track.delivery == SubtitleDelivery.BURN_IN
    }

    /**
     * Takes an answer: loads its source unless the one that plays is the
     * same, and shows its tracks.
     */
    private fun take(next: PlaybackStart, change: Ask) {
        val previous = plan
        val sought = seekOnAnswer
        seekOnAnswer = null
        val (settled, said) = asking.settle(change.lost, next)
        asking = settled
        plan = next
        audio = next.audio
        subtitle = next.subtitle
        quality = next.quality
        val current = source
        if (change.reload || current == null || previous == null || !sameSource(previous, next)) {
            load(Source.of(next, ::resolve), change.reason)
        } else {
            // The same source plays on, with the audio and subtitle answered.
            pendingAt = null
            if (current.holdsTracks) selectAudioInFile()
            showSubtitle()
            recordSelection()
            if (sought != null) seekTo(sought)
        }
        if (said != null) notice = Notice(said)
    }

    /** Loads [next]; a [reason] records it as an attempt, which a seek within a stream isn't. */
    private fun load(next: Source, reason: AttemptReason?) {
        if (reason != null) {
            diagnostics.attempt(next, plan, reason, audio?.index)
            recordSelection()
        }
        error = null
        ended = false
        sourceFailed = false
        pendingAt = null
        source = next
        position = next.position
        val exo = ExoItem.Builder().setUri(next.url).setMediaMetadata(metadata())
        when (next.kind) {
            SourceKind.HLS -> exo.setMimeType(MimeTypes.APPLICATION_M3U8)
            SourceKind.MP4 -> exo.setMimeType(MimeTypes.VIDEO_MP4)
            // ExoPlayer tells the file's container by what it reads.
            SourceKind.FILE -> Unit
        }
        pendingAudioOverride = mpv == null && next.holdsTracks
        mpv?.selectAudio(audio?.index?.takeIf { next.holdsTracks })
        // mpv draws a subtitle file on the file's timeline, so move it to the stream's.
        mpv?.setSubtitleDelay(-next.offset)
        player.setMediaItem(exo.build(), next.startMs)
        player.prepare()
        showSubtitle()
    }

    /**
     * Shows the subtitle the answer gives: the screen draws WebVTT, the
     * engine a stream of the file or mpv a PGS file, and an encode brings
     * a burned-in one along.
     */
    private fun showSubtitle() {
        val show = shown()
        if (show is SubtitleShow.Screen) {
            if (cuesFor != show.track.id) {
                cues = null
                loadCues(show)
            }
        } else {
            cues = null
            cuesFor = null
        }
        val mpv = mpv
        if (mpv != null) {
            mpv.selectSubtitle(
                when (show) {
                    is SubtitleShow.InFile -> MpvSubtitle.Stream(show.stream)
                    is SubtitleShow.Overlay -> MpvSubtitle.External(resolve(show.url))
                    else -> null
                },
            )
        } else {
            applyTextOverride(player.currentTracks)
        }
    }

    /** Fills the screen with the video, cut at its edges, or shows it whole; mpv does it itself. */
    fun showFilled(fill: Boolean) {
        mpv?.setFill(fill)
    }

    /** Picks [audio] inside the file, for the file as it is. */
    private fun selectAudioInFile() {
        val mpv = mpv
        if (mpv != null) {
            mpv.selectAudio(audio?.index)
        } else {
            pendingAudioOverride = true
            applyAudioOverride(player.currentTracks)
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

    /**
     * Lets ExoPlayer draw the stream of the file the answer gives it, and
     * keeps its text output off otherwise: the screen draws text tracks
     * from the server's WebVTT, styled the viewer's way.
     */
    private fun applyTextOverride(tracks: Tracks) {
        val index = (shown() as? SubtitleShow.InFile)?.stream
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

    /** Where the viewer is: where a switch or seek is headed, else where the video plays. */
    private fun now(): Double = pendingAt ?: position

    /**
     * What didn't play asks the server again with its method among the
     * failed, and the server falls back: from the file to a stream, from a
     * stream to an encode. A download has nothing to fall back to.
     */
    private fun fallBack(e: PlaybackException) {
        val current = source ?: return
        sourceFailed = true
        seekJob?.cancel()
        val method = current.method
        if (method == null) {
            error = e.errorCodeName.takeIf { e.cause == null } ?: (e.cause?.message ?: e.errorCodeName)
            return
        }
        ask(Ask(at = now(), reason = AttemptReason.FALLBACK, failed = method, lost = plan))
    }

    /** Asks the server how the file plays with [change], and takes its answer. */
    private fun ask(change: Ask) {
        if (server == null) return
        val undo = asking
        change.picks?.let { asking = asking.pick(it, subtitles) }
        change.failed?.let { asking = asking.fail(it) }
        request(change, undo)
    }

    /** Sends the call for [change], in place of any still on its way. [undo] is what to put back if it fails. */
    private fun request(change: Ask, undo: Asking) {
        askJob?.cancel()
        seekJob?.cancel()
        inFlight = change to undo
        pendingAt = change.at
        val input = asking.input(item.id, sessionId, device, change.at, change.snap)
        askJob = scope.launch {
            val answer = try {
                api.playback.start(input)
            } catch (e: IOException) {
                refused(change, undo, e)
                return@launch
            } catch (e: SerializationException) {
                refused(change, undo, e)
                return@launch
            }
            inFlight = null
            take(answer, change)
        }
    }

    /**
     * A call that failed. When the source failed too, nothing plays, so the
     * player says why, as when the server finds nothing this device plays.
     * A switch that didn't go through leaves what plays, and says so.
     */
    private fun refused(change: Ask, undo: Asking, e: Exception) {
        inFlight = null
        pendingAt = null
        val unplayable = e is ApiException && e.code == PLAYBACK_UNPLAYABLE
        diagnostics.note(if (unplayable) DiagnosticsNote.UNPLAYABLE else DiagnosticsNote.START_FAILED)
        val message = if (unplayable) resources.getString(R.string.player_unplayable) else describeFailure(resources, e)
        val sought = seekOnAnswer
        seekOnAnswer = null
        if (sourceFailed || change.failed != null) {
            error = message
            return
        }
        asking = undo
        plan?.let {
            audio = it.audio
            subtitle = it.subtitle
            quality = it.quality
        }
        notice = Notice(NoticeKind.SWITCH_FAILED, message)
        // What plays stays, so a seek made meanwhile goes to it.
        if (sought != null) seekTo(sought)
    }

    /** Tries again from where it stopped, every method with it. */
    fun retry() {
        error = null
        player.playWhenReady = true
        val current = source
        if (server == null) {
            if (current != null) load(current.copy(start = position), AttemptReason.RETRY)
            return
        }
        asking = asking.forgetFailures()
        ask(Ask(at = now(), reason = AttemptReason.RETRY, reload = true))
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
        val current = source ?: return
        val target = seconds.coerceIn(0.0, maxOf(duration - 1, 0.0))
        ended = false
        val asked = inFlight
        when {
            // An answer on its way would start where the viewer was, so ask again.
            asked != null -> {
                seekOnAnswer = target
                request(asked.first.copy(at = target, snap = PlaybackSnap.NEAREST), asked.second)
            }
            current.seek == SeekWay.IN_SOURCE -> {
                player.seekTo(current.sourceMs(target))
                position = target
            }
            current.seek == SeekWay.NEW_STREAM -> seekStream(current, target)
            else -> ask(Ask(at = target, reason = null, snap = PlaybackSnap.NEAREST))
        }
        report()
    }

    /** A copied stream can't seek, so a new one starts from the keyframe nearest [target]. */
    private fun seekStream(current: Source, target: Double) {
        val playing = plan ?: return
        seekJob?.cancel()
        pendingAt = target
        position = target
        val input = PlaybackSeekInput(item.id, sessionId, playing.audio?.index ?: 0, target, PlaybackSnap.NEAREST, device.streamAudio)
        seekJob = scope.launch {
            val answer = try {
                api.playback.seek(input)
            } catch (e: IOException) {
                pendingAt = null
                diagnostics.note(DiagnosticsNote.SEEK_FAILED)
                notice = Notice(NoticeKind.SWITCH_FAILED, describeFailure(resources, e))
                return@launch
            }
            load(current.copy(url = resolve(answer.url), offset = answer.offset, start = 0.0), reason = null)
        }
    }

    fun skip(seconds: Double) = seekTo(now() + seconds)

    /** Plays another audio track, which the server remembers for the next time. */
    fun pickAudio(track: AudioTrack) {
        if (track == audio) return
        audio = track
        if (server == null) {
            // A download holds only its own tracks, so it picks among them whatever plays.
            selectAudioInFile()
            recordSelection()
            return
        }
        sendPick { api.playback.pickTracks(item.id, audio = track.index) }
        ask(Ask(at = now(), reason = AttemptReason.AUDIO_CHANGE, picks = Picks(audio = track.index)))
    }

    /** Shows a subtitle track, or none for null, which the server remembers for the next time. */
    fun pickSubtitle(track: SubtitleTrack?) {
        if (track?.id == subtitle?.id) return
        subtitle = track
        subtitleError = false
        if (server == null) {
            localSubtitle = track
            showSubtitle()
            recordSelection()
            return
        }
        val pick = SubtitlePick(track?.id)
        sendPick { api.playback.pickTracks(item.id, subtitle = pick) }
        ask(Ask(at = now(), reason = AttemptReason.SUBTITLE_CHANGE, picks = Picks(subtitle = pick)))
    }

    fun pickQuality(id: String) {
        if (id == quality || server == null) return
        quality = id
        ask(Ask(at = now(), reason = AttemptReason.QUALITY_CHANGE, picks = Picks(quality = id)))
    }

    /** Tells the server the viewer's pick, as the web does. A pick that doesn't reach it is only for this sitting. */
    private fun sendPick(send: suspend () -> Unit) {
        scope.launch {
            try {
                send()
            } catch (_: IOException) {
                // The pick still plays now.
            }
        }
    }

    fun pickSpeed(rate: Float) {
        speed = rate
        player.setPlaybackSpeed(rate)
    }

    private fun loadCues(show: SubtitleShow.Screen) {
        val track = show.track
        cuesFor = track.id
        scope.launch {
            try {
                val saved = local?.saved?.get(track.id)
                val text = withContext(Dispatchers.IO) {
                    saved?.readText() ?: http.newCall(Request.Builder().url(resolve(show.url)).build()).await().use {
                        if (!it.isSuccessful) throw IOException("HTTP ${it.code}")
                        it.body.string()
                    }
                }
                val parsed = withContext(Dispatchers.Default) { CueTrack.parse(text) }
                if (cuesFor == track.id) cues = parsed
            } catch (_: IOException) {
                diagnostics.note(DiagnosticsNote.SUBTITLE_LOAD_FAILED)
                if (cuesFor == track.id) subtitleError = true
            }
        }
    }

    private suspend fun loadTrickplay() {
        try {
            api.trickplayUntilSettled(item.id).collect { status -> if (status is TrickplayStatus.Ready) trickplay = status.images }
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
            val current = source
            if (current != null && player.playbackState != Player.STATE_IDLE) {
                position = pendingAt ?: current.fileSeconds(player.currentPosition)
                buffered = current.fileSeconds(player.bufferedPosition)
            }
            val every = if (player.isPlaying) 10_000 else 30_000
            if (System.currentTimeMillis() - lastReport >= every) report()
        }
    }

    /** Tell the server where the viewer is; on play, pause, seek, close, and every so often. */
    fun report(closed: Boolean = false) {
        if (source == null) return
        lastReport = System.currentTimeMillis()
        val at = now()
        val length = item.durationSeconds ?: duration.takeIf { it > 0 }
        val played = playedSeconds
        val paused = !player.isPlaying
        val send: suspend () -> Unit = {
            try {
                api.playback.report(
                    item.id,
                    positionSeconds = at.coerceAtLeast(0.0),
                    durationSeconds = length?.takeIf { it > 0 },
                    sessionId = sessionId,
                    playedSeconds = played.coerceAtLeast(0.0),
                    paused = paused,
                    closed = closed.takeIf { it },
                )
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

    private fun selectionDiagnostics(): SelectionDiagnostics {
        val show = shown()
        return SelectionDiagnostics.of(audio, show.track, show.rendering)
    }

    private fun recordSelection() = diagnostics.select(selectionDiagnostics())

    /** Names the decoders ExoPlayer starts, as the device calls them; mpv picks its own. */
    @OptIn(UnstableApi::class)
    private fun listenForDecoders() {
        val exo = player as? ExoPlayer ?: return
        exo.addAnalyticsListener(object : AnalyticsListener {
            override fun onVideoDecoderInitialized(
                eventTime: AnalyticsListener.EventTime,
                decoderName: String,
                initializedTimestampMs: Long,
                initializationDurationMs: Long,
            ) {
                diagnostics.decoder(DecoderDiagnostics(TrackKind.VIDEO, Safe.token(decoderName, 64)))
            }

            override fun onAudioDecoderInitialized(
                eventTime: AnalyticsListener.EventTime,
                decoderName: String,
                initializedTimestampMs: Long,
                initializationDurationMs: Long,
            ) {
                diagnostics.decoder(DecoderDiagnostics(TrackKind.AUDIO, Safe.token(decoderName, 64)))
            }
        })
    }

    fun release() {
        diagnostics.closed()
        report(closed = true)
        PlaybackService.stop(appContext, controls)
        session.release()
        scope.cancel()
        player.release()
    }
}
