package io.github.zekurio.matinee.ui.tv.auth

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.auth.AuthState
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.auth.Unreachability
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.LogoMark
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.Spinner
import io.github.zekurio.matinee.ui.signin.rememberLocalNetworkAccess
import io.github.zekurio.matinee.ui.signin.unreachableMessage
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.TvListItem
import io.github.zekurio.matinee.ui.tv.TvSignedInApp
import io.github.zekurio.matinee.ui.tv.TvType

/**
 * The app on a TV, from picking a server to signed in: the TV's own
 * screens for each step, fading from one to the next. A TV has no
 * downloads, so no offline mode: a server that doesn't answer shows the
 * unreachable screen, with Retry, whatever is saved.
 */
@Composable
fun TvRoot(session: Session, state: AuthState) {
    // A saved LAN server is unreachable without local network access, which Settings can take back.
    val withLocalNetwork = rememberLocalNetworkAccess()
    AnimatedContent(
        state,
        Modifier.fillMaxSize().background(Palette.Background),
        transitionSpec = {
            // Into or out of the signed-in app at once: it shouldn't outlive its session, even by a fade.
            if (initialState is AuthState.SignedIn || targetState is AuthState.SignedIn) {
                EnterTransition.None togetherWith ExitTransition.None
            } else {
                fadeIn(Motion.enter(delay = Motion.EXIT_MS / 2)) togetherWith fadeOut(Motion.exit())
            }
        },
        // A retry under way, or the account's preferences changing, is the same screen.
        contentKey = { current ->
            when (current) {
                is AuthState.SignedIn -> "in-${current.user.id}-${current.server}"
                // Another server's sign-in starts afresh, with its own code.
                is AuthState.SignedOut -> "out-${current.server}"
                else -> current::class
            }
        },
        label = "tvRoot",
    ) { current ->
        when (current) {
            is AuthState.NoServer -> TvConnectScreen(session, current.canCancel)
            is AuthState.Connecting -> TvConnecting(current.server)
            is AuthState.Unreachable -> TvUnreachableScreen(session, current.server, current.reason, current.retrying) { withLocalNetwork(session::start) }
            is AuthState.SignedOut -> TvSignInScreen(session, current)
            // A new account starts the screens, and what they keep, afresh.
            is AuthState.SignedIn -> key(current.user.id, current.server) { TvSignedInApp(session, current.user) }
            // Not reached: a TV never turns offline mode on. If it were on, turning it off checks the server again.
            is AuthState.Offline -> TvUnreachableScreen(session, current.server, Unreachability.Other, false) { session.setOfflineMode(false) }
        }
    }
}

/** Checking the saved server and session, as the app starts. */
@Composable
fun TvConnecting(server: String) {
    Box(Modifier.fillMaxSize().background(Palette.Background), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(28.dp)) {
            LogoMark(Modifier.size(72.dp))
            Spinner(size = 32.dp, color = Palette.Muted)
            Text(stringResource(R.string.connect_connecting, server.substringAfter("://")), style = TvType.Body, color = Palette.Muted)
        }
    }
}

/**
 * The saved server didn't answer: what happened and why on the left, and
 * Retry, focused, over the way to the server list on the right. The app
 * also tries again when the network comes back.
 */
@Composable
fun TvUnreachableScreen(session: Session, server: String, reason: Unreachability, retrying: Boolean, onRetry: () -> Unit) {
    val retry = remember { FocusRequester() }
    val change = remember { FocusRequester() }
    var switching by remember { mutableStateOf(false) }
    FocusOnShow(retry)
    val noNetwork = reason == Unreachability.NoNetwork
    Box(Modifier.fillMaxSize()) {
        TvAuthFrame(
            stringResource(if (noNetwork) R.string.unreachable_offline_title else R.string.unreachable_title),
            unreachableMessage(reason, server, canWatchOffline = false),
            side = {
                Text(
                    server,
                    style = TvType.Label,
                    color = Palette.Muted,
                    modifier = Modifier.padding(top = SIDE_GAP),
                )
            },
        ) {
            Column(Modifier.fillMaxWidth().focusGroup(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                TvListItem(
                    stringResource(if (retrying) R.string.tv_unreachable_retrying else R.string.common_retry),
                    // While it tries, Select waits for the answer.
                    onClick = { if (!retrying) onRetry() },
                    icon = Lucide.RefreshCw,
                    modifier = Modifier.focusRequester(retry),
                    trailing = if (retrying) {
                        { Spinner(size = 22.dp, color = LocalContentColor.current) }
                    } else {
                        null
                    },
                )
                TvListItem(
                    stringResource(R.string.connect_change_server),
                    onClick = { switching = true },
                    icon = Lucide.Server,
                    quiet = true,
                    modifier = Modifier.focusRequester(change),
                )
            }
        }
        TvServerPanel(switching, session, onClose = { switching = false }, returnFocus = { runCatching { change.requestFocus() } })
    }
}
