package io.github.zekurio.matinee.ui.media

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.ViewerState
import io.github.zekurio.matinee.ui.rememberLoader

private const val LIMIT = 200

/** What Favorites loads, for the phone's page and the TV's alike: the titles and the episodes, newest first. */
class FavoritesLoaders(val titles: Loader<List<TitleSummary>>, val items: Loader<List<MediaItem>>) {
    /** The titles, null while they load. One taken off here or elsewhere goes at once, before the list is fetched again. */
    fun titles(viewer: ViewerState): List<TitleSummary>? = (titles.state as? Load.Ready)?.value?.filter(viewer::isFavorite)

    /** The episodes, empty while they load or when they failed. */
    fun episodes(viewer: ViewerState): List<MediaItem> = (items.state as? Load.Ready)?.value?.filter(viewer::isFavorite).orEmpty()
}

@Composable
fun rememberFavorites(): FavoritesLoaders {
    val titles = rememberLoader("favorites") { favorites.list(LIMIT) }
    val items = rememberLoader("favoriteItems") { favorites.items(LIMIT) }
    return remember(titles, items) { FavoritesLoaders(titles, items) }
}
