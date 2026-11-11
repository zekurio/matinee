package io.github.zekurio.matinee.ui.browse

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
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
import io.github.zekurio.matinee.api.Library
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LibraryRoute
import io.github.zekurio.matinee.ui.components.Chip
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeTextField
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.theme.Palette

@Composable
fun LibraryScreen(route: LibraryRoute) {
    val library = rememberLibrary(route.id)
    val filters = rememberLibraryFilters(route)
    val sort = filters.sort
    val genre = filters.genre
    val query = filters.query
    var searching by rememberSaveable { mutableStateOf(false) }
    val pages = rememberLibraryPages(route, filters)
    val shows = library?.kind == "shows"
    val res = LocalResources.current

    Column(Modifier.fillMaxSize()) {
        if (searching) {
            SearchTopBar(
                query = query,
                placeholder = stringResource(if (shows) R.string.library_search_shows else R.string.library_search_movies),
                onQuery = { filters.query = it },
                onClose = {
                    filters.query = ""
                    searching = false
                },
            )
        } else {
            TopBar(library?.name) {
                LibraryActions(
                    library = library,
                    sort = sort,
                    genre = genre,
                    onSearch = { searching = true },
                    onSort = { filters.sort = it },
                    onGenre = { filters.genre = it },
                )
            }
        }
        PosterGrid(
            pages,
            // The year whatever the order, as the web's cards, so the cards
            // don't change as the person sorts.
            detail = { title -> title.year?.toString() },
            empty = {
                Text(
                    libraryEmptyMessage(res, library, filters),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Palette.Muted,
                    modifier = Modifier.padding(vertical = 48.dp),
                )
            },
        ) {
            if (genre != null) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Box(Modifier.padding(top = 4.dp, bottom = 4.dp)) {
                        Chip(genre.orEmpty(), selected = true, trailingIcon = Lucide.X, onClick = { filters.genre = null })
                    }
                }
            }
        }
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

/** Search, a genre filter, and the sort, at the end of the library's top bar. */
@Composable
private fun LibraryActions(
    library: Library?,
    sort: String,
    genre: String?,
    onSearch: () -> Unit,
    onSort: (String) -> Unit,
    onGenre: (String?) -> Unit,
) {
    var sorting by remember { mutableStateOf(false) }
    var filtering by remember { mutableStateOf(false) }
    RoundIconButton(Lucide.Search, stringResource(R.string.library_search_titles), onSearch, size = 48.dp, iconSize = 22.dp, background = Color.Transparent)
    RoundIconButton(
        Lucide.ListFilter,
        stringResource(R.string.library_filter),
        { filtering = true },
        size = 48.dp,
        iconSize = 22.dp,
        background = Color.Transparent,
        tint = if (genre != null) Palette.Accent else Palette.Foreground,
    )
    Box {
        RoundIconButton(Lucide.ArrowUpDown, stringResource(R.string.library_sort), { sorting = true }, size = 48.dp, iconSize = 22.dp, background = Color.Transparent)
        DropdownMenu(expanded = sorting, onDismissRequest = { sorting = false }, containerColor = Palette.Raised) {
            LIBRARY_SORTS.forEach { (value, label) ->
                DropdownMenuItem(
                    text = { Text(stringResource(label)) },
                    trailingIcon = if (value == sort) ({ LucideIcon(Lucide.Check, null, size = 16.dp) }) else null,
                    onClick = {
                        sorting = false
                        onSort(value)
                    },
                )
            }
        }
    }
    if (filtering && library != null) {
        GenreSheet(library.id, genre, onPick = {
            filtering = false
            onGenre(it)
        }, onDismiss = { filtering = false })
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GenreSheet(libraryId: String, current: String?, onPick: (String?) -> Unit, onDismiss: () -> Unit) {
    val genres = rememberLibraryGenres(libraryId)
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Palette.Raised) {
        Text(
            stringResource(R.string.library_genre),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = Gutter, vertical = 8.dp),
        )
        HorizontalDivider(color = Palette.Border)
        val list = (genres.state as? Load.Ready)?.value.orEmpty()
        LazyColumn(Modifier.fillMaxWidth().heightIn(max = 480.dp).navigationBarsPadding()) {
            item {
                GenreRow(stringResource(R.string.library_any_genre), null, current == null) { onPick(null) }
            }
            items(list, key = { it.name }) { facet ->
                GenreRow(facet.name, facet.titleCount, current == facet.name) { onPick(facet.name) }
            }
        }
    }
}

@Composable
private fun GenreRow(name: String, count: Int?, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = Gutter, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        if (count != null) Text(count.toString(), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
        if (selected) {
            Gap(12.dp)
            LucideIcon(Lucide.Check, null, size = 18.dp, tint = Palette.Accent)
        }
    }
}
