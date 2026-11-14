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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.Library
import io.github.zekurio.matinee.api.isAdmin
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.components.ArtFrame
import io.github.zekurio.matinee.ui.components.DisconnectedAction
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.LoadingBox
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.kit.CardShape
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.tabBarPadding
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * The Media tab: every library as a card, which opens the library. Search
 * has a tab of its own, and favorites are on the profile.
 */
@Composable
fun MediaScreen() {
    val libraries = rememberLoader("libraries") { libraries.list() }
    Column(Modifier.fillMaxSize()) {
        TopBar(stringResource(R.string.tab_media), back = false) {
            // Still showing the libraries from before, while the server can't be reached.
            DisconnectedAction(libraries)
            Gap(Gutter - 8.dp)
        }
        when (val state = libraries.state) {
            Load.Loading -> LoadingBox(aboveTabBar = true)
            is Load.Failed -> ErrorBox(stringResource(R.string.home_load_failed), state.message, libraries::reload, aboveTabBar = true, disconnected = state.disconnected)
            is Load.Ready -> LazyVerticalGrid(
                columns = GridCells.Adaptive(160.dp),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = Gutter, end = Gutter, top = 8.dp, bottom = tabBarPadding() + 24.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                if (state.value.isEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "empty") { NoLibraries() }
                }
                items(state.value, key = { it.id }) { library -> LibraryCard(library) }
            }
        }
    }
}

/**
 * A library as the backdrop the server picked for it today, with its name
 * across it, as Jellyfin shows one, and how many titles it holds below.
 */
@Composable
private fun LibraryCard(library: Library) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val art = api.art(library.backdrop, ArtworkSize.Medium)
    Column(Modifier.clip(CardShape).clickable { nav.library(library.id) }) {
        ArtFrame(library.name, 16f / 9f) {
            if (art != null) {
                Picture(listOf(art), Modifier.fillMaxSize())
                Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f)))
            } else {
                LucideIcon(
                    if (library.kind == "shows") Lucide.Tv else Lucide.Film,
                    null,
                    size = 28.dp,
                    tint = Palette.Muted,
                    modifier = Modifier.align(Alignment.TopStart).padding(12.dp),
                )
            }
            Text(
                library.name,
                // Big enough to read across the room, over the backdrop.
                style = MaterialTheme.typography.headlineSmall.copy(
                    shadow = Shadow(Color.Black.copy(alpha = 0.6f), blurRadius = 12f),
                ),
                fontWeight = FontWeight.Bold,
                color = Color.White,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 12.dp),
            )
        }
        Text(
            res.getQuantityString(R.plurals.browse_title_count, library.titleCount, library.titleCount),
            style = MaterialTheme.typography.bodySmall,
            color = Palette.Muted,
            maxLines = 1,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
private fun NoLibraries() {
    val user = LocalUser.current
    Column(
        Modifier.fillMaxWidth().padding(vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // An admin sees every library, so none means none exist. Anyone else
        // may be in no group that opens one.
        val admin = user.isAdmin
        LucideIcon(if (admin) Lucide.FolderPlus else Lucide.Popcorn, null, size = 32.dp, tint = Palette.Muted)
        Gap(16.dp)
        Text(stringResource(if (admin) R.string.browse_home_no_libraries else R.string.browse_home_nothing_yet), style = MaterialTheme.typography.titleMedium)
        Gap(4.dp)
        Text(
            stringResource(if (admin) R.string.browse_home_no_libraries_admin else R.string.browse_home_nothing_yet_description),
            style = MaterialTheme.typography.bodyMedium,
            color = Palette.Muted,
            textAlign = TextAlign.Center,
        )
    }
}
