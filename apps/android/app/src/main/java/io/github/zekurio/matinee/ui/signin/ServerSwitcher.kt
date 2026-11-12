package io.github.zekurio.matinee.ui.signin

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.name
import io.github.zekurio.matinee.auth.SavedServer
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.ui.components.ButtonLook
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.SheetHeader
import io.github.zekurio.matinee.ui.components.SheetItem
import io.github.zekurio.matinee.ui.components.rememberSheetCloser
import io.github.zekurio.matinee.ui.settings.LinkRow
import io.github.zekurio.matinee.ui.theme.Palette

/* The saved servers, for the phone: switching between them, adding one, and removing one. The TV's are in ui/tv/auth/TvServers.kt. */

/** What a saved server is called in a list: its name, when it told one, else its address without the scheme. */
fun SavedServer.title(): String = name ?: address.substringAfter("://")

/** The line under it: the address, when the name took its place, and who's signed in there. */
@Composable
fun SavedServer.facts(): String = listOfNotNull(
    address.substringAfter("://").takeIf { name != null },
    user?.let { stringResource(R.string.servers_signed_in_as, it.name) } ?: stringResource(R.string.servers_signed_out),
).joinToString(" · ")

/** Settings' row that opens the server list. */
@Composable
fun ChangeServerRow(session: Session) {
    var open by rememberSaveable { mutableStateOf(false) }
    LinkRow(stringResource(R.string.connect_change_server), icon = Lucide.RefreshCw, onClick = { open = true })
    if (open) ServerSwitcherSheet(session) { open = false }
}

/** The quiet button under the sign-in and unreachable screens that opens the server list. */
@Composable
fun ChangeServerButton(session: Session, modifier: Modifier = Modifier) {
    var open by rememberSaveable { mutableStateOf(false) }
    MatineeButton(onClick = { open = true }, look = ButtonLook.Ghost, modifier = modifier) {
        Text(stringResource(R.string.connect_change_server), color = Palette.Muted)
    }
    if (open) ServerSwitcherSheet(session) { open = false }
}

/**
 * The saved servers in a sheet, the one in use checked. A tap on another
 * switches to it, signed in still where its session stands; Add server
 * connects to a new one, which can be left to come back here; the bin
 * removes one, after asking.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServerSwitcherSheet(session: Session, onDismiss: () -> Unit) {
    val servers by session.servers.collectAsState()
    val removing by session.removing.collectAsState()
    var asking by remember { mutableStateOf<SavedServer?>(null) }
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val close = rememberSheetCloser(sheet, onDismiss)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet, containerColor = Palette.Raised, dragHandle = null) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 12.dp)) {
            SheetHeader(stringResource(R.string.servers_title), null)
            servers.forEach { server ->
                ServerRow(
                    server,
                    busy = server.origin in removing,
                    onClick = { close { session.switchTo(server.origin) } },
                    onRemove = { asking = server },
                )
            }
            SheetItem(Lucide.Plus, stringResource(R.string.servers_add)) { close(session::addServer) }
        }
    }
    asking?.let { server ->
        AlertDialog(
            onDismissRequest = { asking = null },
            containerColor = Palette.Raised,
            title = { Text(stringResource(R.string.servers_remove_title, server.title())) },
            text = { Text(stringResource(R.string.servers_remove_body), color = Palette.Muted) },
            confirmButton = {
                TextButton(onClick = {
                    asking = null
                    session.removeServer(server.origin)
                }) { Text(stringResource(R.string.common_remove), color = Palette.Danger) }
            },
            dismissButton = {
                TextButton(onClick = { asking = null }) { Text(stringResource(R.string.common_cancel), color = Palette.Foreground) }
            },
        )
    }
}

@Composable
private fun ServerRow(server: SavedServer, busy: Boolean, onClick: () -> Unit, onRemove: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(enabled = !busy, onClick = onClick)
            .padding(start = 20.dp, end = 8.dp, top = 6.dp, bottom = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LucideIcon(Lucide.Server, null, tint = if (server.active) Palette.Accent else Palette.Muted)
        Column(Modifier.weight(1f).padding(vertical = 6.dp)) {
            Text(server.title(), style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                if (busy) stringResource(R.string.servers_removing) else server.facts(),
                style = MaterialTheme.typography.bodySmall,
                color = Palette.Muted,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (server.active) LucideIcon(Lucide.Check, stringResource(R.string.servers_in_use), size = 20.dp, tint = Palette.Accent)
        Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
            if (busy) {
                CircularProgressIndicator(Modifier.size(20.dp), color = Palette.Muted, strokeWidth = 2.dp)
            } else {
                IconButton(onClick = onRemove) {
                    LucideIcon(Lucide.Trash, stringResource(R.string.servers_remove, server.title()), size = 20.dp, tint = Palette.Muted)
                }
            }
        }
    }
}

/** Under the connect and sign-in screens while adding a server: back to the one in use, as it was. */
@Composable
internal fun BackToServer(session: Session, modifier: Modifier = Modifier) {
    val servers by session.servers.collectAsState()
    val current = servers.firstOrNull { it.active } ?: return
    MatineeButton(onClick = session::cancelAdd, look = ButtonLook.Ghost, modifier = modifier) {
        LucideIcon(Lucide.ArrowLeft, null, size = 18.dp, tint = Palette.Muted)
        Text(stringResource(R.string.servers_back_to, current.title()), color = Palette.Muted)
    }
}
