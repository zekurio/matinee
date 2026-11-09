package io.github.zekurio.matinee.ui

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.PlayerActivity
import kotlinx.serialization.Serializable

/* The app's screens, as the web app's routes in apps/web/src/routes. */

@Serializable
data object HomeRoute

/** The libraries, favorites, and search: the second tab. */
@Serializable
data object MediaRoute

@Serializable
data object FavoritesRoute

@Serializable
data class LibraryRoute(val id: String, val sort: String? = null)

@Serializable
data class TitleRoute(val id: String)

/** [season] is -1 for the files without a season number. */
@Serializable
data class SeasonRoute(val titleId: String, val season: Int)

@Serializable
data class EpisodeRoute(val itemId: String)

@Serializable
data class PersonRoute(val name: String)

@Serializable
data class BrowseRoute(val genre: String? = null, val studio: String? = null)

/** Search across the server: a tab, the circle beside the tab bar. */
@Serializable
data object SearchRoute

/** Everything the signed-in person watched last, a file per title, from the profile. */
@Serializable
data object RecentRoute

/** The signed-in person, behind their picture in the tab bar, with the way to Settings. */
@Serializable
data object ProfileRoute

@Serializable
data object SettingsRoute

/** One of Settings' categories, by `SettingsPage.key`. */
@Serializable
data class SettingsPageRoute(val page: String)

/** Signing in a TV or another app by its QR code or code, from Settings' Account page. */
@Serializable
data object LinkDeviceRoute

@Serializable
data object DownloadsRoute

/** A downloaded show's episodes. */
@Serializable
data class DownloadsShowRoute(val titleId: String)

/** An admin picking the provider entry a title is, when its match is wrong or missing. */
@Serializable
data class IdentifyRoute(val titleId: String)

/** An admin's image editor for a title, or with [season], a season, and with [episode] too, an episode; -1 for neither. */
@Serializable
data class ImagesRoute(val titleId: String, val season: Int = -1, val episode: Int = -1)

/** The tab bar's tabs, by the route of each one's first page, in its order: the capsule, then search. */
val TAB_ROUTES: List<Any> = listOf(HomeRoute, MediaRoute, DownloadsRoute, ProfileRoute, SearchRoute)

/** Moves between screens; one per signed-in app. */
class Navigator(private val controller: NavHostController) {
    fun back() {
        controller.popBackStack()
    }

    /** Home's first page, from anywhere. */
    fun home() {
        controller.popBackStack(HomeRoute, inclusive = false)
    }

    /**
     * A tab's first page. The first tab's page is under every other tab's,
     * so back from one goes there, and a tab picked again starts over at its
     * first page. That's Home, or Downloads offline, where the app starts.
     */
    fun tab(route: Any) {
        // The bar shows only on a tab's first page, so picking the open tab has nowhere to go.
        if (controller.currentBackStackEntry?.destination?.hasRoute(route::class) == true) return
        val start = controller.graph.findStartDestination()
        if (start.hasRoute(route::class)) {
            controller.popBackStack(start.id, inclusive = false)
            return
        }
        controller.navigate(route) {
            popUpTo(start.id)
            launchSingleTop = true
        }
    }

    fun media() = tab(MediaRoute)

    fun downloads() = tab(DownloadsRoute)

    fun downloadsShow(titleId: String) = controller.navigate(DownloadsShowRoute(titleId)) { launchSingleTop = true }

    fun favorites() = controller.navigate(FavoritesRoute) { launchSingleTop = true }

    fun recent() = controller.navigate(RecentRoute) { launchSingleTop = true }

    fun library(id: String, sort: String? = null) = controller.navigate(LibraryRoute(id, sort))

    fun title(id: String) = controller.navigate(TitleRoute(id))

    fun title(title: TitleSummary) = title(title.id)

    /** A title's page from one of its seasons or episodes: back to it when it's what came before. */
    fun titleUp(id: String) {
        if (!controller.popBackStack(TitleRoute(id), inclusive = false)) title(id)
    }

    fun season(titleId: String, season: Int?) = controller.navigate(SeasonRoute(titleId, season ?: -1))

    /** A season's page from one of its episodes: back to it when it's what came before. */
    fun seasonUp(titleId: String, season: Int?) {
        if (!controller.popBackStack(SeasonRoute(titleId, season ?: -1), inclusive = false)) season(titleId, season)
    }

    fun episode(itemId: String) = controller.navigate(EpisodeRoute(itemId))

    /** A file's own page: the title's page for a movie, the episode's for the rest. */
    fun item(item: MediaItem) {
        val title = item.title
        if (title?.kind == TitleKind.MOVIE) title(title.id) else episode(item.id)
    }

    fun person(name: String) = controller.navigate(PersonRoute(name))

    fun genre(name: String) = controller.navigate(BrowseRoute(genre = name))

    fun studio(name: String) = controller.navigate(BrowseRoute(studio = name))

    fun search() = tab(SearchRoute)

    fun profile() = tab(ProfileRoute)

    fun settings() = controller.navigate(SettingsRoute) { launchSingleTop = true }

    fun settingsPage(page: String) = controller.navigate(SettingsPageRoute(page)) { launchSingleTop = true }

    fun linkDevice() = controller.navigate(LinkDeviceRoute) { launchSingleTop = true }

    fun identify(titleId: String) = controller.navigate(IdentifyRoute(titleId)) { launchSingleTop = true }

    fun images(titleId: String, season: Int? = null, episode: Int? = null) =
        controller.navigate(ImagesRoute(titleId, season ?: -1, episode ?: -1)) { launchSingleTop = true }

    /** Play a file from where the person left off, or from [start] seconds, in the player's own activity. */
    fun play(itemId: String, start: Double? = null) = PlayerActivity.start(controller.context, itemId, start)
}

val LocalNavigator = staticCompositionLocalOf<Navigator> { error("no navigator") }

/** The server is away and the app shows only what's downloaded. */
val LocalOffline = staticCompositionLocalOf { false }
