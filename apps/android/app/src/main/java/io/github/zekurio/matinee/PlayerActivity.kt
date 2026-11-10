package io.github.zekurio.matinee

import android.app.ActivityOptions
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import io.github.zekurio.matinee.auth.AuthState
import io.github.zekurio.matinee.ui.LocalOffline
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.player.LocalPlayerHost
import io.github.zekurio.matinee.ui.player.PlayerHost
import io.github.zekurio.matinee.ui.player.PlayerScreen
import io.github.zekurio.matinee.ui.theme.MatineeTheme
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.theme.Theming

/** What to play: a file, from where the person left off or from [start] seconds. */
private data class PlayTarget(val itemId: String, val start: Double?)

/**
 * The player in an activity of its own, in landscape, as Findroid has it.
 * Leaving finishes it, and the system turns the screen back upright as it
 * closes over the app, which a page of the main activity can't do. The
 * next episode plays in place, in the same activity.
 */
class PlayerActivity : ComponentActivity() {
    private var target by mutableStateOf<PlayTarget?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        // Video plays on black, so the bars, when they show, draw light icons.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        // The player fades over the page and away again, at the app's overlay
        // timing, instead of the system's slower activity animation.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            overrideActivityTransition(OVERRIDE_TRANSITION_OPEN, R.anim.player_enter, R.anim.hold)
            overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, R.anim.hold, R.anim.player_exit)
        }
        target = targetOf(intent)
        val host = PlayerHost(close = ::finish, playInstead = { id -> target = PlayTarget(id, 0.0) })
        setContent {
            val state by app.session.state.collectAsState()
            val user = when (val current = state) {
                is AuthState.SignedIn -> current.user
                is AuthState.Offline -> current.user
                else -> null
            }
            val api = app.session.api
            val playing = target
            if (user == null || api == null || playing == null) {
                // Nobody to play for, as after the app was signed out meanwhile.
                LaunchedEffect(Unit) { finish() }
                return@setContent
            }
            MatineeTheme {
                CompositionLocalProvider(
                    // Text and icons in the player's own color, as the app's root gives its pages theirs.
                    LocalContentColor provides Palette.Foreground,
                    LocalApi provides api,
                    LocalUser provides user,
                    LocalOffline provides (state is AuthState.Offline),
                    LocalPlayerHost provides host,
                ) {
                    key(playing) { PlayerScreen(playing.itemId, playing.start) }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        targetOf(intent)?.let { target = it }
    }

    // The player's controls are dark whichever theme the app shows; the app
    // gets its own colors back the moment the player starts to close.
    override fun onResume() {
        super.onResume()
        Theming.forceDark = true
    }

    override fun onPause() {
        super.onPause()
        Theming.forceDark = false
    }

    private fun targetOf(intent: Intent?): PlayTarget? {
        val itemId = intent?.getStringExtra(EXTRA_ITEM) ?: return null
        return PlayTarget(itemId, intent.getDoubleExtra(EXTRA_START, -1.0).takeIf { it >= 0 })
    }

    override fun finish() {
        super.finish()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            @Suppress("DEPRECATION")
            overridePendingTransition(R.anim.hold, R.anim.player_exit)
        }
    }

    companion object {
        private const val EXTRA_ITEM = "item"
        private const val EXTRA_START = "start"

        fun start(context: Context, itemId: String, start: Double?) {
            context.startActivity(
                Intent(context, PlayerActivity::class.java)
                    .putExtra(EXTRA_ITEM, itemId)
                    .putExtra(EXTRA_START, start ?: -1.0),
                // Before Android 14 the opening animation comes with the start.
                ActivityOptions.makeCustomAnimation(context, R.anim.player_enter, R.anim.hold).toBundle(),
            )
        }
    }
}
