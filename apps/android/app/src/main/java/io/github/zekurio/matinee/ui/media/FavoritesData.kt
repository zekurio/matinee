package io.github.zekurio.matinee.ui.media

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import io.github.zekurio.matinee.api.Favorite
import io.github.zekurio.matinee.api.Favorites
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.ViewerState
import io.github.zekurio.matinee.ui.rememberLoader

private const val LIMIT = 200

/**
 * What Favorites loads, for the phone's page and the TV's alike: the
 * signed-in person's shows, seasons, episodes, and movies, each newest
 * first. The server answers null only for someone who doesn't share
 * them, never for one's own, and that reads as none here.
 */
class FavoritesLoader(val loader: Loader<Favorites?>) {
    /**
     * The lists, null while they load, each without what was taken off here
     * or elsewhere, so it goes at once, before they're fetched again.
     */
    fun lists(viewer: ViewerState): Favorites? {
        val state = loader.state as? Load.Ready ?: return null
        val all = state.value ?: return EMPTY
        return Favorites(
            shows = all.shows.filter(viewer::isFavorite),
            seasons = all.seasons.filter { viewer.isFavorite(it.title, it.season) },
            episodes = all.episodes.filter(viewer::isFavorite),
            movies = all.movies.filter(viewer::isFavorite),
        )
    }

    private companion object {
        val EMPTY = Favorites(emptyList(), emptyList(), emptyList(), emptyList())
    }
}

/** No favorites of any kind. */
val Favorites.isEmpty: Boolean get() = shows.isEmpty() && seasons.isEmpty() && episodes.isEmpty() && movies.isEmpty()

/** Whether [favorite] is still one, with the marks made here over what the server sent. */
fun ViewerState.isFavorite(favorite: Favorite): Boolean = when (favorite) {
    is Favorite.Movie -> isFavorite(favorite.title)
    is Favorite.Show -> isFavorite(favorite.title)
    is Favorite.ShowSeason -> isFavorite(favorite.title, favorite.season)
    is Favorite.Episode -> isFavorite(favorite.item)
}

@Composable
fun rememberFavorites(): FavoritesLoader {
    val username = LocalUser.current.username
    val loader = rememberLoader("favorites-$username") { profiles.favorites(username, LIMIT) }
    return remember(loader) { FavoritesLoader(loader) }
}
