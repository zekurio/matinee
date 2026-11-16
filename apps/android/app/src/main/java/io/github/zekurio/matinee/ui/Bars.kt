package io.github.zekurio.matinee.ui

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.EaseInOut
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.HazeInput
import dev.chrisbanes.haze.HazeProgressive
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.blur.HazeBlurStyle
import dev.chrisbanes.haze.blur.HazeColorEffect
import dev.chrisbanes.haze.blur.hazeBlur
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.name
import io.github.zekurio.matinee.ui.components.Avatar
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Logo
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.RoundIconButton
import io.github.zekurio.matinee.ui.kit.focusRing
import io.github.zekurio.matinee.ui.requests.LocalRequests
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
 * keyboard up, as on the search page, they step aside for it. They're
 * frosted glass over [page], the page they float on, which shows through
 * them blurred.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BottomBar(current: Any?, onPick: (Any) -> Unit, page: HazeState, modifier: Modifier = Modifier) {
    if (WindowInsets.isImeVisible) return
    val offline = LocalOffline.current
    val tabs = if (offline) OFFLINE_TABS else TABS
    val glass = rememberTabBarGlass()
    Row(
        modifier
            .fillMaxWidth()
            .padding(top = 28.dp)
            .navigationBarsPadding()
            .padding(bottom = TAB_BAR_LIFT),
        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier
                .floating(TabBarShape, page, glass)
                .padding(4.dp)
                .selectableGroup()
                // The open tab's pill grows and shrinks rather than jumping.
                .animateContentSize(Motion.move()),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            tabs.forEach { tab -> TabItem(tab, current == tab.route) { onPick(tab.route) } }
        }
        if (!offline) {
            Box(Modifier.floating(CircleShape, page, glass).padding(4.dp)) {
                TabButton(current == SearchRoute, Modifier.size(ITEM_HEIGHT), Role.Tab, { onPick(SearchRoute) }) { color ->
                    LucideIcon(Lucide.Search, stringResource(R.string.search_title), size = 22.dp, tint = color)
                }
            }
        }
    }
}

/**
 * The bar's glass: the page under it blurred, under a thin veil of the
 * app's raised color, so the art and rows passing beneath show through as
 * color and the icons stay readable. Android 11 and older can't blur, so
 * there the veil is nearly opaque instead.
 */
@Composable
private fun rememberTabBarGlass(): HazeBlurStyle {
    val raised = Palette.Raised
    val background = Palette.Background
    return remember(raised, background) {
        HazeBlurStyle {
            blurRadius(28.dp)
            noiseFactor(0.08f)
            // Behind the page's own transparent parts, as on screen.
            backgroundColor(background)
            colorEffects(listOf(HazeColorEffect.tint(raised.copy(alpha = 0.5f))))
            fallbackColorEffect(HazeColorEffect.tint(raised.copy(alpha = 0.92f)))
        }
    }
}

/** The bar's surfaces: [glass] over [page], with a faint rim, lifted off the page by a shadow. */
private fun Modifier.floating(shape: Shape, page: HazeState, glass: HazeBlurStyle): Modifier = this
    .shadow(20.dp, shape, ambientColor = Color.Black, spotColor = Color.Black)
    .clip(shape)
    .hazeBlur(HazeInput.Sources(page), glass)
    .border(1.dp, Palette.Foreground.copy(alpha = 0.1f), shape)

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
                    // An admin's dot while requests wait or need them, as on the web's avatar.
                    if (LocalRequests.current.needsYou > 0) {
                        Box(
                            Modifier
                                .align(Alignment.TopEnd)
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(Palette.Accent)
                                .border(1.5.dp, Palette.Raised, CircleShape),
                        )
                    }
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
 * Home's header, over its featured titles and over offline Home's rows:
 * the logo, as the top edge a tab's first page has, and whether the app is
 * offline, or [action], as the icon to reach the server again. It sits under
 * the status bar and scrolls away with the page. The shade under the status
 * bar once the page scrolls is Home's [StatusBarScrim], not this. Search and
 * the account are in the tab bar.
 */
@Composable
fun AppHeader(modifier: Modifier = Modifier, action: @Composable () -> Unit = {}) {
    val offline = LocalOffline.current
    Box(modifier.fillMaxWidth()) {
        Row(
            Modifier.statusBarsPadding().height(56.dp).fillMaxWidth().padding(horizontal = Gutter),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Logo(Modifier.semantics { heading() }, height = 20.dp)
            Box(Modifier.weight(1f))
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

/** How far the status bar's frost feathers out below the bar. */
private val STATUS_BAR_FEATHER = 48.dp

/**
 * Keeps the status bar's icons readable over art and once a page scrolls
 * under it: [page], the list under the bar, blurred and veiled in the
 * page's color, evenly across the whole bar. The old gradient faded out
 * within the bar, so its icons sat half on shade and half on bare art,
 * which read as a bar split in two. Below the bar the frost thins out over
 * [STATUS_BAR_FEATHER]: the blur itself eases off as the veil fades, so
 * the art comes back sharp gradually instead of a blurred band ending on a
 * line. The veil deepens over the first few dp of scrolling, as the page's
 * top slides under the bar. Android 11 and older can't blur, and get a veil.
 */
@Composable
fun StatusBarScrim(state: LazyListState, page: HazeState, modifier: Modifier = Modifier) {
    val density = LocalDensity.current
    val distance = with(density) { 40.dp.toPx() }
    val bar = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    val total = bar + STATUS_BAR_FEATHER
    val barPx = with(density) { bar.toPx() }
    val totalPx = with(density) { total.toPx() }
    // Where the bar ends, as a fraction of the frost's height.
    val edge = bar / total
    val shade = Palette.Background
    // Read while drawing, so scrolling only redraws the frost.
    val scrolled = { if (state.firstVisibleItemIndex > 0) 1f else (state.firstVisibleItemScrollOffset / distance).coerceIn(0f, 1f) }
    val frost = remember(shade, edge, barPx, totalPx, state, distance) {
        HazeBlurStyle {
            blurRadius(16.dp)
            noiseFactor(0f)
            backgroundColor(shade)
            // Light at rest, so the art shows through, but never clear.
            colorEffects(listOf(HazeColorEffect.tint(shade.copy(alpha = 0.35f + 0.4f * scrolled()))))
            fallbackColorEffect(HazeColorEffect.tint(shade.copy(alpha = 0.6f + 0.25f * scrolled())))
            // Full blur across the bar, easing to none by the frost's end.
            progressive(
                HazeProgressive.verticalGradient(
                    easing = EaseInOut,
                    startY = barPx,
                    startIntensity = 1f,
                    endY = totalPx,
                    endIntensity = 0f,
                ),
            )
            // And the veil whole across the bar, then a smoothstep out, so
            // neither end of the fade shows as an edge.
            val feather = 1f - edge
            mask(
                Brush.verticalGradient(
                    0f to Color.Black,
                    edge to Color.Black,
                    edge + feather * 0.25f to Color.Black.copy(alpha = 0.84f),
                    edge + feather * 0.5f to Color.Black.copy(alpha = 0.5f),
                    edge + feather * 0.75f to Color.Black.copy(alpha = 0.16f),
                    1f to Color.Transparent,
                ),
            )
        }
    }
    Box(
        modifier
            .fillMaxWidth()
            .height(total)
            .hazeBlur(HazeInput.Sources(page), frost),
    )
}
