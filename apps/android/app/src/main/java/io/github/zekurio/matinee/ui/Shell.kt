package io.github.zekurio.matinee.ui

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavDestination
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import io.github.zekurio.matinee.api.ImageTarget
import io.github.zekurio.matinee.api.User
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.ui.browse.BrowseScreen
import io.github.zekurio.matinee.ui.browse.LibraryScreen
import io.github.zekurio.matinee.ui.browse.PersonScreen
import io.github.zekurio.matinee.ui.components.Actions
import io.github.zekurio.matinee.ui.components.ActionsSheet
import io.github.zekurio.matinee.ui.components.LocalActions
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.downloads.DownloadsScreen
import io.github.zekurio.matinee.ui.downloads.DownloadsShowScreen
import io.github.zekurio.matinee.ui.home.HomeScreen
import io.github.zekurio.matinee.ui.kit.TabBarState
import io.github.zekurio.matinee.ui.kit.ToastHost
import io.github.zekurio.matinee.ui.kit.rememberTabBarState
import io.github.zekurio.matinee.ui.kit.ToastState
import io.github.zekurio.matinee.ui.media.FavoritesScreen
import io.github.zekurio.matinee.ui.media.MediaScreen
import io.github.zekurio.matinee.ui.metadata.IdentifyScreen
import io.github.zekurio.matinee.ui.metadata.ImagesScreen
import io.github.zekurio.matinee.ui.profile.ProfileScreen
import io.github.zekurio.matinee.ui.profile.RecentScreen
import io.github.zekurio.matinee.ui.requests.AskedScreen
import io.github.zekurio.matinee.ui.requests.CatalogBrowseScreen
import io.github.zekurio.matinee.ui.requests.CatalogScreen
import io.github.zekurio.matinee.ui.requests.LocalRequests
import io.github.zekurio.matinee.ui.requests.RequestsAround
import io.github.zekurio.matinee.ui.requests.RequestsHub
import io.github.zekurio.matinee.ui.requests.RequestsScreen
import io.github.zekurio.matinee.ui.settings.LinkDeviceScreen
import io.github.zekurio.matinee.ui.settings.SettingsPageScreen
import io.github.zekurio.matinee.ui.settings.SettingsScreen
import io.github.zekurio.matinee.ui.settings.admin.FolderPickerScreen
import io.github.zekurio.matinee.ui.settings.admin.LibraryEditorScreen
import io.github.zekurio.matinee.ui.theme.LocalTv
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.title.EpisodeScreen
import io.github.zekurio.matinee.ui.title.SeasonScreen
import io.github.zekurio.matinee.ui.title.TitleScreen
import io.github.zekurio.matinee.ui.tv.TvSignedInApp
import java.io.IOException
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException

/** The signed-in account. */
val LocalUser = staticCompositionLocalOf<User> { error("not signed in") }

/**
 * The signed-in app as Findroid lays it out: Home, Media, and Downloads in
 * a bar along the bottom of their first pages, or offline Home and
 * Downloads (`shellTabs`). Pages opened from them have none. Search is the
 * field at the top of Media, and the profile a page on Home, opened from
 * the account in Home's header.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SignedInApp(session: Session, user: User, offline: Boolean = false) {
    // A TV has pages of its own; none of the phone's are composed there.
    if (LocalTv.current) {
        TvSignedInApp(session, user)
        return
    }
    val controller = rememberNavController()
    val navigator = remember(controller, offline) { Navigator(controller, offline) }
    val actionScope = rememberCoroutineScope()
    val actions = remember { Actions(actionScope) }
    val snackbar = remember { ToastState() }
    val api = session.requireApi()
    val requests = remember(api) { RequestsHub(api, actionScope, snackbar) }
    requests.resources = LocalResources.current
    CompositionLocalProvider(
        LocalApi provides api,
        LocalNavigator provides navigator,
        LocalActions provides actions,
        LocalSnackbar provides snackbar,
        LocalUser provides user,
        LocalOffline provides offline,
        LocalRequests provides requests,
    ) {
        Box(Modifier.fillMaxSize()) {
            val entry by controller.currentBackStackEntryAsState()
            val tab = entry?.destination?.let(::tabOf)
            // The open tab's capsule, the same on every page's copy of the bar, and left be while a page covers it.
            val tabs = rememberTabBarState(tab, TAB_ROUTES)
            SharedTransitionLayout {
                CompositionLocalProvider(LocalPageTransitions provides this, LocalTabBarState provides tabs) {
                    Pages(controller, session)
                }
            }
            val bar = tab != null && !WindowInsets.isImeVisible
            ToastHost(
                snackbar,
                Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = if (bar) tabBarHeight() + 8.dp else 0.dp),
            )
        }
        ActionsSheet(actions)
        if (!offline) {
            FollowPlaybackOptions()
            RequestsAround()
        }
    }
}

/**
 * Asks for the account's `playback.options` each time the app comes back,
 * so what it offers, like downloads, follows what the server allows now.
 */
