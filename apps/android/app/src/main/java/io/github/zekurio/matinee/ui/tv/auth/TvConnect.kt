package io.github.zekurio.matinee.ui.tv.auth

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.auth.DiscoveredServer
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.auth.discoverServers
import io.github.zekurio.matinee.auth.localNetworkPermission
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.signin.ServerConnect
import io.github.zekurio.matinee.ui.signin.rememberServerConnect
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.TvListHeading
import io.github.zekurio.matinee.ui.tv.TvListItem
import io.github.zekurio.matinee.ui.tv.TvListItems
import io.github.zekurio.matinee.ui.tv.TvType

/** How many scans a search runs, one after the other, before it says what it found. */
private const val SCANS = 3

/**
 * Picking a server on a TV, as Wholphin does it: the servers found on the
 * local network first, searched for while the screen shows, each a large
 * row with its name and address. The server last used comes next, then
 * typing an address with the TV's keyboard. Every server calls itself
 * Matinee unless its admin renamed it, so the address is what tells them
 * apart.
 */
@Composable
fun TvConnectScreen(session: Session) {
    var typing by rememberSaveable { mutableStateOf(false) }
    val connector = rememberServerConnect(session)
    if (typing) {
        BackHandler {
            connector.clearError()
            typing = false
        }
        AddressEntry(connector, onBack = {
            connector.clearError()
            typing = false
        })
    } else {
        ServerList(session, connector, onType = {
            connector.clearError()
            typing = true
        })
    }
}

@Composable
private fun ServerList(session: Session, connector: ServerConnect, onType: () -> Unit) {
    val context = LocalContext.current
    val found = remember { mutableStateListOf<DiscoveredServer>() }
    var search by rememberSaveable { mutableIntStateOf(0) }
    var searching by remember { mutableStateOf(true) }
    // The one being tried, for its spinner.
    var trying by remember { mutableStateOf<String?>(null) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) search++ else searching = false
    }
    LaunchedEffect(search) {
        // Ask before each search: the permission can be taken back in the system's settings.
        val needed = localNetworkPermission(context)
        if (needed != null) {
            permission.launch(needed)
            return@LaunchedEffect
        }
        searching = true
        // A new search shows what answers now, not what answered before.
        found.clear()
        repeat(SCANS) {
            discoverServers().collect { server -> if (found.none { it.url == server.url }) found.add(server) }
        }
        searching = false
    }
    val busyOn = trying.takeIf { connector.busy }
    val failedOn = trying.takeIf { !connector.busy }
    // A row stays enabled while another is tried, so focus stays on it; a second try waits.
    val connect = { url: String ->
        if (!connector.busy) {
            trying = url
            connector.connect(url)
        }
    }

    val last = session.lastServer?.takeIf { url -> found.none { sameServer(it.url, url) } }
    val firstFound = remember { FocusRequester() }
    val lastRow = remember { FocusRequester() }
    val typeRow = remember { FocusRequester() }
    // The first server to show takes focus as it comes; before that, the last one used or typing.
    FocusOnShow(if (last != null) lastRow else typeRow)
    FocusOnShow(firstFound, found.isNotEmpty())

    TvAuthFrame(
        stringResource(R.string.tv_connect_title),
        stringResource(R.string.tv_connect_description),
    ) {
        // A plain column: a lazy one dropped focus from the row it had when rows came in above it.
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).focusGroup().padding(vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            TvListHeading(stringResource(R.string.tv_connect_found))
            found.forEach { server ->
                key(server.url) {
                    ServerRow(
                        server.name,
                        server.url,
                        Lucide.Server,
                        busy = busyOn == server.url,
                        modifier = if (server == found.first()) Modifier.focusRequester(firstFound) else Modifier,
                    ) { connect(server.url) }
                    // What went wrong, under the row it went wrong for.
                    if (failedOn == server.url) connector.error?.let { AuthNote(it, danger = true) }
                }
            }
            if (found.isEmpty() && !searching) AuthNote(stringResource(R.string.tv_connect_none), Modifier.padding(bottom = 8.dp))
            // Always there, so focus stays on it while it searches again.
            TvListItem(
                stringResource(if (searching) R.string.tv_connect_searching else R.string.tv_connect_search_again),
                onClick = { if (!searching) search++ },
                icon = Lucide.RefreshCw,
                trailing = if (searching) {
                    { CircularProgressIndicator(Modifier.size(22.dp), color = LocalContentColor.current, strokeWidth = 2.dp) }
                } else {
                    null
                },
            )
            if (last != null) {
                TvListHeading(stringResource(R.string.tv_connect_last))
                ServerRow(
                    last,
                    null,
                    Lucide.RotateCcw,
                    busy = busyOn == last,
                    modifier = Modifier.focusRequester(lastRow),
                ) { connect(last) }
                if (failedOn == last) connector.error?.let { AuthNote(it, danger = true) }
            }
            TvListHeading(stringResource(R.string.tv_connect_other))
            TvListItem(
                stringResource(R.string.tv_connect_enter),
                onClick = onType,
                icon = Lucide.Link,
                modifier = Modifier.focusRequester(typeRow),
            )
        }
    }
}

/** A server to connect to, its name over its address, or only its address, with a spinner while it's tried. */
@Composable
private fun ServerRow(
    name: String,
    url: String?,
    icon: Int,
    busy: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    TvListItem(
        name,
        onClick = onClick,
        modifier = modifier,
        subtitle = url,
        subtitleStyle = TvType.Label,
        icon = icon,
        minHeight = if (url != null) TvListItems.Height + 12.dp else TvListItems.Height,
        trailing = if (busy) {
            { CircularProgressIndicator(Modifier.size(22.dp), color = LocalContentColor.current, strokeWidth = 2.dp) }
        } else {
            null
        },
    )
}

/** Two addresses of one server, as the app shows them and as a server sends them. */
private fun sameServer(a: String, b: String) = a.trimEnd('/').equals(b.trimEnd('/'), ignoreCase = true)

/** Typing the address, as the phone's connect screen takes it, with its checks and messages. */
@Composable
private fun AddressEntry(connector: ServerConnect, onBack: () -> Unit) {
    var address by rememberSaveable { mutableStateOf("") }
    val field = remember { FocusRequester() }
    FocusOnShow(field)
    val connect = { connector.connect(address) }
    TvAuthFrame(
        stringResource(R.string.tv_connect_enter),
        stringResource(R.string.connect_description),
    ) {
        Column(Modifier.fillMaxWidth().focusGroup(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            TvTextField(
                address,
                onValueChange = {
                    address = it
                    connector.clearError()
                },
                placeholder = stringResource(R.string.connect_placeholder),
                onGo = connect,
                isError = connector.error != null,
                modifier = Modifier.focusRequester(field),
            )
            connector.error?.let { AuthNote(it, Modifier.padding(bottom = 4.dp), danger = true) }
            TvListItem(
                stringResource(R.string.connect_button),
                onClick = connect,
                icon = Lucide.LogIn,
                modifier = Modifier.heightIn(min = TvListItems.Height),
                trailing = if (connector.busy) {
                    { CircularProgressIndicator(Modifier.size(22.dp), color = LocalContentColor.current, strokeWidth = 2.dp) }
                } else {
                    null
                },
            )
            TvListItem(
                stringResource(R.string.tv_connect_back_to_list),
                onClick = onBack,
                icon = Lucide.ArrowLeft,
                quiet = true,
            )
        }
    }
}
