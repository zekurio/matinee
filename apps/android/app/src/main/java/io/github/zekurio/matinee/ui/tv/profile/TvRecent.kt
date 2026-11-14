package io.github.zekurio.matinee.ui.tv.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
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
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.Spinner
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.TvButton
import io.github.zekurio.matinee.ui.tv.TvCards
import io.github.zekurio.matinee.ui.tv.TvGrid
import io.github.zekurio.matinee.ui.tv.TvPage
import io.github.zekurio.matinee.ui.tv.TvPosterGrid
import io.github.zekurio.matinee.ui.tv.TvType
import io.github.zekurio.matinee.ui.tv.rememberTvFocusMemory

/** How many titles the list goes back, as on the phone. */
private const val LIMIT = 100

/**
 * Everything the person watched last, a file per title, newest first, as
 * a grid of cards behind the profile's row. The heading steps aside while
 * focus is below the first row.
 */
@Composable
fun TvRecentScreen() {
    val user = LocalUser.current
    val recent = rememberLoader("recent-${user.username}") { profiles.recent(user.username, LIMIT) }
    RefreshOnResume(recent)
    val memory = rememberTvFocusMemory()
    val entries = (recent.state as? Load.Ready)?.value.orEmpty()
    // Read again until the list comes, so the first card takes focus once it shows.
    memory.Restore { (recent.state as? Load.Ready)?.value?.firstOrNull()?.let { TvGrid.ROW to it.item.id } }
    val heading: @Composable () -> Unit = {
        Text(stringResource(R.string.profile_recent), style = TvType.Headline, modifier = Modifier.padding(start = TvPage.Start, top = 2.dp))
    }
    when (val state = recent.state) {
        Load.Loading -> Column(Modifier.fillMaxSize().padding(top = TvGrid.Top)) {
            heading()
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Spinner(size = 32.dp, color = Palette.Muted)
            }
        }
        is Load.Failed -> Column(Modifier.fillMaxSize().padding(top = TvGrid.Top)) {
            heading()
            Column(Modifier.padding(start = TvPage.Start, top = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.profile_recent_load_failed), style = TvType.Title)
                Text(state.message, style = TvType.Body, color = Palette.Muted)
                TvButton(
                    stringResource(R.string.common_retry),
                    recent::reload,
                    with(memory) { Modifier.item(TvGrid.ROW, "retry") }.padding(top = 16.dp),
                    icon = Lucide.RefreshCw,
                )
            }
        }
        is Load.Ready -> if (entries.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(top = TvGrid.Top)) {
                heading()
                Text(stringResource(R.string.profile_recent_empty), style = TvType.Title, color = Palette.Muted, modifier = Modifier.padding(start = TvPage.Start, top = 24.dp))
            }
        } else {
            TvPosterGrid(
                entries,
                key = { it.item.id },
                memory = memory,
                columns = GridCells.FixedSize(TvCards.LandscapeWidth),
                header = { Box(Modifier.padding(bottom = 4.dp)) { heading() } },
            ) { entry, focus -> WatchedCard(entry.item, focus) }
        }
    }
}