@Composable
private fun FollowPlaybackOptions() {
    val app = LocalContext.current.app
    val api = LocalApi.current
    val scope = rememberCoroutineScope()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        scope.launch {
            try {
                app.viewer.options = api.playback.options()
            } catch (_: IOException) {
                // What it said last still holds; the next return asks again.
            } catch (_: SerializationException) {
                // Likewise for an answer this app can't read.
            }
        }
    }
}

@Composable
private fun Pages(controller: NavHostController, session: Session) {
    NavHost(
        controller,
        startDestination = HomeRoute,
        // A new page slides in from the end over the one it covers, and going
        // back slides it off again to uncover the page below: the same motion
        // played backwards, by the back button or following the back gesture.
        // Navigation's own gesture motion shrinks the page instead, and fades
        // the one below in, which isn't how either page came. The covered
        // page only moves aside, without fading: a fade blends the page into
        // the background under it, so going back showed its art and colors
        // shifting as they came back to full. Each page has its own
        // background, so they never show through each other. Tabs slide
        // side by side. Timings are Motion's.
        enterTransition = { enter(pop = false) },
        exitTransition = { exit(pop = false) },
        popEnterTransition = { enter(pop = true) },
        popExitTransition = { exit(pop = true) },
        predictivePopEnterTransition = { enter(pop = true) },
        predictivePopExitTransition = { exit(pop = true) },
    ) {
        screen<HomeRoute>(tab = HomeRoute) { HomeScreen() }
        screen<MediaRoute>(tab = MediaRoute) { MediaScreen() }
        screen<FavoritesRoute> { FavoritesScreen() }
        screen<RecentRoute> { RecentScreen() }
        screen<LibraryRoute> { LibraryScreen(it.toRoute<LibraryRoute>()) }
        screen<TitleRoute> { TitleScreen(it.toRoute<TitleRoute>().id) }
        screen<SeasonRoute> {
            val route = it.toRoute<SeasonRoute>()
            SeasonScreen(route.titleId, route.season.takeIf { season -> season >= 0 })
        }
        screen<EpisodeRoute> { EpisodeScreen(it.toRoute<EpisodeRoute>().itemId) }
        screen<PersonRoute> { it.toRoute<PersonRoute>().let { route -> PersonScreen(route.name, route.tmdbId) } }
        screen<BrowseRoute> {
            val route = it.toRoute<BrowseRoute>()
            BrowseScreen(route.genre, route.studio)
        }
        // Search was a tab once; a back stack an older version saved may still have it.
        screen<SearchRoute> {
            val nav = LocalNavigator.current
            LaunchedEffect(Unit) { nav.searchInstead() }
        }
        screen<ProfileRoute> { ProfileScreen(session) }
        screen<SettingsRoute> { SettingsScreen(session) }
        screen<SettingsPageRoute> { SettingsPageScreen(session, it.toRoute<SettingsPageRoute>().page) }
        screen<LinkDeviceRoute> { LinkDeviceScreen() }
        screen<LibraryEditorRoute> { LibraryEditorScreen(it.toRoute<LibraryEditorRoute>().id, it.savedStateHandle) }
        screen<FolderPickerRoute> {
            val route = it.toRoute<FolderPickerRoute>()
            FolderPickerScreen(route.start, route.added)
        }
        screen<IdentifyRoute> { IdentifyScreen(it.toRoute<IdentifyRoute>().titleId) }
        screen<ImagesRoute> {
            val route = it.toRoute<ImagesRoute>()
            ImagesScreen(ImageTarget(route.titleId, route.season.takeIf { s -> s >= 0 }, route.episode.takeIf { e -> e >= 0 }))
        }
        screen<DownloadsRoute>(tab = DownloadsRoute) { DownloadsScreen() }
        screen<DownloadsShowRoute> { DownloadsShowScreen(it.toRoute<DownloadsShowRoute>().titleId) }
        screen<CatalogRoute> { CatalogScreen(it.toRoute<CatalogRoute>()) }
        screen<CatalogBrowseRoute> {
            val route = it.toRoute<CatalogBrowseRoute>()
            CatalogBrowseScreen(route.kind, route.filters, route.sort)
        }
        screen<AskedRoute> { AskedScreen() }
        screen<RequestsRoute> { RequestsScreen(it.toRoute<RequestsRoute>().list) }
    }
}

/** The layout the pages move in, which carries the bottom bar from one tab's page to the next. */
private val LocalPageTransitions = staticCompositionLocalOf<SharedTransitionScope?> { null }

