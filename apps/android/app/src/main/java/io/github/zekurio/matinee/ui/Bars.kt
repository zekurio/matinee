package io.github.zekurio.matinee.ui

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.components.Avatar
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LogoMark
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.components.SearchBarFrame
import io.github.zekurio.matinee.ui.components.SearchBarSlot
import io.github.zekurio.matinee.ui.components.SheetItem
import io.github.zekurio.matinee.ui.theme.Palette

/* The bars around pages: Home's header, the top bars of pages opened from a
 * tab, the floating buttons over a title's art, and the tabs at the bottom. */

/** The bottom bar's height, above the system's navigation bar. */
val BOTTOM_BAR_HEIGHT = 80.dp

/** What a tab's first page leaves free at its bottom, so its end clears the bottom bar. */
@Composable
fun tabBarPadding(): Dp {
    val system = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    return if (LocalOffline.current) system else system + BOTTOM_BAR_HEIGHT
}

private class Tab(val route: Any, @param:DrawableRes val icon: Int, @param:StringRes val label: Int)

private val TABS = listOf(
    Tab(HomeRoute, Lucide.House, R.string.tab_home),
    Tab(MediaRoute, Lucide.LibraryBig, R.string.tab_media),
    Tab(DownloadsRoute, Lucide.Download, R.string.downloads_title),
)

/**
 * The tabs, on the bottom of each tab's first page. They belong to the
 * page, so they move with it: aside under a page opened from it, and back
 * as that page slides off again.
 */
@Composable
fun BottomBar(current: Any?, onPick: (Any) -> Unit, modifier: Modifier = Modifier) {
    NavigationBar(
        modifier.drawBehind { drawLine(Palette.Border, Offset.Zero, Offset(size.width, 0f), 1.dp.toPx()) },
        containerColor = Palette.Background.copy(alpha = 0.96f),
        tonalElevation = 0.dp,
    ) {
        TABS.forEach { tab ->
            val label = stringResource(tab.label)
            NavigationBarItem(
                selected = current == tab.route,
                onClick = { onPick(tab.route) },
                icon = { LucideIcon(tab.icon, null, size = 22.dp) },
                label = { Text(label, style = MaterialTheme.typography.labelMedium) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = Palette.Foreground,
                    selectedTextColor = Palette.Foreground,
                    indicatorColor = Palette.Secondary,
                    unselectedIconColor = Palette.Muted,
                    unselectedTextColor = Palette.Muted,
                ),
            )
        }
    }
}

/**
 * Home's header: the logo, search, and the account. It sits at the top of
 * the page and scrolls away with it, over the art of the banner.
 */
@Composable
fun AppHeader(modifier: Modifier = Modifier) {
    val nav = LocalNavigator.current
    val offline = LocalOffline.current
    Box(
        modifier
            .fillMaxWidth()
            // Keeps the header readable over bright art, fading out a little
            // below it as on the web.
            .drawBehind {
                val height = size.height + 40.dp.toPx()
                drawRect(
                    Brush.verticalGradient(listOf(Palette.Background.copy(alpha = 0.7f), Color.Transparent), endY = height),
                    size = Size(size.width, height),
                )
            },
    ) {
        // The logo and the avatar sit on the page's gutter, like everything below them.
        Row(
            Modifier.statusBarsPadding().height(56.dp).fillMaxWidth().padding(start = Gutter - 8.dp, end = Gutter - 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) { LogoMark(Modifier.size(28.dp)) }
            Box(Modifier.weight(1f))
            if (offline) {
                LucideIcon(Lucide.CloudOff, stringResource(R.string.downloads_offline), size = 20.dp, tint = Palette.Muted)
                Box(Modifier.size(12.dp))
            } else {
                RoundIconButton(Lucide.Search, stringResource(R.string.search_title), nav::search, background = Color.Transparent, iconSize = 22.dp)
            }
            AccountButton()
        }
    }
}

/**
 * The search bar at the top of Media, as Findroid's: it opens search, and
 * holds the account at its end. The search page puts its own field in the
 * same place, so opening it looks like the bar opening.
 */
@Composable
fun SearchHeader(modifier: Modifier = Modifier) {
    val nav = LocalNavigator.current
    SearchBarSlot(modifier) {
        SearchBarFrame(onClick = nav::search) {
            Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) {
                LucideIcon(Lucide.Search, null, size = 20.dp, tint = Palette.Foreground.copy(alpha = 0.8f))
            }
            Text(
                stringResource(R.string.search_field),
                style = MaterialTheme.typography.bodyLarge,
                color = Palette.Foreground.copy(alpha = 0.7f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).padding(end = 12.dp),
            )
            AccountButton(size = 30.dp)
        }
    }
}

/**
 * The top of a page opened from a tab, as Findroid's: back, the page's
 * name, and what the page can do. Stays put while the page scrolls.
 */
