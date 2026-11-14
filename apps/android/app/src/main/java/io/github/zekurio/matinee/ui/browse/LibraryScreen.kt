package io.github.zekurio.matinee.ui.browse

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.LibraryKind
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LibraryRoute
import io.github.zekurio.matinee.ui.components.ActiveFilterChips
import io.github.zekurio.matinee.ui.components.ButtonLook
import io.github.zekurio.matinee.ui.components.FilterButton
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.MatineeTextField
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.theme.Palette

@Composable
fun LibraryScreen(route: LibraryRoute) {
    val library = rememberLibrary(route.id)
    val state = rememberTitleListState(route.sort)
    var searching by rememberSaveable { mutableStateOf(false) }
    var filtering by rememberSaveable { mutableStateOf(false) }
    val options = rememberFilterOptions(libraryId = route.id)
    val offered = (options.state as? Load.Ready)?.value
    val pages = rememberLibraryPages(route.id, state)
    val shows = library?.kind == LibraryKind.SHOWS
    val res = LocalResources.current
    val chips = activeTitleFilters(state.filters, offered, res) { state.filters = it }

    Column(Modifier.fillMaxSize()) {
        if (searching) {
            SearchTopBar(
                query = state.query,
                placeholder = stringResource(if (shows) R.string.library_search_shows else R.string.library_search_movies),
                onQuery = { state.query = it },
                onClose = {
                    state.query = ""
                    searching = false
                },
            )
        } else {
            TopBar(library?.name) {
                RoundIconButton(Lucide.Search, stringResource(R.string.library_search_titles), { searching = true }, size = 48.dp, iconSize = 22.dp, background = Color.Transparent)
                if (offered != null) FilterButton(state.filters.count()) { filtering = true }
                TitleSortButton(state, offered)
            }
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

/** The top bar while searching a library: back out of the search, and the field. */
@Composable
private fun SearchTopBar(query: String, placeholder: String, onQuery: (String) -> Unit, onClose: () -> Unit) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { focus.requestFocus() }
    // Back closes the search before it leaves the library.
    BackHandler(onBack = onClose)
    Row(
        Modifier.fillMaxWidth().background(Palette.Background).statusBarsPadding().height(64.dp).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RoundIconButton(Lucide.ArrowLeft, stringResource(R.string.library_clear_search), onClose, size = 48.dp, iconSize = 24.dp, background = Color.Transparent)
        MatineeTextField(
            value = query,
            onValueChange = onQuery,
            placeholder = placeholder,
            leadingIcon = Lucide.Search,
            modifier = Modifier.weight(1f).padding(end = 12.dp).focusRequester(focus),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = {}),
        )
    }
}
