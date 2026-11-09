package io.github.zekurio.matinee.ui.media

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.Library
import io.github.zekurio.matinee.ui.SearchHeader
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.components.ArtFrame
import io.github.zekurio.matinee.ui.components.CardShape
import io.github.zekurio.matinee.ui.components.CardText
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.LoadingBox
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.tabBarPadding
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * The Media tab, as Findroid's: search across the server, favorites, and
 * every library as a card, which opens the library.
 */
@Composable
fun MediaScreen() {
    val nav = LocalNavigator.current
    val libraries = rememberLoader("libraries") { libraries() }
    Column(Modifier.fillMaxSize()) {
        SearchHeader()
        when (val state = libraries.state) {
            Load.Loading -> LoadingBox()
            is Load.Failed -> ErrorBox(stringResource(R.string.home_load_failed), state.message, libraries::reload)
            is Load.Ready -> LazyVerticalGrid(
                columns = GridCells.Adaptive(160.dp),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = Gutter, end = Gutter, top = 8.dp, bottom = tabBarPadding() + 24.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                item(span = { GridItemSpan(maxLineSpan) }, key = "favorites") { FavoritesCard(nav::favorites) }
                if (state.value.isEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "empty") { NoLibraries() }
                }
                items(state.value, key = { it.id }) { library -> LibraryCard(library) }
            }
        }
    }
}

private val FavoritesShape = RoundedCornerShape(12.dp)

@Composable
private fun FavoritesCard(onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(FavoritesShape)
            .background(Palette.Card)
            .border(1.dp, Palette.Border, FavoritesShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LucideIcon(Lucide.Heart, null, size = 20.dp)
        Text(stringResource(R.string.favorites_title), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        LucideIcon(Lucide.ChevronRight, null, size = 18.dp, tint = Palette.Muted)
    }
}

/** A library as its newest title's art, with its name and how many titles it holds. */
@Composable
private fun LibraryCard(library: Library) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val recent = rememberLoader("library-art-${library.id}") { shelf(library.id, 4) }
    val art = (recent.state as? Load.Ready)?.value?.firstNotNullOfOrNull { api.art(it.title.images.backdrop, ArtworkSize.Medium) }
    Column(Modifier.clip(CardShape).clickable { nav.library(library.id) }) {
        ArtFrame(library.name, 16f / 9f) {
            if (art != null) {
                Picture(listOf(art), Modifier.fillMaxSize())
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.5f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.35f))))
            } else {
                LucideIcon(if (library.kind == "shows") Lucide.Tv else Lucide.Film, null, size = 28.dp, tint = Palette.Muted)
            }
        }
        CardText(library.name, res.getQuantityString(R.plurals.browse_title_count, library.titleCount, library.titleCount))
    }
}

@Composable
private fun NoLibraries() {
    val user = LocalUser.current
    Column(
        Modifier.fillMaxWidth().padding(vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        LucideIcon(Lucide.FolderPlus, null, size = 32.dp, tint = Palette.Muted)
        Gap(16.dp)
        Text(stringResource(R.string.browse_home_no_libraries), style = MaterialTheme.typography.titleMedium)
        Gap(4.dp)
        Text(
            stringResource(if (user.isAdmin) R.string.browse_home_no_libraries_admin else R.string.browse_home_no_libraries_user),
            style = MaterialTheme.typography.bodyMedium,
            color = Palette.Muted,
            textAlign = TextAlign.Center,
        )
    }
}