@Composable
fun TopBar(
    title: String?,
    modifier: Modifier = Modifier,
    back: Boolean = true,
    home: Boolean = false,
    actions: @Composable RowScope.() -> Unit = {},
) {
    val nav = LocalNavigator.current
    Row(
        modifier
            .fillMaxWidth()
            .background(Palette.Background)
            .statusBarsPadding()
            .height(64.dp)
            .padding(start = if (back) 4.dp else Gutter, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (back) {
            RoundIconButton(Lucide.ArrowLeft, stringResource(R.string.common_back), nav::back, size = 48.dp, iconSize = 24.dp, background = Color.Transparent)
        }
        if (home && !LocalOffline.current) {
            RoundIconButton(Lucide.House, stringResource(R.string.shell_home_link), nav::home, size = 48.dp, iconSize = 22.dp, background = Color.Transparent)
        }
        if (title != null) {
            Text(
                title,
                style = MaterialTheme.typography.titleLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).padding(start = if (back) 4.dp else 0.dp),
            )
        } else {
            Box(Modifier.weight(1f))
        }
        actions()
    }
}

/**
 * Back and Home over a title's, season's, or episode's art, with the page
 * above it, like the show of a season, in a pill. Pinned to the top while
 * the page scrolls under it, so the way back is always there.
 */
@Composable
fun ItemTopBar(modifier: Modifier = Modifier, parent: String? = null, onParent: (() -> Unit)? = null) {
    val nav = LocalNavigator.current
    Row(
        modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RoundIconButton(Lucide.ArrowLeft, stringResource(R.string.common_back), nav::back, iconSize = 22.dp, background = FLOATING)
        if (!LocalOffline.current) {
            RoundIconButton(Lucide.House, stringResource(R.string.shell_home_link), nav::home, iconSize = 20.dp, background = FLOATING)
        }
        if (parent != null && onParent != null) {
            Box(
                Modifier
                    .weight(1f, fill = false)
                    .height(44.dp)
                    .clip(CircleShape)
                    .background(FLOATING)
                    .clickable(onClick = onParent)
                    .padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(parent, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** Dark enough to read over any art, as Findroid's black at 70 %. */
private val FLOATING = Color.Black.copy(alpha = 0.55f)

/** The signed-in person's picture, which opens their menu. */
@Composable
fun AccountButton(modifier: Modifier = Modifier, size: Dp = 36.dp) {
    val user = LocalUser.current
    val api = LocalApi.current
    var open by rememberSaveable { mutableStateOf(false) }
    Box(
        modifier.size(44.dp).clip(CircleShape).clickable(onClickLabel = stringResource(R.string.shell_account, user.name)) { open = true },
        contentAlignment = Alignment.Center,
    ) {
        Avatar(user.name, user.avatarId?.let(api.paths::avatar), size = size)
    }
    if (open) AccountSheet(onDismiss = { open = false })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AccountSheet(onDismiss: () -> Unit) {
    val nav = LocalNavigator.current
    val user = LocalUser.current
    val api = LocalApi.current
    val session = LocalContext.current.app.session
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Palette.Raised, dragHandle = null) {
        Column(Modifier.navigationBarsPadding().padding(vertical = 12.dp)) {
            Row(
                Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Avatar(user.name, user.avatarId?.let(api.paths::avatar), size = 44.dp)
                Column {
                    Text(user.name, style = MaterialTheme.typography.titleMedium)
                    if (user.displayName != null) Text("@${user.username}", style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                }
            }
            HorizontalDivider(Modifier.padding(vertical = 6.dp), color = Palette.Border)
            if (LocalOffline.current) {
                SheetItem(Lucide.RefreshCw, stringResource(R.string.downloads_reconnect)) {
                    onDismiss()
                    session.start()
                }
            } else {
                SheetItem(Lucide.Settings, stringResource(R.string.shell_settings)) {
                    onDismiss()
                    nav.settings()
                }
            }
            HorizontalDivider(Modifier.padding(vertical = 6.dp), color = Palette.Border)
            SheetItem(Lucide.LogOut, stringResource(R.string.shell_sign_out), destructive = true) {
                onDismiss()
                session.signOut()
            }
        }
    }
}

/**
 * Keeps the status bar's icons readable once a page scrolls under it. It
 * deepens with the first few dp of scrolling, as the page's top slides under
 * the bar, and fades from the top edge down to nothing, so there's no band
 * across the art while the page sits at its top.
 */
@Composable
fun StatusBarScrim(state: LazyListState, modifier: Modifier = Modifier) {
    val distance = with(LocalDensity.current) { 40.dp.toPx() }
    Box(
        modifier
            .fillMaxWidth()
            .windowInsetsTopHeight(WindowInsets.statusBars)
            .drawBehind {
                // Read while drawing, so scrolling only redraws this.
                val shown = if (state.firstVisibleItemIndex > 0) 1f else (state.firstVisibleItemScrollOffset / distance).coerceIn(0f, 1f)
                if (shown == 0f) return@drawBehind
                // Past the bar by half its height, so the fade has room.
                val height = size.height * 1.5f
                val shade = Palette.Background
                drawRect(
                    Brush.verticalGradient(
                        0f to shade.copy(alpha = 0.9f * shown),
                        0.6f to shade.copy(alpha = 0.6f * shown),
                        1f to Color.Transparent,
                        endY = height,
                    ),
                    size = Size(size.width, height),
                )
            },
    )
}
