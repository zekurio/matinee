package io.github.zekurio.matinee.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalOffline
import io.github.zekurio.matinee.ui.kit.ButtonLook
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.MatineeButton
import io.github.zekurio.matinee.ui.kit.RoundIconButton
import io.github.zekurio.matinee.ui.theme.Palette

/*
 * How the phone's pages say something didn't load. It always looks the
 * same: a plain icon, a heading that starts "Couldn't", the reason in a
 * line or two at most, and Try again. A page with nothing else to show
 * also offers Back to Home, so there's a way on when trying again won't
 * help. Only where it sits changes:
 *
 * - ErrorBox: centered in a page with nothing else to show.
 * - ErrorSection: in a section's place, or at the end of a list whose
 *   next page didn't load, among what did.
 *
 * While the server can't be reached, either is just [Disconnected]: the
 * cloud icon and the buttons, no words. The TV has its own, sized for the
 * couch.
 */

/**
 * What failed, centered in the page, with ways to try again and to go
 * Home; while the server can't be reached, just [Disconnected]. A tab's
 * own page, [aboveTabBar], leaves Home to the tab bar. [onHome] is null
 * where there's no Home to go to, as in the player.
 */
@Composable
fun ErrorBox(
    title: String,
    message: String?,
    onRetry: (() -> Unit)?,
    modifier: Modifier = Modifier,
    aboveTabBar: Boolean = false,
    disconnected: Boolean = false,
    icon: Int = Lucide.CircleAlert,
    onHome: (() -> Unit)? = if (aboveTabBar) null else homeAction(),
) {
    Box(
        modifier.fillMaxSize().padding(bottom = visibleBottom(aboveTabBar)).padding(vertical = 32.dp),
        contentAlignment = Alignment.Center,
    ) {
        ErrorState(title, message, onRetry, icon = icon, disconnected = disconnected, onHome = onHome)
    }
}

/** Back to Home, unless offline, where Home is the downloads and pages hide the way there. */
@Composable
fun homeAction(): (() -> Unit)? {
    if (LocalOffline.current) return null
    val nav = LocalNavigator.current
    return nav::home
}

/**
 * [ErrorBox]'s content, for where it's one item of a list or the body of
 * a sheet rather than the whole page. [icon] is for a failure with its own,
 * like the catalog being down.
 */
@Composable
fun ErrorState(
    title: String,
    message: String?,
    onRetry: (() -> Unit)?,
    modifier: Modifier = Modifier,
    icon: Int = Lucide.CircleAlert,
    disconnected: Boolean = false,
    retrying: Boolean = false,
    onHome: (() -> Unit)? = null,
) {
    if (disconnected) {
        Disconnected(onRetry, modifier, retrying, onHome)
        return
    }
    Column(
        modifier.padding(horizontal = 32.dp).semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        LucideIcon(icon, null, size = 32.dp, tint = Palette.Muted)
        Gap(16.dp)
        val text = Modifier.widthIn(max = 360.dp)
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center, modifier = text)
        if (!message.isNullOrBlank() && message != title) {
            Gap(4.dp)
            Text(
                message,
                style = MaterialTheme.typography.bodyMedium,
                color = Palette.Muted,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = text,
            )
        }
        ErrorActions(onRetry, retrying, onHome)
    }
}

/**
 * What can't show without the server, while it can't be reached: the
 * disconnect icon and a way to try again, nothing more. Every page and
 * section shows the same, so being offline reads the same everywhere.
 */
@Composable
fun Disconnected(onRetry: (() -> Unit)?, modifier: Modifier = Modifier, retrying: Boolean = false, onHome: (() -> Unit)? = null) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        LucideIcon(Lucide.CloudOff, stringResource(R.string.server_unreachable), size = 32.dp, tint = Palette.Muted)
        ErrorActions(onRetry, retrying, onHome)
    }
}

/** Try again, and Back to Home beside it where there's one, in words only. */
@Composable
private fun ErrorActions(onRetry: (() -> Unit)?, retrying: Boolean, onHome: (() -> Unit)?) {
    if (onRetry == null && onHome == null) return
    Gap(20.dp)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (onRetry != null) {
            MatineeButton(onClick = onRetry, look = ButtonLook.Outline, enabled = !retrying) {
                Text(stringResource(R.string.common_retry))
            }
        }
        if (onHome != null) {
            MatineeButton(onClick = onHome, look = ButtonLook.Ghost) {
                Text(stringResource(R.string.common_back_home))
            }
        }
    }
}

/**
 * [ErrorState] in a section's place on a page that otherwise loaded, or
 * at the end of a list whose next page didn't: across the width, with
 * room above and below.
 */
@Composable
fun ErrorSection(
    title: String,
    message: String?,
    onRetry: (() -> Unit)?,
    modifier: Modifier = Modifier,
    retrying: Boolean = false,
    disconnected: Boolean = false,
    icon: Int = Lucide.CircleAlert,
) {
    ErrorState(
        title,
        message,
        onRetry,
        modifier.fillMaxWidth().padding(vertical = 24.dp),
        icon = icon,
        disconnected = disconnected,
        retrying = retrying,
    )
}

/** A rail that didn't load: its heading, so the reader knows which, over an [ErrorSection]. */
@Composable
fun RailFailed(title: String, onRetry: () -> Unit, retrying: Boolean = false, disconnected: Boolean = false) {
    Column(Modifier.fillMaxWidth()) {
        SectionTitle(title, Modifier.padding(horizontal = Gutter))
        ErrorSection(stringResource(R.string.rail_failed), null, onRetry, retrying = retrying, disconnected = disconnected)
    }
}

/**
 * For a page still showing what loaded before: the disconnect icon in its
 * top bar while [loaders] can't reach the server, tapped to try again.
 */
@Composable
fun DisconnectedAction(vararg loaders: Loader<*>) {
    val cut = loaders.filter { it.refreshError != null && it.refreshDisconnected }
    if (cut.isEmpty()) return
    RoundIconButton(
        Lucide.CloudOff,
        stringResource(R.string.server_unreachable),
        { cut.forEach { it.reload() } },
        size = 40.dp,
        iconSize = 20.dp,
        tint = Palette.Muted,
        background = Color.Transparent,
        enabled = cut.none { it.refreshing },
    )
}
