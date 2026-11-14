package io.github.zekurio.matinee

import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.lifecycleScope
import io.github.zekurio.matinee.launcher.WatchNextLink
import io.github.zekurio.matinee.auth.BrowserSignIn
import io.github.zekurio.matinee.ui.MatineeRoot
import io.github.zekurio.matinee.ui.requests.OpenTarget
import io.github.zekurio.matinee.ui.theme.MatineeTheme
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val watchNextLink by lazy { WatchNextLink(this) }

    /** What went wrong finishing a browser sign-in, for the sign-in screen to show. */
    val signInError = MutableStateFlow<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        app.theme.setSystemDark(systemDark(resources.configuration))
        systemBars(Palette.isDark)
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) handle(intent)
        setContent {
            // The system bars' icons follow the theme on screen, not the device.
            val dark = Palette.isDark
            LaunchedEffect(dark) { systemBars(dark) }
            MatineeTheme {
                MatineeRoot(app.session, signInError)
            }
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        app.theme.setSystemDark(systemDark(newConfig))
    }

    private fun systemDark(configuration: Configuration) =
        configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES

    /** Light icons over a dark theme, dark ones over a light theme, the bars themselves clear. */
    private fun systemBars(dark: Boolean) {
        val style = if (dark) {
            SystemBarStyle.dark(Color.TRANSPARENT)
        } else {
            SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        }
        enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    /** The browser handing back a sign-in code, a TV's Watch Next row, or a notification tapped. */
    private fun handle(intent: Intent?) {
        OpenTarget.of(intent)?.let {
            app.opening.value = it
            return
        }
        val uri = intent?.data ?: return
        if (app.session.isTv && watchNextLink.open(intent)) return
        if (!BrowserSignIn.isCallback(uri)) return
        lifecycleScope.launch { signInError.value = app.session.finishBrowserSignIn(uri) }
    }
}
