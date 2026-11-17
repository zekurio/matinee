package io.github.zekurio.matinee.ui.browse

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.LibraryKind
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.ui.LibraryRoute
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.components.ActiveFilterChips
import io.github.zekurio.matinee.ui.components.FilterButton
import io.github.zekurio.matinee.ui.kit.ButtonLook
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.MatineeButton
import io.github.zekurio.matinee.ui.theme.Palette

@Composable
fun LibraryScreen(route: LibraryRoute) {
    val library = rememberLibrary(route.id)
    val state = rememberTitleListState(route.sort)
    var filtering by rememberSaveable { mutableStateOf(false) }
    val options = rememberFilterOptions(libraryId = route.id)
    val offered = (options.state as? Load.Ready)?.value
    val pages = rememberLibraryPages(route.id, state)
    val shows = library?.kind == LibraryKind.SHOWS
    val res = LocalResources.current
    val chips = activeTitleFilters(state.filters, offered, res) { state.filters = it }

    Column(Modifier.fillMaxSize()) {
        // Its name, the filters when the server offers some, and the order. Search is Media's.
        TopBar(library?.name) {
            if (offered != null) FilterButton(state.filters.count()) { filtering = true }
            TitleSortButton(state, offered)
        }
        PosterGrid(
            pages,
            // The year, or with the score or runtime while sorted by it.
            detail = { title -> titleCardDetail(title, state.sort, res) },
            empty = {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 48.dp)) {
                    Text(libraryEmptyMessage(res, shows, state), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                    if (chips.isNotEmpty()) {
                        Gap(12.dp)
                        MatineeButton(onClick = { state.filters = NO_TITLE_FILTERS }, look = ButtonLook.Outline) {
                            Text(stringResource(R.string.browse_clear_filters))
                        }
                    }
                }
            },
        ) {
            if (chips.isNotEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }, key = "chips") {
                    Box(Modifier.padding(top = 4.dp, bottom = 4.dp)) {
                        ActiveFilterChips(chips) { state.filters = NO_TITLE_FILTERS }
                    }
                }
            }
        }
    }
    if (filtering && offered != null) {
        TitleFilterSheet(
            if (shows) TitleKind.SHOW else TitleKind.MOVIE,
            offered,
            state.filters,
            onChange = { state.filters = it },
            onDismiss = { filtering = false },
        )
    }
}
