package io.github.zekurio.matinee.ui.tv.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.RefreshOnResume
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.Overscan
import io.github.zekurio.matinee.ui.tv.TvButton
import io.github.zekurio.matinee.ui.tv.TvCards
import io.github.zekurio.matinee.ui.tv.TvPage
import io.github.zekurio.matinee.ui.tv.TvType
import io.github.zekurio.matinee.ui.tv.rememberTvFocusMemory

/** How many titles the list goes back, as on the phone. */
private const val LIMIT = 100

private const val GRID = "grid"

/** Everything the person watched last, a file per title, newest first, as a grid of cards behind the profile's row. */
@Composable
fun TvRecentScreen() {
    val user = LocalUser.current
    val recent = rememberLoader("recent-${user.username}") { profiles.recent(user.username, LIMIT) }
    RefreshOnResume(recent)
    val memory = rememberTvFocusMemory()
    val entries = (recent.state as? Load.Ready)?.value.orEmpty()
    // Read again until the list comes, so the first card takes focus once it shows.
    memory.Restore { (recent.state as? Load.Ready)?.value?.firstOrNull()?.let { GRID to it.item.id } }
    Column(Modifier.fillMaxSize().padding(top = Overscan.Vertical + 8.dp)) {
        Text(stringResource(R.string.profile_recent), style = TvType.Headline, modifier = Modifier.padding(start = TvPage.Start))
        when (val state = recent.state) {
            Load.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(Modifier.size(32.dp), color = Palette.Muted, strokeWidth = 3.dp)
            }
            is Load.Failed -> Column(Modifier.padding(start = TvPage.Start, top = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.profile_recent_load_failed), style = TvType.Title)
                Text(state.message, style = TvType.Body, color = Palette.Muted)
                TvButton(recent::reload, with(memory) { Modifier.item(GRID, "retry") }.padding(top = 16.dp)) {
                    LucideIcon(Lucide.RefreshCw, null, size = 18.dp)
                    Text(stringResource(R.string.common_retry))
                }
            }
            is Load.Ready -> if (entries.isEmpty()) {
                Text(stringResource(R.string.profile_recent_empty), style = TvType.Title, color = Palette.Muted, modifier = Modifier.padding(start = TvPage.Start, top = 24.dp))
            } else {
                LazyVerticalGrid(
                    columns = GridCells.FixedSize(TvCards.LandscapeWidth),
                    modifier = with(memory) { Modifier.row(GRID) }.fillMaxSize().padding(start = TvPage.Start - 20.dp),
                    state = rememberLazyGridState(),
                    contentPadding = PaddingValues(start = 20.dp, end = TvPage.End, top = 24.dp, bottom = 48.dp),
                    horizontalArrangement = Arrangement.spacedBy(TvCards.Gap),
                    verticalArrangement = Arrangement.spacedBy(28.dp),
                ) {
                    items(entries, key = { it.item.id }) { entry -> WatchedCard(entry.item, with(memory) { Modifier.item(GRID, entry.item.id) }) }
                }
            }
        }
    }
}
