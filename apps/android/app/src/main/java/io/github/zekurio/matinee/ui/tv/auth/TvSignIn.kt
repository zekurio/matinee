package io.github.zekurio.matinee.ui.tv.auth

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.auth.AuthState
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.QrCode
import io.github.zekurio.matinee.ui.signin.DeviceCodeState
import io.github.zekurio.matinee.ui.signin.rememberDeviceCode
import io.github.zekurio.matinee.ui.signin.title
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.TvListItem
import io.github.zekurio.matinee.ui.tv.TvType

private val QR_SIZE = 272.dp

/**
 * Signing a TV in with a code, the only way it has: the QR code to scan on
 * the right, large enough for a phone across the room, and on the left
 * the address and the code to type there, read from the couch. A code that
 * runs out waits for a new one to be asked for, so a TV left here doesn't
 * keep asking the server for codes.
 */
@Composable
fun TvSignInScreen(session: Session, state: AuthState.SignedOut) {
    val flow = rememberDeviceCode(session, renewExpired = false)
    val code = flow.code
    val again = remember { FocusRequester() }
    val change = remember { FocusRequester() }
    var switching by remember { mutableStateOf(false) }
    // A code that ran out, or never came, puts focus on getting one; else the one way out.
    val stuck = flow.expired || (code == null && flow.error != null)
    FocusOnShow(if (stuck) again else change, stuck)
    // A server being added: Back goes to finding or typing another, its row back to the one in use.
    BackHandler(enabled = state.adding, onBack = session::addServer)
    val servers by session.servers.collectAsState()
    val current = servers.firstOrNull { it.active }?.takeIf { state.adding }
    val way = if (current != null) {
        WayOut(stringResource(R.string.servers_back_to, current.title()), Lucide.ArrowLeft, session::cancelAdd)
    } else {
        WayOut(stringResource(R.string.connect_change_server), Lucide.Server) { switching = true }
    }

    Box(Modifier.fillMaxSize()) {
        TvAuthFrame(
            stringResource(R.string.tv_signin_title),
            // A server not set up yet can't approve anyone; its setup runs in a browser.
            stringResource(if (state.config.setup != null) R.string.signin_setup else R.string.tv_signin_description),
            split = 0.56f,
            side = { CodeSide(flow, state.server, again, change, way) },
        ) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                CodeQr(flow)
            }
        }
        TvServerPanel(switching, session, onClose = { switching = false }, returnFocus = { runCatching { change.requestFocus() } })
    }
}

/** The row that leaves signing in: to the server list, or back to the server in use. */
private class WayOut(val label: String, val icon: Int, val onClick: () -> Unit)

/** The steps to type the code, whether it's waiting, and the buttons. */
@Composable
private fun CodeSide(flow: DeviceCodeState, server: String, again: FocusRequester, change: FocusRequester, way: WayOut) {
    val code = flow.code
    Column(Modifier.padding(top = 28.dp)) {
        when {
            code != null -> {
                Text(
                    stringResource(R.string.tv_signin_enter, code.verificationUri.substringAfter("://")),
                    style = TvType.Facts,
                    color = Palette.Foreground.copy(alpha = 0.85f),
                )
                Text(
                    code.userCode,
                    style = TvType.Code,
                    maxLines = 1,
                    color = Palette.Foreground,
                    modifier = Modifier.padding(top = 8.dp),
                )
                Row(
                    Modifier.padding(top = 16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    CircularProgressIndicator(Modifier.size(18.dp), color = Palette.Muted, strokeWidth = 2.dp)
                    Text(stringResource(R.string.signin_code_waiting), style = TvType.Body, color = Palette.Muted)
                }
            }
            flow.expired -> Text(stringResource(R.string.tv_signin_expired), style = TvType.Title)
            flow.error == null -> Text(stringResource(R.string.signin_code_loading), style = TvType.Body, color = Palette.Muted)
        }
        flow.error?.let {
            Text(it, style = TvType.Body, color = Palette.Danger, modifier = Modifier.padding(top = 12.dp))
        }
        Column(
            Modifier.padding(top = 24.dp).width(360.dp).focusGroup(),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (flow.expired || (code == null && flow.error != null)) {
                TvListItem(
                    stringResource(if (flow.expired) R.string.tv_signin_new_code else R.string.common_retry),
                    onClick = flow::newCode,
                    icon = Lucide.RefreshCw,
                    modifier = Modifier.focusRequester(again),
                )
            }
            TvListItem(
                way.label,
                onClick = way.onClick,
                subtitle = server.substringAfter("://"),
                icon = way.icon,
                quiet = true,
                modifier = Modifier.focusRequester(change),
            )
        }
    }
}

/** The QR code of the link page with the code in it; a spinner before it comes, a blank card once it ran out. */
@Composable
private fun CodeQr(flow: DeviceCodeState) {
    val code = flow.code
    if (code != null) {
        QrCode(code.verificationUriComplete, stringResource(R.string.signin_code_qr, code.userCode), QR_SIZE)
        return
    }
    val shape = RoundedCornerShape(QR_SIZE / 14)
    Box(
        Modifier.size(QR_SIZE).background(Palette.Foreground.copy(alpha = 0.05f), shape).border(2.dp, Palette.Foreground.copy(alpha = 0.1f), shape),
        contentAlignment = Alignment.Center,
    ) {
        when {
            flow.expired -> Text(
                stringResource(R.string.tv_signin_expired_short),
                style = TvType.Title,
                color = Palette.Muted,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(24.dp),
            )
            flow.error == null -> CircularProgressIndicator(color = Palette.Accent)
        }
    }
}
