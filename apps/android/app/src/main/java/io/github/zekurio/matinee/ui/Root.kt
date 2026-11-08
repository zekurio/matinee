package io.github.zekurio.matinee.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.auth.AuthState
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.ui.components.ButtonLook
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.LoadingBox
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.signin.ConnectScreen
import io.github.zekurio.matinee.ui.signin.SignInScreen
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.flow.MutableStateFlow

/** Server, then sign-in, then the app. */
@Composable
fun MatineeRoot(session: Session, signInError: MutableStateFlow<String?>) {
    val state by session.state.collectAsState()
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        when (val current = state) {
            AuthState.NoServer -> ConnectScreen(session)
            is AuthState.Connecting -> Column(
                Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                LoadingBox(Modifier.weight(1f, fill = false))
                Text(
                    stringResource(R.string.connect_connecting, current.server),
                    color = Palette.Muted,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            is AuthState.Unreachable -> Column(Modifier.fillMaxSize().padding(bottom = 48.dp)) {
                ErrorBox(
                    title = stringResource(R.string.connect_unreachable, current.server),
                    message = current.message,
                    onRetry = session::start,
                    modifier = Modifier.weight(1f),
                )
                val downloads by LocalContext.current.app.downloads.store.items.collectAsState()
                if (downloads.isNotEmpty() && session.lastUser != null) {
                    MatineeButton(
                        onClick = session::goOffline,
                        look = ButtonLook.Outline,
                        modifier = Modifier.align(Alignment.CenterHorizontally),
                    ) {
                        LucideIcon(Lucide.Download, null, size = 18.dp)
                        Text(stringResource(R.string.downloads_watch_offline))
                    }
                    Gap(8.dp)
                }
                MatineeButton(
                    onClick = session::forgetServer,
                    look = ButtonLook.Ghost,
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                ) {
                    Text(stringResource(R.string.connect_change_server), textAlign = TextAlign.Center)
                }
                Gap(8.dp)
            }
            is AuthState.SignedOut -> SignInScreen(session, current, signInError)
            // A new account starts the screens, and what they keep, afresh.
            is AuthState.SignedIn -> key(current.user.id, current.server) { SignedInApp(session, current.user) }
            is AuthState.Offline -> key(current.user.id, current.server, "offline") {
                SignedInApp(session, current.user, offline = true)
            }
        }
    }
}
