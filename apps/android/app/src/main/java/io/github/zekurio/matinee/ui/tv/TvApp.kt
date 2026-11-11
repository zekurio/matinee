package io.github.zekurio.matinee.ui.tv

import androidx.activity.compose.BackHandler
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.Library
import io.github.zekurio.matinee.api.LibraryKind
import io.github.zekurio.matinee.api.User
import io.github.zekurio.matinee.api.name
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.ui.BrowseRoute
import io.github.zekurio.matinee.ui.EpisodeRoute
import io.github.zekurio.matinee.ui.FavoritesRoute
import io.github.zekurio.matinee.ui.HomeRoute
import io.github.zekurio.matinee.ui.LibraryRoute
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.Navigator
import io.github.zekurio.matinee.ui.PersonRoute
import io.github.zekurio.matinee.ui.ProfileRoute
import io.github.zekurio.matinee.ui.RecentRoute
import io.github.zekurio.matinee.ui.RefreshOnResume
import io.github.zekurio.matinee.ui.SearchRoute
import io.github.zekurio.matinee.ui.SeasonRoute
import io.github.zekurio.matinee.ui.SettingsPageRoute
import io.github.zekurio.matinee.ui.SettingsRoute
import io.github.zekurio.matinee.ui.TitleRoute
import io.github.zekurio.matinee.ui.components.Actions
import io.github.zekurio.matinee.ui.components.LocalActions
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.detail.TvEpisodeScreen
import io.github.zekurio.matinee.ui.tv.detail.TvPersonScreen
import io.github.zekurio.matinee.ui.tv.detail.TvSeasonScreen
import io.github.zekurio.matinee.ui.tv.detail.TvTitleScreen
import io.github.zekurio.matinee.ui.tv.browse.TvBrowseScreen
import io.github.zekurio.matinee.ui.tv.browse.TvFavoritesScreen
import io.github.zekurio.matinee.ui.tv.browse.TvLibraryScreen
import io.github.zekurio.matinee.ui.tv.browse.TvSearchScreen
import io.github.zekurio.matinee.ui.tv.home.TvHomeScreen
import io.github.zekurio.matinee.ui.tv.profile.TvProfileScreen
import io.github.zekurio.matinee.ui.tv.profile.TvRecentScreen
import io.github.zekurio.matinee.ui.tv.settings.TvSettingsScreen

/**
 * The signed-in app on a TV: its own pages, under a drawer at the left
 * edge, over the backdrop the page picks, with the clock at the top right.
 * The routes and [Navigator] are the phone's; the screens are all TV ones.
 * Downloads, offline mode, the admin pages, the image editor, identify, and
 * linking by camera have no TV page, so nothing here leads to them.
 */
@Composable
fun TvSignedInApp(session: Session, user: User) {
    val controller = rememberNavController()
    val navigator = remember(controller) { Navigator(controller) }
    val actionScope = rememberCoroutineScope()
    // The phone's actions, shown in the TV's own panel rather than its sheet.
    val actions = remember { Actions(actionScope) }
    val menu = remember(actions) { TvMenu(actions) }
    val snackbar = remember { SnackbarHostState() }
    val backdrop = remember { TvBackdrop() }
    val drawer = remember { DrawerState() }
    val page = remember { FocusRequester() }
    val pageFocus = remember { TvPageFocus() }
    val panels = remember { TvOpenPanels() }
    val scrolled = remember { TvScrolledPages() }
    val toPage = { if (pageFocus.restore?.invoke() != true) runCatching { page.requestFocus() } }
    CompositionLocalProvider(
        LocalApi provides session.requireApi(),
        LocalNavigator provides navigator,
        LocalActions provides actions,
        LocalSnackbar provides snackbar,
        LocalUser provides user,
        LocalTvBackdrop provides backdrop,
        LocalTvPageFocus provides pageFocus,
        LocalTvMenu provides menu,
        LocalTvOpenPanels provides panels,
        LocalTvScrolledPages provides scrolled,
    ) {
        val stack by controller.currentBackStack.collectAsState()
        val current = drawerKey(stack)
        val shown = stack.lastOrNull()?.takeUnless { it.destination.hasRoute<RecentRoute>() }?.let(::entryKey)
        val onHome = stack.lastOrNull()?.destination?.hasRoute<HomeRoute>() == true
        Box(Modifier.fillMaxSize().background(Palette.Background)) {
            BackdropLayer(backdrop)
            Box(
                Modifier
                    .fillMaxSize()
                    .focusRequester(page)
                    .focusGroup(),
            ) {
                Pages(controller)
            }
            // Lowered so it lines up with the profile picture at the top of the rail.
            // Gone under a panel, and while a page has scrolled its content up to it.
            val clock by animateFloatAsState(if (panels.count > 0 || scrolled.count > 0) 0f else 1f, Motion.color(), label = "clock")
            TvClock(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = Overscan.Vertical + 11.dp, end = Overscan.Horizontal)
                    .graphicsLayer { alpha = clock },
            )
            Drawer(user, current, shown, drawer, navigator, onLeave = { toPage() })
            TvActionsPanel(menu, fallback = { toPage() })
            SnackbarHost(
                snackbar,
                Modifier.align(Alignment.BottomCenter).padding(start = TvPage.Start, end = TvPage.End, bottom = Overscan.Vertical + 16.dp),
            ) { data ->
                Text(
                    data.visuals.message,
                    style = TvType.Body,
                    color = Palette.Foreground,
                    modifier = Modifier
                        .widthIn(max = 560.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(Palette.Raised)
                        .padding(horizontal = 24.dp, vertical = 14.dp),
                )
            }
        }
        // After the pages, so these come before the NavHost's own Back.
        // Home with the drawer shut: Back opens it; with it open, Back leaves the app.
        // The actions panel, while open, takes Back itself.
        BackHandler(enabled = onHome && !drawer.isOpen && !menu.isOpen) { drawer.open() }
        BackHandler(enabled = !onHome && drawer.isOpen && !menu.isOpen) { toPage() }
    }
}

