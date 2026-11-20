package io.github.zekurio.matinee.player

import android.view.Surface
import androidx.media3.common.text.Cue

/** All calls and callbacks run on the activity's main thread. */
internal interface PlaybackEngine {
    fun open(request: OpenMessage)
    fun play()
    fun pause()
    fun seekTo(positionMs: Long)
    fun setRate(rate: Double)
    fun selectAudioTrack(id: String?)
    fun selectSubtitleTrack(id: String?)
    fun setSourceTracks(tracks: SourceTracksMessage)
    fun setSubtitleUrl(url: String?)
    fun setVideoFit(fit: FitMessage)
    fun setSurfaces(surfaces: PlaybackSurfaces, retiring: Boolean)
    fun close()
}

internal interface PlaybackOutput {
    fun emit(event: PlaybackEventMessage)
    fun useGpuSurface()
    fun setCues(cues: List<Cue>)
    fun videoAspect(aspect: Double)
}

internal data class SurfacePlane(val surface: Surface, val generation: Long)

internal data class PlaybackSurfaces(
    val video: SurfacePlane?,
    val osd: SurfacePlane?,
    val width: Int,
    val height: Int,
    val videoLeft: Int,
    val videoTop: Int,
    val videoRight: Int,
    val videoBottom: Int,
)
