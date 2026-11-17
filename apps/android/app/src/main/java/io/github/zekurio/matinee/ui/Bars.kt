package io.github.zekurio.matinee.ui

import android.content.res.Resources
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.HazeState
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.isAdmin
import io.github.zekurio.matinee.api.name
import io.github.zekurio.matinee.ui.components.Avatar
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Logo
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.RoundIconButton
import io.github.zekurio.matinee.ui.kit.SearchPillButton
import io.github.zekurio.matinee.ui.kit.TabBar
import io.github.zekurio.matinee.ui.kit.TabBarDefaults
import io.github.zekurio.matinee.ui.kit.TabBarItem
import io.github.zekurio.matinee.ui.kit.TabBarState
import io.github.zekurio.matinee.ui.kit.focusRing
import io.github.zekurio.matinee.ui.requests.LocalRequests
import io.github.zekurio.matinee.ui.theme.Palette

/* The bars around pages: Home's header, the top bars of pages opened from a
 * tab, the floating buttons over a title's art, and the tabs at the bottom. */

/**
 * What the tab bar takes from the bottom of the screen, above the
 * system's navigation bar: 60 at the default font size. Toasts rise over it.
 */
@Composable
fun tabBarHeight(): Dp = TabBarDefaults.height()

/**
 * What a tab's first page leaves free at its bottom, so its end clears the
 * tab bar, or the keyboard while that's up and the bar has stepped aside.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun tabBarPadding(): Dp {
    val bar = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + tabBarHeight()
    val keyboard = WindowInsets.ime.asPaddingValues().calculateBottomPadding()
    return if (WindowInsets.isImeVisible) maxOf(keyboard, bar - tabBarHeight()) else bar
}

/** The bar's tabs, by the route of each one's first page. */
private fun tabItem(page: ShellPage, res: Resources) = when (page) {
    ShellPage.Home -> TabBarItem(HomeRoute, Lucide.House, res.getString(R.string.tab_home))
    ShellPage.Media -> TabBarItem(MediaRoute, Lucide.LibraryBig, res.getString(R.string.tab_media))
    ShellPage.Downloads -> TabBarItem(DownloadsRoute, Lucide.Download, res.getString(R.string.downloads_title))
    // Neither has a tab: the profile opens from Home's header, and search is Media's field.
    ShellPage.Profile, ShellPage.Search -> null
}

/**
 * The tabs, on the bottom of each tab's first page, after Findroid's:
 * Home, Media, and Downloads, or offline Home and Downloads, each always
 * named (the kit's [TabBar]). The page scrolls on under their frost. They
 * belong to the page, so a page opened from it covers them. With the
 * keyboard up, as while searching Media, they step aside for it. [state]
 * is the app's, so a tab's capsule grows once when it opens, not again
 * each time its page comes back.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun BottomBar(current: Any?, onPick: (Any) -> Unit, page: HazeState, state: TabBarState?, modifier: Modifier = Modifier) {
    if (WindowInsets.isImeVisible) return
    val res = LocalResources.current
    val offline = LocalOffline.current
    val items = remember(res, offline) { shellTabs(offline).mapNotNull { tabItem(it, res) } }
    TabBar(items, current, onPick, page, modifier, state)
}

/**
 * Home's header, over its featured titles and over offline Home's rows,
 * after Findroid's: the logo at the start; then whether the app is
 * offline, or [action], the icon to reach the server again; search, which
 * opens Media with its field taking the keyboard, and isn't there offline,
 * where there's nothing to search; and the account, which opens the
 * profile on top of Home. It scrolls away with the page.
 *
 * It's [HEADER_HEIGHT] tall right under the status bar, the band Media's
 * search field sits in, so the search button's middle and the field's are
 * on one line and what's under each starts at the same height. Search is
 * the kit's pill at its narrowest, and with motion on it grows into
 * Media's field (SearchMorph.kt).
 */
@Composable
fun AppHeader(modifier: Modifier = Modifier, action: @Composable () -> Unit = {}) {
    val offline = LocalOffline.current
    val nav = LocalNavigator.current
    val reduced = rememberReducedMotion()
    Row(
        // The account's 44 reaches 2 past its picture, which ends on the gutter as the logo starts on it.
        modifier.fillMaxWidth().statusBarsPadding().heightIn(min = HEADER_HEIGHT).padding(start = Gutter, end = Gutter - 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Logo(Modifier.semantics { heading() }, height = 18.dp)
        Box(Modifier.weight(1f))
        if (offline) {
            LucideIcon(Lucide.CloudOff, stringResource(R.string.downloads_offline), size = 20.dp, tint = Palette.Muted, modifier = Modifier.padding(horizontal = 8.dp))
        } else {
            action()
            SearchPillButton(
                stringResource(R.string.search_title),
                { nav.search(morph = searchMorphs(SearchOrigin.Home, reduced)) },
                // 2 from what's before it, as the 48 round buttons leave.
                Modifier.padding(start = 2.dp).searchMorphButton(),
            )
            // Its edge 8 from the account's picture, which sits 2 inside the account's 44.
            Box(Modifier.width(6.dp))
        }
        AccountButton()
    }
}

/**
 * The band under the status bar that Home's header and Media's search
 * field share: 56, with their 40 tall button and field in its middle, 8
 * above and below. A page's content starts 8 under it.
 */
val HEADER_HEIGHT = 56.dp

/**
 * The account at the end of Home's header, as Findroid's user button: the
 * person's picture, or their initials, opening the profile. An admin gets
 * the accent's dot on it while requests need them, as the web's avatar
 * has it; TalkBack reads the count, and the profile's inbox has it.
 */
@Composable
private fun AccountButton() {
    val user = LocalUser.current
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val waiting = if (user.isAdmin) LocalRequests.current.needsYou else 0
    val label = stringResource(R.string.tab_profile)
    val interaction = remember { MutableInteractionSource() }
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .focusRing(interaction, CircleShape)
            .clickable(interaction, LocalIndication.current, role = Role.Button, onClick = nav::profile)
            .semantics {
                contentDescription = label
                if (waiting > 0) stateDescription = res.getQuantityString(R.plurals.web_requests_menuWaiting, waiting, waiting)
            },
        contentAlignment = Alignment.Center,
    ) {
        Box {
            Avatar(user.name, user.avatarId?.let(api.paths::avatar), size = 40.dp)
            if (waiting > 0) {
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(Palette.Accent)
                        .border(1.5.dp, Palette.Background, CircleShape),
                )
            }
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

