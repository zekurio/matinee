package io.github.zekurio.matinee

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.media3.session.MediaController
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture

/**
 * Hands the player's media session to the system, which shows its controls
 * in the notification shade, on the lock screen, and to headsets: play and
 * pause, and seeking. Media3 posts the notification and keeps it in step.
 * The player owns the session; this service only holds it while it plays.
 */
class PlaybackService : MediaSessionService() {
    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = current

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Swiping the app away stops what plays, rather than leaving a notification behind.
        current?.player?.pause()
        stopSelf()
    }

    companion object {
        /** The session of the player on screen, if one plays. */
        private var current: MediaSession? = null

        /**
         * Shows [session]'s controls: connecting a controller starts the
         * service, which then posts the media notification. Release the
         * returned future's controller, and the session, with [stop].
         */
        fun start(context: Context, session: MediaSession): ListenableFuture<MediaController> {
            current = session
            val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
            return MediaController.Builder(context, token).buildAsync()
        }

        /** Takes the controls away once the player closes. */
        fun stop(context: Context, controller: ListenableFuture<MediaController>) {
            MediaController.releaseFuture(controller)
            current = null
            context.stopService(Intent(context, PlaybackService::class.java))
        }
    }
}
