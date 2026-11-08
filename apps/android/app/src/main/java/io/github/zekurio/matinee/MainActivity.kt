package io.github.zekurio.matinee

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.lifecycleScope
import io.github.zekurio.matinee.auth.BrowserSignIn
import io.github.zekurio.matinee.ui.MatineeRoot
import io.github.zekurio.matinee.ui.theme.MatineeTheme
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    /** What went wrong finishing a browser sign-in, for the sign-in screen to show. */
    val signInError = MutableStateFlow<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        // The app is dark, so the system bars draw light icons over it.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) handle(intent)
        setContent {
            MatineeTheme {
                MatineeRoot(app.session, signInError)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    /** The browser handing back a sign-in code. */
    private fun handle(intent: Intent?) {
        val uri = intent?.data ?: return
        if (!BrowserSignIn.isCallback(uri)) return
        lifecycleScope.launch { signInError.value = app.session.finishBrowserSignIn(uri) }
    }
}
