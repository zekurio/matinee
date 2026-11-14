package io.github.zekurio.matinee.ui

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.name
import io.github.zekurio.matinee.ui.components.Avatar
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.RoundIconButton
import io.github.zekurio.matinee.ui.kit.focusRing
import io.github.zekurio.matinee.ui.theme.Palette

/* The bars around pages: Home's header, the top bars of pages opened from a
 * tab, the floating buttons over a title's art, and the tabs at the bottom. */

/** The floating tab bar's own height. */
private val TAB_BAR_HEIGHT = 60.dp

/** How far the tab bar floats above the system's navigation bar. */
private val TAB_BAR_LIFT = 12.dp

/**
 * What the tab bar takes from the bottom of a page, above the system's
 * navigation bar: itself, the gap under it, and a gap above so a page's
 * last row and the snackbar clear it.
 */
val BOTTOM_BAR_HEIGHT = TAB_BAR_HEIGHT + TAB_BAR_LIFT + 8.dp

/** What a tab's first page leaves free at its bottom, so its end clears the tab bar. */
@Composable
fun tabBarPadding(): Dp = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + BOTTOM_BAR_HEIGHT

/** A tab in the capsule; [icon] null draws the signed-in person's picture instead. */
private class Tab(val route: Any, @param:DrawableRes val icon: Int?, @param:StringRes val label: Int)

private val TABS = listOf(
    Tab(HomeRoute, Lucide.House, R.string.tab_home),
    Tab(MediaRoute, Lucide.LibraryBig, R.string.tab_media),
    Tab(DownloadsRoute, Lucide.Download, R.string.downloads_title),
    Tab(ProfileRoute, null, R.string.tab_profile),
)

/** Offline, only what works without the server: Home from the downloads, the downloads, and the profile with settings. */
private val OFFLINE_TABS = TABS.filter { it.route == HomeRoute || it.route == DownloadsRoute || it.route == ProfileRoute }

private val TabBarShape = RoundedCornerShape(percent = 50)
private val ITEM_HEIGHT = TAB_BAR_HEIGHT - 8.dp

/**
 * The tabs, on the bottom of each tab's first page, floating over the page,
 * which scrolls on under them: a capsule of the tabs, and search in a
 * circle of its own beside it, as iOS lays them out. The open tab shows
 * its name beside its icon in a pill; the rest show only their icons.
 * It's ours rather than Material's navigation bar, made of the app's own
 * colors and shapes, so it looks the same on every Android version and
 * carries over to iOS as it is.
 *
 * The tabs belong to the page, so they move with it: aside under a page
 * opened from it, and back as that page slides off again. With the
 * keyboard up, as on the search page, they step aside for it.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BottomBar(current: Any?, onPick: (Any) -> Unit, modifier: Modifier = Modifier) {
    if (WindowInsets.isImeVisible) return
    val offline = LocalOffline.current
    val tabs = if (offline) OFFLINE_TABS else TABS
    Row(
        modifier
            .fillMaxWidth()
            // The page fades out under the bar, which Android can't blur
            // behind it as iOS does, so rows passing beneath don't fight its labels.
            .drawBehind {
                drawRect(Brush.verticalGradient(0f to Color.Transparent, 0.55f to Palette.Background.copy(alpha = 0.85f), 1f to Palette.Background))
            }
            .padding(top = 28.dp)
            .navigationBarsPadding()
            .padding(bottom = TAB_BAR_LIFT),
        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier
                .floating(TabBarShape)
                .padding(4.dp)
                .selectableGroup()
                // The open tab's pill grows and shrinks rather than jumping.
                .animateContentSize(Motion.move()),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            tabs.forEach { tab -> TabItem(tab, current == tab.route) { onPick(tab.route) } }
        }
        if (!offline) {
            Box(Modifier.floating(CircleShape).padding(4.dp)) {
                TabButton(current == SearchRoute, Modifier.size(ITEM_HEIGHT), Role.Tab, { onPick(SearchRoute) }) { color ->
                    LucideIcon(Lucide.Search, stringResource(R.string.search_title), size = 22.dp, tint = color)
                }
            }
        }
    }
}

/** The bar's surfaces: the app's raised color with a faint rim, lifted off the page by a shadow. */
private fun Modifier.floating(shape: Shape): Modifier = this
    .shadow(24.dp, shape, ambientColor = Color.Black, spotColor = Color.Black)
    .clip(shape)
    .background(Palette.Raised)
    .border(1.dp, Palette.Foreground.copy(alpha = 0.08f), shape)

