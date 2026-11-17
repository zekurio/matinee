package io.github.zekurio.matinee.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import io.github.zekurio.matinee.api.CatalogRef
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.PlayerActivity
import kotlinx.serialization.Serializable

/* The app's screens, as the web app's routes in apps/web/src/routes. */

@Serializable
data object HomeRoute

/** The libraries, with search at the top: the second tab. */
@Serializable
data object MediaRoute

@Serializable
data object FavoritesRoute

@Serializable
data class LibraryRoute(val id: String, val sort: String? = null)

/** Every title of one [kind] (`TitleKind`) from all libraries together: the TV drawer's Movies and Shows. */
@Serializable
data class KindRoute(val kind: String)

@Serializable
data class TitleRoute(val id: String)

/** [season] is -1 for the files without a season number. */
@Serializable
data class SeasonRoute(val titleId: String, val season: Int)

@Serializable
data class EpisodeRoute(val itemId: String)

@Serializable
data class PersonRoute(val name: String, val tmdbId: String? = null)

@Serializable
data class BrowseRoute(val genre: String? = null, val studio: String? = null)

/**
 * Search across the server: the TV's search page. On a phone search is
 * Media's field, and this only stands in for it, as a back stack saved by
 * an older version may still hold it (`Navigator.search`).
 */
@Serializable
data object SearchRoute

/** Everything the signed-in person watched last, a file per title, from the profile. */
@Serializable
data object RecentRoute

/** The signed-in person, with the way to Settings: on a phone a page on Home, behind the account in Home's header. */
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

/**
 * A title the server doesn't have, by the reference the server issued:
 * kind, provider, and the id there. [library] is the library an ask would
 * go to, when the viewer picked one of two.
 */
@Serializable
data class CatalogRoute(val kind: String, val provider: String, val providerId: String, val library: String? = null)

/**
 * All of TMDB's movies or shows with filters, or the viewer's
 * recommendations of them, from Discover, by `TitleKind`. A Discover
 * row's heading opens it with the row's [filters], as `CatalogFilters`
 * JSON, and [sort].
 */
@Serializable
data class CatalogBrowseRoute(val kind: String, val filters: String? = null, val sort: String? = null)

/** Everything the signed-in person asked for, from Home's rail and the profile. */
@Serializable
data object AskedRoute

/** An admin's requests, opening on [list]: waiting, needsAttention, onTheWay, or done. */
@Serializable
data class RequestsRoute(val list: String = "waiting")

/** An admin's image editor for a title, or with [season], a season, and with [episode] too, an episode; -1 for neither. */
@Serializable
data class ImagesRoute(val titleId: String, val season: Int = -1, val episode: Int = -1)

/** An admin adding a library, or with [id], changing one. */
@Serializable
data class LibraryEditorRoute(val id: String? = null)

/** The server's folders, for the library being edited: opening at [start], with the folders in [added] marked. */
@Serializable
data class FolderPickerRoute(val start: String? = null, val added: List<String> = emptyList())

/** The route of [page]'s first page. */
val ShellPage.route: Any
    get() = when (this) {
        ShellPage.Home -> HomeRoute
        ShellPage.Media -> MediaRoute
        ShellPage.Downloads -> DownloadsRoute
        ShellPage.Profile -> ProfileRoute
        ShellPage.Search -> SearchRoute
    }

/** Every tab the phone's bar can have, by the route of each one's first page, in its order (`shellTabs`). */
val TAB_ROUTES: List<Any> = shellTabs(offline = false).map { it.route }

/**
 * Moves between screens; one per signed-in app. [offline] is the shell's,
 * which decides where search and the profile land (`shellLanding`).
 */
class Navigator(private val controller: NavHostController, private val offline: Boolean = false) {
    /**
     * Search was asked for: Media opens with search open, and its field
     * takes the keyboard once Media's page is up, and puts this back.
     */
    var searchPending by mutableStateOf(false)

