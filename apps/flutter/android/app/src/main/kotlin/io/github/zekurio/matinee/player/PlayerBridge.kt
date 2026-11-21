package io.github.zekurio.matinee.player

import android.app.Activity
import android.util.Log
import androidx.media3.common.text.Cue
import androidx.media3.common.util.UnstableApi
import io.flutter.plugin.common.BinaryMessenger
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Pigeon's host side for one activity. Every call from Dart arrives on the
 * platform (main) thread, and so does every call into an engine and every
 * event sent back. mpv itself runs on its own thread inside [MpvEngine].
 *
 * One session is live at a time. A session is the player the Dart side
 * opened: its commands, events, and views carry its id, and anything for an
 * older id is dropped.
 */
@UnstableApi
internal class PlayerBridge(private val activity: Activity, private val messenger: BinaryMessenger) : PlayerApi {
    private var foreground = false

    private var current: Session? = null
    private val fullscreen = PlayerFullscreen(activity)

    // Pigeon's FlutterApi methods suspend. Dispatchers.Main.immediate sends
    // the message before launch() returns when called on the main thread, so
    // events keep the order they were emitted in.
    private val scope = MainScope()

    override fun codecs() = Capabilities.codecs

    override fun deviceDiagnostics() = deviceDiagnostics(activity)

    override fun setFullscreen(owner: Long, enabled: Boolean) = fullscreen.set(owner, enabled)

    override fun open(session: Long, request: OpenMessage) {
        require(request.url.isNotBlank()) { "A media URL is required." }
        closeCurrent(notify = true)
        val next = Session(session)
        current = next
        next.emit(ActiveEngineMessage(request.engine))
        next.emit(StateMessage(PhaseMessage.BUFFERING, playing = false, wantsPlay = request.autoplay, serverUnavailable = false))
        try {
            val host = PlayerSurfaceHost(activity, request.engine, next::surfacesChanged)
            next.host = host
            host.setFit(request.fit)
            host.setSubtitleLook(request)
            host.setViewport(request.viewport)
            val engine = when (request.engine) {
                EngineMessage.MPV -> MpvEngine(activity, next)
                EngineMessage.MEDIA3 -> Media3Engine(activity, next)
            }
            next.engine = engine
            engine.open(request.copy(autoplay = foreground && request.autoplay))
        } catch (failure: Exception) {
            next.failed(failure)
        } catch (failure: LinkageError) {
            // libmpv or the FFmpeg decoder missing for this ABI.
            next.failed(failure)
        }
    }

    override fun play(session: Long) = withEngine(session) { if (foreground) play() }
    override fun pause(session: Long) = withEngine(session) { pause() }
    override fun seekTo(session: Long, positionMs: Long) = withEngine(session) { seekTo(positionMs.coerceAtLeast(0)) }

    override fun setRate(session: Long, rate: Double) {
        require(rate in 0.25..4.0) { "Playback rate must be between 0.25× and 4×." }
        withEngine(session) { setRate(rate) }
    }

    override fun selectAudioTrack(session: Long, id: String?) = withEngine(session) { selectAudioTrack(id) }
    override fun selectSubtitleTrack(session: Long, id: String?) = withEngine(session) { selectSubtitleTrack(id) }
    override fun setSourceTracks(session: Long, tracks: SourceTracksMessage) = withEngine(session) { setSourceTracks(tracks) }
    override fun setSubtitleUrl(session: Long, url: String?) = withEngine(session) { setSubtitleUrl(url) }

    override fun setVideoFit(session: Long, fit: FitMessage) {
        val live = current?.takeIf { it.id == session } ?: return
        live.host?.setFit(fit)
        live.engine?.setVideoFit(fit)
    }

    override fun setViewport(session: Long, viewport: ViewportMessage?) {
        current?.takeIf { it.id == session }?.host?.setViewport(viewport)
    }

    override fun dispose(session: Long) {
        if (current?.id == session) closeCurrent(notify = false)
    }

    fun enterForeground() { foreground = true }

    /**
     * Play pressed on the system's controls while the app is away: the
     * sound plays on, as in the Kotlin app, until the app stops again.
     */
    fun allowPlayInBackground() { foreground = true }

    /** Pause the active source and any replacement that arrives while stopped. */
    fun pauseForBackground() {
        foreground = false
        current?.engine?.pause()
    }

    /** Closes the live session, if any. The Dart side only listens for [notify] when something else replaced it. */
    fun closeCurrent(notify: Boolean) {
        val previous = current ?: return
        if (notify) previous.emit(StateMessage(PhaseMessage.IDLE, playing = false, wantsPlay = false, serverUnavailable = false))
        current = null
        try {
            // The engine moves off the surfaces before they're destroyed.
            previous.engine?.close()
        } finally {
            previous.host?.close()
        }
    }

    /** The activity is going away for good. */
    fun release() {
        fullscreen.restore()
        closeCurrent(notify = false)
        scope.cancel()
    }

    private inline fun withEngine(session: Long, command: PlaybackEngine.() -> Unit) {
        current?.takeIf { it.id == session }?.engine?.command()
    }

    private inner class Session(val id: Long) : PlaybackOutput {
        private val events = PlayerEventsApi(messenger, id.toString())
        var engine: PlaybackEngine? = null
        var host: PlayerSurfaceHost? = null

        fun surfacesChanged(surfaces: PlaybackSurfaces, retiring: Boolean) {
            if (current === this) engine?.setSurfaces(surfaces, retiring)
        }

        fun failed(failure: Throwable) {
            Log.w(TAG, "Player setup failed (${failure.javaClass.simpleName})")
            emit(StateMessage(PhaseMessage.ERROR, playing = false, wantsPlay = false, message = "Could not start the player.", serverUnavailable = false))
        }

        override fun emit(event: PlaybackEventMessage) {
            if (current !== this) return
            if (event is StateMessage) host?.setKeepAwake(event.playing || event.phase == PhaseMessage.BUFFERING)
            scope.launch(Dispatchers.Main.immediate, CoroutineStart.UNDISPATCHED) {
                try {
                    events.onEvent(event)
                } catch (failure: Exception) {
                    // The Dart side stopped listening to this session. Nothing to tell.
                    Log.d(TAG, "Dropped ${event::class.simpleName} for session $id", failure)
                }
            }
        }

        override fun useGpuSurface() {
            if (current === this) host?.useGpuSurface()
        }

        override fun setCues(cues: List<Cue>) {
            if (current === this) host?.setCues(cues)
        }

        override fun videoAspect(aspect: Double) {
            if (current === this) host?.setAspect(aspect)
        }
    }

    private companion object {
        const val TAG = "MatineePlayer"
    }
}
