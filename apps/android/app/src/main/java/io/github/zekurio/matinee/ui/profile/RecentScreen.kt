package io.github.zekurio.matinee.ui.profile

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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.components.EpisodeCard
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.LoadingBox
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette

/** How many titles the list goes back. */
private const val LIMIT = 100

/**
 * Everything the signed-in person watched last, the latest file of each
 * title, newest first, as Favorites lists the favorites: the whole list
 * behind the profile's row of a dozen.
 */
@Composable
fun RecentScreen() {
    val user = LocalUser.current
    val recent = rememberLoader("recent-${user.username}") { recentlyWatched(user.username, LIMIT) }
    Column(Modifier.fillMaxSize()) {
        TopBar(stringResource(R.string.profile_recent))
        when (val state = recent.state) {
            is Load.Failed -> ErrorBox(stringResource(R.string.profile_recent_load_failed), state.message, recent::reload)
            Load.Loading -> LoadingBox()
            is Load.Ready -> {
                val entries = state.value.orEmpty()
                if (entries.isEmpty()) {
                    Empty()
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(150.dp),
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = Gutter, end = Gutter, top = 8.dp, bottom = 32.dp),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalArrangement = Arrangement.spacedBy(20.dp),
                    ) {
                        items(entries, key = { it.item.id }) { entry -> EpisodeCard(entry.item) }
                        item(span = { GridItemSpan(maxLineSpan) }, key = "bottom") { Box(Modifier.navigationBarsPadding()) }
                    }
                }
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
        LucideIcon(Lucide.Clock, null, size = 28.dp, tint = Palette.Muted)
        Gap(12.dp)
        Text(stringResource(R.string.profile_recent_empty), style = MaterialTheme.typography.titleMedium)
    }
}
