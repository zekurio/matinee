package io.github.zekurio.matinee.ui.tv.auth

import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.signin.facts
import io.github.zekurio.matinee.ui.signin.title
import io.github.zekurio.matinee.ui.tv.TvListItem
import io.github.zekurio.matinee.ui.tv.TvListItems
import io.github.zekurio.matinee.ui.tv.TvSidePanel
import io.github.zekurio.matinee.ui.tv.TvType

/** Where the server panel is: the list, picking one to remove, or asking about it. */
private sealed interface ServerStep {
    data object List : ServerStep

    data object Remove : ServerStep

    data class Confirm(val origin: String) : ServerStep
}

/**
 * The saved servers in the right-edge panel, the one in use checked and
 * focused. Select on another switches to it, signed in still where its
 * session stands. Add server goes to finding or typing one, which Back
 * leaves again. Remove a server turns the panel to picking one, then to
 * asking, focused on Cancel; Back goes a step back, then closes.
 */
@Composable
fun TvServerPanel(open: Boolean, session: Session, onClose: () -> Unit, returnFocus: () -> Unit) {
    val servers by session.servers.collectAsState()
    val removing by session.removing.collectAsState()
    var step by remember { mutableStateOf<ServerStep>(ServerStep.List) }
    // Each time it opens, it starts at the list.
    LaunchedEffect(open) { if (open) step = ServerStep.List }
    val first = remember { FocusRequester() }
    val asked = (step as? ServerStep.Confirm)?.let { confirm -> servers.firstOrNull { it.origin == confirm.origin } }
    val activeIndex = servers.indexOfFirst { it.active }
    TvSidePanel(
        open,
        when {
            asked != null -> stringResource(R.string.servers_remove_title, asked.title())
            step == ServerStep.Remove -> stringResource(R.string.tv_servers_remove)
            else -> stringResource(R.string.servers_title)
        },
        onBack = {
            when (step) {
                ServerStep.List -> onClose()
                ServerStep.Remove -> step = ServerStep.List
                is ServerStep.Confirm -> step = ServerStep.Remove
            }
        },
        returnFocus = returnFocus,
        description = when {
            asked != null -> stringResource(R.string.servers_remove_body_tv)
            step == ServerStep.Remove -> stringResource(R.string.tv_servers_remove_description)
            else -> null
        },
        initial = first,
        initialIndex = if (step == ServerStep.List) activeIndex.coerceAtLeast(0) else 0,
        focusKey = step,
    ) {
        when (step) {
            ServerStep.List -> {
                itemsIndexed(servers, key = { _, server -> server.origin }) { index, server ->
                    val busy = server.origin in removing
                    TvListItem(
                        server.title(),
                        // One on its way out stays focusable, so focus doesn't jump, but does nothing.
                        onClick = {
                            if (!busy) {
                                onClose()
                                session.switchTo(server.origin)
                            }
                        },
                        modifier = if (index == activeIndex) Modifier.focusRequester(first) else Modifier,
                        subtitle = if (busy) stringResource(R.string.servers_removing) else server.facts(),
                        subtitleStyle = TvType.Label,
                        icon = Lucide.Server,
                        quiet = true,
                        checked = server.active,
                        minHeight = TvListItems.Height + 12.dp,
                    )
                }
                item(key = "add") {
                    TvListItem(
                        stringResource(R.string.servers_add),
                        onClick = {
                            onClose()
                            session.addServer()
                        },
                        modifier = if (activeIndex < 0) Modifier.focusRequester(first) else Modifier,
                        icon = Lucide.Plus,
                        quiet = true,
                    )
                }
                if (servers.isNotEmpty()) {
                    item(key = "remove") {
                        TvListItem(
                            stringResource(R.string.tv_servers_remove),
                            onClick = { step = ServerStep.Remove },
                            icon = Lucide.Trash,
                            quiet = true,
                            destructive = true,
                        )
                    }
                }
            }
            ServerStep.Remove -> itemsIndexed(servers, key = { _, server -> server.origin }) { index, server ->
                val busy = server.origin in removing
                TvListItem(
                    server.title(),
                    onClick = { if (!busy) step = ServerStep.Confirm(server.origin) },
                    modifier = if (index == 0) Modifier.focusRequester(first) else Modifier,
                    subtitle = if (busy) stringResource(R.string.servers_removing) else server.facts(),
                    subtitleStyle = TvType.Label,
                    icon = Lucide.Server,
                    quiet = true,
                    minHeight = TvListItems.Height + 12.dp,
                )
            }
            is ServerStep.Confirm -> {
                item(key = "confirm") {
                    TvListItem(
                        stringResource(R.string.common_remove),
                        onClick = {
                            asked?.let { session.removeServer(it.origin) }
                            // Back to the list, where it shows as being removed until it's gone.
                            step = ServerStep.List
                        },
                        icon = Lucide.Trash,
                        quiet = true,
                        destructive = true,
                    )
                }
                item(key = "cancel") {
                    TvListItem(
                        stringResource(R.string.common_cancel),
                        onClick = { step = ServerStep.Remove },
                        modifier = Modifier.focusRequester(first),
                        icon = Lucide.X,
                        quiet = true,
                    )
                }
            }
        }
    }
}
