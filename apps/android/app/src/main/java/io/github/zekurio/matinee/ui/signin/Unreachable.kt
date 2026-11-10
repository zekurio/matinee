package io.github.zekurio.matinee.ui.signin

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.auth.AuthState
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.auth.Unreachability
import io.github.zekurio.matinee.ui.components.ButtonLook
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * The saved server didn't answer. Laid out like sign-in: what happened, one
 * line on why, then the ways on. Without a network the downloads come first.
 */
@Composable
fun UnreachableScreen(session: Session, state: AuthState.Unreachable) {
    val downloads by LocalContext.current.app.downloads.store.items.collectAsState()
    val canWatchOffline = downloads.isNotEmpty() && session.lastUser != null
    val noNetwork = state.reason == Unreachability.NoNetwork
    val host = state.server.substringAfter("://")

    AuthLayout {
        Text(
            stringResource(if (noNetwork) R.string.unreachable_offline_title else R.string.unreachable_title),
            style = MaterialTheme.typography.headlineMedium,
        )
        Gap(8.dp)
        Text(
            when (state.reason) {
                Unreachability.NoNetwork ->
                    stringResource(if (canWatchOffline) R.string.unreachable_offline_downloads else R.string.unreachable_offline)
                Unreachability.Refused -> stringResource(R.string.unreachable_refused, host)
                Unreachability.NotFound -> stringResource(R.string.unreachable_not_found, host)
                Unreachability.Timeout -> stringResource(R.string.unreachable_timeout, host)
                Unreachability.Certificate -> stringResource(R.string.unreachable_certificate, host)
                Unreachability.Other -> stringResource(R.string.unreachable_other, host)
            },
            style = MaterialTheme.typography.bodyMedium,
            color = Palette.Muted,
        )
        Gap(28.dp)

        val retry = @Composable { look: ButtonLook ->
            MatineeButton(
                onClick = session::start,
                look = look,
                enabled = !state.retrying,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (state.retrying) {
                    CircularProgressIndicator(
                        Modifier.size(18.dp),
                        color = if (look == ButtonLook.Primary) Palette.Background else Palette.Foreground,
                        strokeWidth = 2.dp,
                    )
                } else {
                    LucideIcon(Lucide.RefreshCw, null, size = 18.dp)
                }
                Text(stringResource(R.string.common_retry))
            }
        }
        val watchOffline = @Composable { look: ButtonLook ->
            MatineeButton(onClick = { session.setOfflineMode(true) }, look = look, modifier = Modifier.fillMaxWidth()) {
                LucideIcon(Lucide.Download, null, size = 18.dp)
                Text(stringResource(R.string.downloads_watch_offline))
            }
        }
        when {
            !canWatchOffline -> retry(ButtonLook.Primary)
            noNetwork -> {
                watchOffline(ButtonLook.Primary)
                Gap(10.dp)
                retry(ButtonLook.Outline)
            }
            else -> {
                retry(ButtonLook.Primary)
                Gap(10.dp)
                watchOffline(ButtonLook.Outline)
            }
        }

        Gap(32.dp)
        MatineeButton(onClick = session::forgetServer, look = ButtonLook.Ghost, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text(stringResource(R.string.connect_change_server), color = Palette.Muted)
        }
    }
}