@Composable
private fun TabItem(tab: Tab, selected: Boolean, onClick: () -> Unit) {
    val label = stringResource(tab.label)
    TabButton(
        selected,
        Modifier
            .height(ITEM_HEIGHT)
            .widthIn(min = ITEM_HEIGHT + 4.dp)
            .semantics { contentDescription = label },
        Role.Tab,
        onClick,
    ) { color ->
        Row(
            Modifier.padding(horizontal = if (selected) 18.dp else 0.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (tab.icon != null) {
                LucideIcon(tab.icon, null, size = 22.dp, tint = color)
            } else {
                val user = LocalUser.current
                val api = LocalApi.current
                Box(
                    Modifier
                        .size(28.dp)
                        .then(if (selected) Modifier.border(1.5.dp, Palette.Foreground, CircleShape) else Modifier)
                        .padding(if (selected) 2.dp else 0.dp),
                ) {
                    Avatar(user.name, user.avatarId?.let(api.paths::avatar), size = if (selected) 24.dp else 28.dp)
                }
            }
            if (selected) {
                Text(label, style = MaterialTheme.typography.labelLarge, color = color, maxLines = 1)
            }
        }
    }
}

/** A tab's touch target: a pill behind it while it's open, and a little give when pressed. */
@Composable
private fun TabButton(
    selected: Boolean,
    modifier: Modifier,
    role: Role,
    onClick: () -> Unit,
    content: @Composable (color: Color) -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val color by animateColorAsState(if (selected) Palette.Foreground else Palette.Muted, Motion.color(), label = "tabColor")
    val fill by animateColorAsState(if (selected) Palette.Foreground.copy(alpha = 0.1f) else Color.Transparent, Motion.color(), label = "tabFill")
    val scale by animateFloatAsState(if (pressed) 0.92f else 1f, Motion.color(), label = "tabPress")
    Box(
        modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .clip(TabBarShape)
            .background(fill)
            .focusRing(interaction, TabBarShape)
            .selectable(selected, interaction, indication = null, role = role, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { content(color) }
}

/**
 * Home's header: room for the status bar over the banner's art, faded for
 * it to read, and whether the app is offline. It scrolls away with the
 * page. The banner's own title logo carries the top, so there's no app
 * logo competing with it; search and the account are in the tab bar.
 */
@Composable
fun AppHeader(modifier: Modifier = Modifier, action: @Composable () -> Unit = {}) {
    val offline = LocalOffline.current
    val statusBar = WindowInsets.statusBars.getTop(LocalDensity.current).toFloat()
    Box(
        modifier
            .fillMaxWidth()
            // Keeps the header readable over bright art, fading out a little
            // below it as on the web. Behind the status bar it's denser:
            // Android picks each part of the bar's icons light or dark by
            // what's behind it, so over bright art the clock went dark while
            // the rest stayed light, a different mix for every slide.
            .drawBehind {
                val height = size.height + 40.dp.toPx()
                val bar = (statusBar / height).coerceIn(0f, 1f)
                drawRect(
                    Brush.verticalGradient(
                        0f to Palette.Background.copy(alpha = 0.85f),
                        bar to Palette.Background.copy(alpha = 0.75f),
                        1f to Color.Transparent,
                        endY = height,
                    ),
                    size = Size(size.width, height),
                )
            },
    ) {
        Row(
            Modifier.statusBarsPadding().height(56.dp).fillMaxWidth().padding(horizontal = Gutter),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (offline) LucideIcon(Lucide.CloudOff, stringResource(R.string.downloads_offline), size = 20.dp, tint = Palette.Muted)
            else action()
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
    /** What back does instead of leaving, as a page that holds itself open. */
    onBack: (() -> Unit)? = null,
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
            RoundIconButton(Lucide.ArrowLeft, stringResource(R.string.common_back), onBack ?: nav::back, size = 48.dp, iconSize = 24.dp, background = Color.Transparent)
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

/** The page's color veiling the art behind a floating button, as the web's bars have it. */
private val FLOATING get() = Palette.Background.copy(alpha = 0.6f)

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
                val scrolled = if (state.firstVisibleItemIndex > 0) 1f else (state.firstVisibleItemScrollOffset / distance).coerceIn(0f, 1f)
                // Never quite clear: Android picks the status bar's icons light
                // or dark by what's behind each of them, so over bright art
                // they'd come out mixed. A light shade keeps them the theme's.
                val shown = 0.75f + 0.25f * scrolled
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
