package io.github.zekurio.matinee.ui

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.navigation.NavHostController
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.TitleSummary
import kotlinx.serialization.Serializable

/* The app's screens, as the web app's routes in apps/web/src/routes. */

@Serializable
data object HomeRoute

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

@Serializable
data object SearchRoute

@Serializable
data object SettingsRoute

@Serializable
data object DownloadsRoute

/** [start] is -1 to resume where the person left off. */
@Serializable
data class PlayerRoute(val itemId: String, val start: Double = -1.0)

/** Moves between screens; one per signed-in app. */
class Navigator(private val controller: NavHostController) {
    fun back() {
        controller.popBackStack()
    }

    fun home() {
        controller.popBackStack(HomeRoute, inclusive = false)
    }

    fun library(id: String, sort: String? = null) = controller.navigate(LibraryRoute(id, sort)) {
        // Moving between libraries with the chips replaces the one showing.
        popUpTo(HomeRoute)
        launchSingleTop = true
    }

    fun title(id: String) = controller.navigate(TitleRoute(id))

    fun title(title: TitleSummary) = title(title.id)

    fun season(titleId: String, season: Int?) = controller.navigate(SeasonRoute(titleId, season ?: -1))

    fun episode(itemId: String) = controller.navigate(EpisodeRoute(itemId))

    /** A file's own page: the title's page for a movie, the episode's for the rest. */
    fun item(item: MediaItem) {
        val title = item.title
        if (title?.kind == TitleKind.MOVIE) title(title.id) else episode(item.id)
    }

    fun person(name: String) = controller.navigate(PersonRoute(name))

    fun genre(name: String) = controller.navigate(BrowseRoute(genre = name))

    fun studio(name: String) = controller.navigate(BrowseRoute(studio = name))

    fun search() = controller.navigate(SearchRoute) { launchSingleTop = true }

    fun settings() = controller.navigate(SettingsRoute) { launchSingleTop = true }

    fun downloads() = controller.navigate(DownloadsRoute) { launchSingleTop = true }

    /** Play a file from where the person left off, or from [start] seconds. */
    fun play(itemId: String, start: Double? = null) = controller.navigate(PlayerRoute(itemId, start ?: -1.0)) {
        launchSingleTop = true
    }

    /** The next episode from the player, in place of the one that ended. */
    fun playInstead(itemId: String) = controller.navigate(PlayerRoute(itemId, 0.0)) {
        popUpTo<PlayerRoute> { inclusive = true }
    }
}

val LocalNavigator = staticCompositionLocalOf<Navigator> { error("no navigator") }

/** The server is away and the app shows only what's downloaded. */
val LocalOffline = staticCompositionLocalOf { false }
