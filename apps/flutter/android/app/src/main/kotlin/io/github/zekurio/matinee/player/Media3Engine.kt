package io.github.zekurio.matinee.player

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.Surface
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.text.CueGroup
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DecoderReuseEvaluation
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import okhttp3.OkHttpClient

@UnstableApi
internal class Media3Engine(private val context: Context, private val output: PlaybackOutput) :
    PlaybackEngine, Player.Listener, AnalyticsListener {
    private val main = Handler(Looper.getMainLooper())
    private var exo: ExoPlayer? = null
    private var item: MediaItem? = null
    private var surface: Surface? = null
    private var audioId: String? = null
    private var subtitleId: String? = null
    private var audioPicked = false
    private var subtitleUrl: String? = null
    private var lastState: StateMessage? = null
    private var lastTimeline: TimelineMessage? = null
    private var lastTracks: TracksMessage? = null
    private var lastVideo: VideoMessage? = null
    private var frameRate: Double? = null

    private val ticker = object : Runnable {
        override fun run() {
            if (exo == null) return
            publishTimeline()
            main.postDelayed(this, 250L)
        }
    }

    override fun open(request: OpenMessage) {
        val http = OkHttpDataSource.Factory(httpClient).setDefaultRequestProperties(request.headers)
        val sources = DefaultMediaSourceFactory(DefaultDataSource.Factory(context, http))
        val renderers = DefaultRenderersFactory(context)
            .setEnableDecoderFallback(true)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
        val player = ExoPlayer.Builder(context, renderers).setMediaSourceFactory(sources).build()
        exo = player
        player.addListener(this)
        player.addAnalyticsListener(this)
        player.setAudioAttributes(
            AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),
            true,
        )
        player.setHandleAudioBecomingNoisy(true)
        surface?.let(player::setVideoSurface)
        item = MediaItem.fromUri(request.url)
        applyTrackSelection(player, Tracks.EMPTY)
        player.setMediaItem(checkNotNull(item), request.startMs)
        player.prepare()
        player.play()
        main.post(ticker)
    }

    override fun play() {
        exo?.let {
            if (it.playbackState == Player.STATE_ENDED) it.seekToDefaultPosition()
            it.play()
        }
    }

    override fun pause() {
        exo?.pause()
    }

    override fun seekTo(positionMs: Long) {
        exo?.seekTo(positionMs)
    }

    override fun setRate(rate: Double) {
        exo?.playbackParameters = PlaybackParameters(rate.toFloat())
    }

    override fun selectAudioTrack(id: String?) {
        val player = exo ?: return
        require(id == null || tracksOf(player.currentTracks, C.TRACK_TYPE_AUDIO).any { it.id == id }) {
            "Audio track is no longer available."
        }
        audioPicked = true
        audioId = id
        applyTrackSelection(player, player.currentTracks)
    }

    override fun selectSubtitleTrack(id: String?) {
        val player = exo ?: return
        require(id == null || tracksOf(player.currentTracks, C.TRACK_TYPE_TEXT).any { it.id == id }) {
            "Subtitle track is no longer available."
        }
        subtitleId = id
        applyTrackSelection(player, player.currentTracks)
    }

    override fun setSubtitleUrl(url: String?) {
        val player = exo ?: return
        val source = item ?: return
        if (url == subtitleUrl) {
            if (url != null) selectSubtitleTrack(SIDECAR_ID)
            return
        }

        subtitleUrl = url
        if (url != null || subtitleId == SIDECAR_ID) subtitleId = if (url == null) null else SIDECAR_ID
        val configuration = url?.let {
            MediaItem.SubtitleConfiguration.Builder(Uri.parse(it))
                .setId(SIDECAR_ID)
                .setLabel("External subtitles")
                .setMimeType(subtitleMimeType(it))
                .build()
        }
        // Media3 reads sidecar configuration at prepare time. Keep the playback
        // position, play intent and selected audio across the new preparation.
        val position = player.currentPosition
        applyTrackSelection(player, Tracks.EMPTY)
        output.setCues(emptyList())
        player.setMediaItem(source.buildUpon().setSubtitleConfigurations(listOfNotNull(configuration)).build(), position)
        player.prepare()
    }

    override fun setVideoFit(fit: FitMessage) {
        // The surface host sizes the display rectangle for Media3.
    }

    override fun setSurfaces(surfaces: PlaybackSurfaces, retiring: Boolean) {
        val next = surfaces.video?.surface
        if (surface === next && !retiring) return
        surface = next
        exo?.setVideoSurface(next)
    }

    override fun close() {
        main.removeCallbacks(ticker)
        val player = exo
        exo = null
        player?.removeListener(this)
        player?.removeAnalyticsListener(this)
        player?.release()
        surface = null
    }

    override fun onEvents(player: Player, events: Player.Events) {
        val error = player.playerError
        val state = StateMessage(
            phase = when {
                error != null -> PhaseMessage.ERROR
                player.playbackState == Player.STATE_BUFFERING -> PhaseMessage.BUFFERING
                player.playbackState == Player.STATE_READY -> PhaseMessage.READY
                player.playbackState == Player.STATE_ENDED -> PhaseMessage.ENDED
                else -> PhaseMessage.IDLE
            },
            playing = player.isPlaying,
            message = error?.let { "Media3 playback failed (${it.errorCodeName})." },
        )
        if (state != lastState) {
            lastState = state
            output.emit(state)
        }
        publishTimeline()
        publishVideo()
    }

    override fun onVideoInputFormatChanged(
        eventTime: AnalyticsListener.EventTime,
        format: Format,
        decoderReuseEvaluation: DecoderReuseEvaluation?,
    ) {
        frameRate = format.frameRate.toDouble().takeIf { it.isFinite() && it > 0 }
        publishVideo()
    }

    override fun onTracksChanged(tracks: Tracks) {
        exo?.let { applyTrackSelection(it, tracks) }
        val next = TracksMessage(
            audio = tracksOf(tracks, C.TRACK_TYPE_AUDIO).map(Track::message),
            subtitles = tracksOf(tracks, C.TRACK_TYPE_TEXT).map(Track::message),
        )
        if (next != lastTracks) {
            lastTracks = next
            output.emit(next)
        }
    }

    override fun onCues(cueGroup: CueGroup) {
        output.setCues(cueGroup.cues)
    }

    private fun applyTrackSelection(player: ExoPlayer, tracks: Tracks) {
        val current = player.trackSelectionParameters
        val next = current.buildUpon()
        if (audioPicked) {
            next.clearOverridesOfType(C.TRACK_TYPE_AUDIO).setTrackTypeDisabled(C.TRACK_TYPE_AUDIO, audioId == null)
            tracksOf(tracks, C.TRACK_TYPE_AUDIO).firstOrNull { it.id == audioId }
                ?.let { next.setOverrideForType(TrackSelectionOverride(it.group.mediaTrackGroup, it.index)) }
        }
        next.clearOverridesOfType(C.TRACK_TYPE_TEXT).setTrackTypeDisabled(C.TRACK_TYPE_TEXT, subtitleId == null)
        tracksOf(tracks, C.TRACK_TYPE_TEXT).firstOrNull { it.id == subtitleId }
            ?.let { next.setOverrideForType(TrackSelectionOverride(it.group.mediaTrackGroup, it.index)) }
        val parameters = next.build()
        if (parameters != current) player.trackSelectionParameters = parameters
    }

    private fun publishTimeline() {
        val player = exo ?: return
        val next = TimelineMessage(
            positionMs = player.currentPosition.coerceAtLeast(0),
            durationMs = player.duration.takeIf { it >= 0 },
            bufferedMs = player.bufferedPosition.takeIf { it >= 0 },
        )
        if (next != lastTimeline) {
            lastTimeline = next
            output.emit(next)
        }
    }

    private fun publishVideo() {
        val size = exo?.videoSize ?: return
        if (size.width <= 0 || size.height <= 0) return
        val next = VideoMessage(size.width.toLong(), size.height.toLong(), frameRate)
        output.videoAspect(size.width * size.pixelWidthHeightRatio.toDouble() / size.height)
        if (next != lastVideo) {
            lastVideo = next
            output.emit(next)
        }
    }

    private data class Track(val id: String, val group: Tracks.Group, val index: Int) {
        fun message(): TrackMessage {
            val format = group.getTrackFormat(index)
            return TrackMessage(
                id = id,
                language = format.language,
                title = format.label,
                codec = format.codecs ?: format.sampleMimeType,
                isDefault = format.selectionFlags and C.SELECTION_FLAG_DEFAULT != 0,
                isForced = format.selectionFlags and C.SELECTION_FLAG_FORCED != 0,
                selected = group.isTrackSelected(index),
            )
        }
    }

    private companion object {
        const val SIDECAR_ID = "matinee-sidecar"
        val httpClient = OkHttpClient()

        fun tracksOf(tracks: Tracks, type: Int): List<Track> =
            tracks.groups.filter { it.type == type }.flatMapIndexed { groupIndex, group ->
                (0 until group.length).map { index ->
                    val format = group.getTrackFormat(index)
                    val id = if (type == C.TRACK_TYPE_TEXT && format.id?.endsWith(SIDECAR_ID) == true) {
                        SIDECAR_ID
                    } else {
                        "$groupIndex-$index"
                    }
                    Track(id, group, index)
                }
            }

        fun subtitleMimeType(url: String): String = when (Uri.parse(url).lastPathSegment?.substringAfterLast('.')?.lowercase()) {
            "ass", "ssa" -> MimeTypes.TEXT_SSA
            "srt" -> MimeTypes.APPLICATION_SUBRIP
            "ttml", "xml" -> MimeTypes.APPLICATION_TTML
            else -> MimeTypes.TEXT_VTT
        }
    }
}
