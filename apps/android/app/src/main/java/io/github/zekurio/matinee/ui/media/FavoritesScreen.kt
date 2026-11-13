package io.github.zekurio.matinee.ui.media

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.components.EpisodeCard
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.LoadingBox
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.PosterCard
import io.github.zekurio.matinee.ui.components.Rail
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.SeasonPosterCard
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * What the person marked as favorites, a rail for each kind, as the web's
 * page: shows, seasons, episodes, and movies, each newest first, and only
 * the kinds that have any.
 */
@Composable
fun FavoritesScreen() {
    val viewer = LocalContext.current.app.viewer
    val favorites = rememberFavorites()
    val loader = favorites.loader
    Column(Modifier.fillMaxSize()) {
        TopBar(stringResource(R.string.favorites_title))
        val lists = favorites.lists(viewer)
        val failed = loader.state as? Load.Failed
        when {
            failed != null -> ErrorBox(stringResource(R.string.favorites_load_failed), failed.message, loader::reload, disconnected = failed.disconnected)
            lists == null -> LoadingBox()
            lists.isEmpty -> Empty()
            else -> LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = 8.dp, bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(32.dp),
            ) {
                rail(R.string.favorites_shows, lists.shows, { it.id }, RailArt.Poster) { title, modifier ->
                    PosterCard(title, title.year?.toString(), modifier)
                }
                rail(R.string.favorites_seasons, lists.seasons, { "${it.title.id}/${it.season.number}" }, RailArt.Poster) { entry, modifier ->
                    SeasonPosterCard(entry.title, entry.season, modifier)
                }
                rail(R.string.favorites_episodes, lists.episodes, { it.id }, RailArt.Landscape) { item, modifier ->
                    EpisodeCard(item, modifier)
                }
                rail(R.string.favorites_movies, lists.movies, { it.id }, RailArt.Poster) { title, modifier ->
                    PosterCard(title, title.year?.toString(), modifier)
                }
                item(key = "bottom") { Box(Modifier.navigationBarsPadding()) }
            }
        }
    }
}

/** A rail of [entries] under [heading], left out when there are none. */
private fun <T> LazyListScope.rail(
    @StringRes heading: Int,
    entries: List<T>,
    key: (T) -> String,
    art: RailArt,
    card: @Composable (T, Modifier) -> Unit,
) {
    if (entries.isEmpty()) return
    item(key = heading) {
        Rail(stringResource(heading)) {
            items(entries, key = key) { entry -> card(entry, Modifier.width(railItemWidth(art))) }
        }
    }
}

@Composable
private fun Empty() {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 64.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        LucideIcon(Lucide.Heart, null, size = 28.dp, tint = Palette.Muted)
        Gap(12.dp)
        Text(stringResource(R.string.favorites_empty), style = MaterialTheme.typography.titleMedium)
        Gap(4.dp)
        Text(
            stringResource(R.string.favorites_empty_hint),
            style = MaterialTheme.typography.bodyMedium,
            color = Palette.Muted,
            textAlign = TextAlign.Center,
        )
    }
}
