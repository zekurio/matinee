package io.github.zekurio.matinee.ui.media

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.LoadingBox
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.PosterCard
import io.github.zekurio.matinee.ui.components.SectionTitle
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette

private const val LIMIT = 200

/** The titles and episodes the person marked as favorites, newest first. */
@Composable
fun FavoritesScreen() {
    val viewer = LocalContext.current.app.viewer
    val titles = rememberLoader("favorites") { favorites.list(LIMIT) }
    val items = rememberLoader("favoriteItems") { favorites.items(LIMIT) }
    Column(Modifier.fillMaxSize()) {
        TopBar(stringResource(R.string.favorites_title))
        // One taken off here or elsewhere goes at once, before the list is fetched again.
        val shows = (titles.state as? Load.Ready)?.value?.filter(viewer::isFavorite)
        val episodes = (items.state as? Load.Ready)?.value?.filter(viewer::isFavorite).orEmpty()
        val failed = titles.state as? Load.Failed
        when {
            failed != null -> ErrorBox(stringResource(R.string.favorites_load_failed), failed.message, titles::reload, disconnected = failed.disconnected)
            shows == null -> LoadingBox()
            shows.isEmpty() && episodes.isEmpty() -> Empty()
            else -> LazyVerticalGrid(
                columns = GridCells.Adaptive(150.dp),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = Gutter, end = Gutter, top = 8.dp, bottom = 32.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                if (shows.isNotEmpty() && episodes.isNotEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "titles") { SectionTitle(stringResource(R.string.favorites_titles)) }
                }
                items(shows, key = { it.id }) { title -> PosterCard(title, title.year?.toString()) }
                if (episodes.isNotEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "episodes") {
                        SectionTitle(stringResource(R.string.favorites_episodes), Modifier.padding(top = if (shows.isEmpty()) 0.dp else 8.dp))
                    }
                    items(episodes, key = { it.id }) { item -> EpisodeCard(item) }
                }
                item(span = { GridItemSpan(maxLineSpan) }, key = "bottom") { Box(Modifier.navigationBarsPadding()) }
            }
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