@Composable
private fun Drawer(user: User, current: String, shown: String?, state: DrawerState, nav: Navigator, onLeave: () -> Unit) {
    val api = LocalApi.current
    val libraries = rememberLoader("libraries") { libraries.list() }
    RefreshOnResume(libraries)
    val list = (libraries.state as? Load.Ready)?.value.orEmpty()
    val profile = DrawerEntry(PROFILE, user.name, null, ProfileRoute)
    val entries = listOf(
        DrawerEntry(SEARCH, stringResource(R.string.search_title), Lucide.Search, SearchRoute),
        DrawerEntry(HOME, stringResource(R.string.tab_home), Lucide.House, HomeRoute),
        DrawerEntry(FAVORITES, stringResource(R.string.favorites_title), Lucide.Heart, FavoritesRoute),
    ) + list.map { DrawerEntry(libraryKey(it.id), it.name, libraryIcon(it), LibraryRoute(it.id)) }
    val settings = DrawerEntry(SETTINGS, stringResource(R.string.shell_settings), Lucide.Settings, SettingsRoute)
    TvDrawer(
        top = profile,
        avatar = DrawerAvatar(user.name, user.avatarId?.let(api.paths::avatar)),
        entries = entries,
        bottom = settings,
        current = current,
        state = state,
        onPick = { entry ->
            // The page on screen already: back to it rather than open it again.
            // A page opened from it, like a title from Home, goes back to the entry's own page.
            if (entry.key == shown) onLeave() else nav.drawer(entry.route)
        },
        onLeave = onLeave,
    )
}

private fun libraryIcon(library: Library) = if (library.kind == LibraryKind.SHOWS) Lucide.Tv else Lucide.Film

private const val PROFILE = "profile"
private const val SEARCH = "search"
private const val HOME = "home"
private const val FAVORITES = "favorites"
private const val SETTINGS = "settings"

private fun libraryKey(id: String) = "library-$id"

/** The drawer's entry to mark for the page on screen: its own, or that of the nearest page under it that has one. */
private fun drawerKey(stack: List<NavBackStackEntry>): String = stack.asReversed().firstNotNullOfOrNull(::entryKey) ?: HOME

/** The drawer entry a page belongs to, if any. */
private fun entryKey(entry: NavBackStackEntry): String? {
    val destination = entry.destination
    return when {
        destination.hasRoute<HomeRoute>() -> HOME
        destination.hasRoute<SearchRoute>() -> SEARCH
        destination.hasRoute<FavoritesRoute>() -> FAVORITES
        destination.hasRoute<SettingsRoute>() || destination.hasRoute<SettingsPageRoute>() -> SETTINGS
        destination.hasRoute<ProfileRoute>() || destination.hasRoute<RecentRoute>() -> PROFILE
        destination.hasRoute<LibraryRoute>() -> libraryKey(entry.toRoute<LibraryRoute>().id)
        else -> null
    }
}

/**
 * The TV's pages, by the phone's routes. Pages change with a short fade,
 * the old one gone before the new one is in. The phone's pages that a TV
 * leaves out (downloads, the admin pages, the image editor, identify, and
 * linking a device) have no route here.
 */
@Composable
private fun Pages(controller: androidx.navigation.NavHostController) {
    NavHost(
        controller,
        startDestination = HomeRoute,
        enterTransition = { pageIn() },
        exitTransition = { pageOut() },
        popEnterTransition = { pageIn() },
        popExitTransition = { pageOut() },
    ) {
        composable<HomeRoute> { TvHomeScreen() }
        composable<SearchRoute> { TvSearchScreen() }
        composable<FavoritesRoute> { TvFavoritesScreen() }
        composable<LibraryRoute> { TvLibraryScreen(it.toRoute()) }
        composable<TitleRoute> { TvTitleScreen(it.toRoute<TitleRoute>().id) }
        composable<SeasonRoute> { entry ->
            val route = entry.toRoute<SeasonRoute>()
            TvSeasonScreen(route.titleId, route.season.takeIf { it >= 0 })
        }
        composable<EpisodeRoute> { TvEpisodeScreen(it.toRoute<EpisodeRoute>().itemId) }
        composable<PersonRoute> { TvPersonScreen(it.toRoute<PersonRoute>().name) }
        composable<BrowseRoute> { it.toRoute<BrowseRoute>().let { route -> TvBrowseScreen(route.genre, route.studio) } }
        composable<ProfileRoute> { TvProfileScreen() }
        composable<RecentRoute> { TvRecentScreen() }
        composable<SettingsRoute> { TvSettingsScreen() }
        composable<SettingsPageRoute> { TvSettingsScreen(it.toRoute<SettingsPageRoute>().page) }
    }
}

private fun pageIn(): EnterTransition = fadeIn(tween(Motion.ENTER_MS, delayMillis = Motion.EXIT_MS / 2, easing = Motion.Easing))

private fun pageOut(): ExitTransition = fadeOut(tween(Motion.EXIT_MS, easing = Motion.ExitEasing))