    /**
     * Opens [page] where it lives (`shellLanding`): a tab as [tab] does,
     * search as Media with its field taking the keyboard, and the profile
     * as a page on Home.
     */
    fun go(page: ShellPage) {
        val landing = shellLanding(page, offline)
        if (landing.focusesSearch) searchPending = true
        tab(landing.tab.route)
        if (landing.underProfile) controller.navigate(ProfileRoute) { launchSingleTop = true }
    }

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
     * first page. That's Home, where the app starts, online and offline.
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

    /**
     * A page from the TV's drawer, on top of Home so Back goes there. Home
     * itself goes back to Home's page.
     */
    fun drawer(route: Any) {
        val start = controller.graph.findStartDestination()
        if (start.hasRoute(route::class)) {
            controller.popBackStack(start.id, inclusive = false)
            return
        }
        controller.navigate(route) { popUpTo(start.id) }
    }

    fun downloads() = tab(DownloadsRoute)

    fun downloadsShow(titleId: String) = controller.navigate(DownloadsShowRoute(titleId)) { launchSingleTop = true }

    fun favorites() = controller.navigate(FavoritesRoute) { launchSingleTop = true }

    fun recent() = controller.navigate(RecentRoute) { launchSingleTop = true }

    fun library(id: String, sort: String? = null) = controller.navigate(LibraryRoute(id, sort))

    fun title(id: String) = controller.navigate(TitleRoute(id))

    fun title(title: TitleSummary) = title(title.id)

    /** A title the server doesn't have, or its library page once it's here. */
    fun catalog(ref: CatalogRef, library: String? = null) =
        controller.navigate(CatalogRoute(ref.kind, ref.provider, ref.providerId, library))

    /** A catalog page that became a library title, as it arrived: the title's page takes its place. */
    fun arrived(titleId: String) = controller.navigate(TitleRoute(titleId)) {
        popUpTo<CatalogRoute> { inclusive = true }
    }

    fun catalogBrowse(kind: String, filters: String? = null, sort: String? = null) =
        controller.navigate(CatalogBrowseRoute(kind, filters, sort)) { launchSingleTop = true }

    fun asked() = controller.navigate(AskedRoute) { launchSingleTop = true }

    fun requests(list: String = "waiting") = controller.navigate(RequestsRoute(list)) { launchSingleTop = true }

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

    /** Someone's page, by their TMDB id too where a TMDB title's credit has it. */
    fun person(name: String, tmdbId: String? = null) = controller.navigate(PersonRoute(name, tmdbId))

    fun genre(name: String) = controller.navigate(BrowseRoute(genre = name))

    fun studio(name: String) = controller.navigate(BrowseRoute(studio = name))

    /** Search: Media with its field taking the keyboard. */
    fun search() = go(ShellPage.Search)

    /** The profile, on top of Home. */
    fun profile() = go(ShellPage.Profile)

    /**
     * Search from a [SearchRoute] left on the back stack by an older
     * version, where search was a tab: Media with search open in its place.
     */
    fun searchInstead() {
        searchPending = true
        controller.navigate(MediaRoute) {
            popUpTo<SearchRoute> { inclusive = true }
            launchSingleTop = true
        }
    }

    fun settings() = controller.navigate(SettingsRoute) { launchSingleTop = true }

    fun settingsPage(page: String) = controller.navigate(SettingsPageRoute(page)) { launchSingleTop = true }

    fun libraryEditor(id: String? = null) = controller.navigate(LibraryEditorRoute(id)) { launchSingleTop = true }

    fun folderPicker(start: String?, added: List<String>) = controller.navigate(FolderPickerRoute(start, added)) { launchSingleTop = true }

    /** Back to the page under this one, leaving it [value] under [key], as a picker hands back what it picked. */
    fun backWith(key: String, value: String) {
        controller.previousBackStackEntry?.savedStateHandle?.set(key, value)
        controller.popBackStack()
    }

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
