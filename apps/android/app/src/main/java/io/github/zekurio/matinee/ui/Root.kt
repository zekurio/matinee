package io.github.zekurio.matinee.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.auth.AuthState
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.ui.components.LoadingBox
import io.github.zekurio.matinee.ui.signin.ConnectScreen
import io.github.zekurio.matinee.ui.signin.SignInScreen
import io.github.zekurio.matinee.ui.signin.UnreachableScreen
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.theme.LocalTv
import io.github.zekurio.matinee.ui.tv.auth.TvRoot
import kotlinx.coroutines.flow.MutableStateFlow

/** Server, then sign-in, then the app. A TV has screens of its own for each, in [TvRoot]. */
@Composable
fun MatineeRoot(session: Session, signInError: MutableStateFlow<String?>) {
    val state by session.state.collectAsState()
    val tv = LocalTv.current
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        if (tv) {
            TvRoot(session, state)
            return@Surface
        }
        when (val current = state) {
            is AuthState.NoServer -> ConnectScreen(session, current.canCancel)
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
            is AuthState.Unreachable -> UnreachableScreen(session, current)
            // Another server's sign-in starts afresh, with its own code.
            is AuthState.SignedOut -> key(current.server) { SignInScreen(session, current, signInError) }
            // A new account starts the screens, and what they keep, afresh.
            is AuthState.SignedIn -> key(current.user.id, current.server) { SignedInApp(session, current.user) }
            is AuthState.Offline -> key(current.user.id, current.server, "offline") {
                SignedInApp(session, current.user, offline = true)
            }
        }
    }
}