/** Which tab the bar shows as open, for every page's copy of it. */
private val LocalTabBarState = staticCompositionLocalOf<TabBarState?> { null }

/**
 * The bottom bar on a tab's first page. Between two tabs it's the same bar
 * on both pages, so it holds still while they slide past it; to any other
 * page it goes along with its own.
 */
@Composable
private fun TabBar(tab: Any, page: AnimatedVisibilityScope, haze: HazeState, modifier: Modifier = Modifier) {
    val nav = LocalNavigator.current
    val transitions = LocalPageTransitions.current
    val shared = if (transitions == null) Modifier else with(transitions) {
        Modifier.sharedElement(rememberSharedContentState(TabBarKey), page)
    }
    BottomBar(tab, nav::tab, haze, LocalTabBarState.current, modifier.then(shared))
}

private const val TabBarKey = "tab-bar"

/** The tab whose first page [destination] is, if it's one. */
private fun tabOf(destination: NavDestination): Any? = TAB_ROUTES.firstOrNull { destination.hasRoute(it::class) }

/** How two pages trade places. */
private enum class Move {
    /** One page opened from another, or closed to go back to it. */
    Page,

    /** One tab's first page for another's, in the order of the bottom bar. */
    Tab,
}

private fun AnimatedContentTransitionScope<NavBackStackEntry>.move(): Move {
    val from = initialState.destination
    val to = targetState.destination
    return when {
        tabOf(from) != null && tabOf(to) != null -> Move.Tab
        else -> Move.Page
    }
}

private fun AnimatedContentTransitionScope<NavBackStackEntry>.enter(pop: Boolean): EnterTransition = when (move()) {
    Move.Page -> if (pop) uncoveredIn() else coverIn()
    Move.Tab -> slideInHorizontally(slide()) { it * tabStep() }
}

private fun AnimatedContentTransitionScope<NavBackStackEntry>.exit(pop: Boolean): ExitTransition = when (move()) {
    Move.Page -> if (pop) uncoverOut() else coveredOut()
    Move.Tab -> slideOutHorizontally(slide()) { -it * tabStep() }
}

/**
 * Which way tabs slide: 1 when the tab picked sits after the one left in
 * the bar, so its page comes in from the end, -1 when it sits before. Back
 * from Media or Downloads to Home is the same move, so it slides the same.
 */
private fun AnimatedContentTransitionScope<NavBackStackEntry>.tabStep(): Int {
    val from = TAB_ROUTES.indexOf(tabOf(initialState.destination))
    val to = TAB_ROUTES.indexOf(tabOf(targetState.destination))
    return if (to > from) 1 else -1
}

/** How far the covered page moves aside: a quarter of the width, for depth. */
private fun aside(width: Int) = width / 4

/** Pages move as everything else that moves: the web's 280 ms, off at once and settling softly. */
private fun <T> slide() = Motion.move<T>()

private fun coverIn(): EnterTransition = slideInHorizontally(slide()) { it }

private fun coveredOut(): ExitTransition = slideOutHorizontally(slide()) { -aside(it) }

private fun uncoveredIn(): EnterTransition = slideInHorizontally(slide()) { -aside(it) }

private fun uncoverOut(): ExitTransition = slideOutHorizontally(slide()) { it }

/**
 * A page on the background of its own, so pages coming and going never show
 * through each other, with the bottom bar if it's [tab]'s first page. A
 * page that loses the screen lets go of the keyboard as it starts to leave,
 * rather than leaving it over the page coming in. A tab's page is what its
 * bar blurs, so the bar sits beside it rather than in it.
 */
private inline fun <reified T : Any> NavGraphBuilder.screen(
    tab: Any? = null,
    noinline content: @Composable (NavBackStackEntry) -> Unit,
) {
    composable<T> { entry ->
        val keyboard = LocalSoftwareKeyboardController.current
        val focus = LocalFocusManager.current
        DisposableEffect(entry) {
            val observer = LifecycleEventObserver { _, event ->
                if (event == Lifecycle.Event.ON_PAUSE) {
                    focus.clearFocus(force = true)
                    keyboard?.hide()
                }
            }
            entry.lifecycle.addObserver(observer)
            onDispose { entry.lifecycle.removeObserver(observer) }
        }
        Box(Modifier.fillMaxSize()) {
            val haze = rememberHazeState()
            Box(
                Modifier
                    .fillMaxSize()
                    .then(if (tab != null) Modifier.hazeSource(haze) else Modifier)
                    .background(Palette.Background),
            ) { content(entry) }
            if (tab != null) TabBar(tab, this@composable, haze, Modifier.align(Alignment.BottomCenter))
        }
    }
}
