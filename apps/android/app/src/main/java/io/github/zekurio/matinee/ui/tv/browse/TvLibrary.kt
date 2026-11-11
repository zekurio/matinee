package io.github.zekurio.matinee.ui.tv.browse

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.LibraryKind
import io.github.zekurio.matinee.ui.LibraryRoute
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.browse.LIBRARY_SORTS
import io.github.zekurio.matinee.ui.browse.libraryEmptyMessage
import io.github.zekurio.matinee.ui.browse.rememberLibrary
import io.github.zekurio.matinee.ui.browse.rememberLibraryFilters
import io.github.zekurio.matinee.ui.browse.rememberLibraryGenres
import io.github.zekurio.matinee.ui.browse.rememberLibraryPages
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.tv.ShowBackdrop
import io.github.zekurio.matinee.ui.tv.TvButton
import io.github.zekurio.matinee.ui.tv.TvGrid
import io.github.zekurio.matinee.ui.tv.TvOption
import io.github.zekurio.matinee.ui.tv.TvOptionsPanel
import io.github.zekurio.matinee.ui.tv.TvSearchField
import io.github.zekurio.matinee.ui.tv.TvTitleGrid
import io.github.zekurio.matinee.ui.tv.home.FocusedItem
import io.github.zekurio.matinee.ui.tv.rememberTvFocusMemory
import io.github.zekurio.matinee.ui.tv.titleInfo

private const val SORT = "sort"
private const val GENRE = "genre"
private const val SEARCH = "search"

/**
 * A library on a TV: its name, the sort, the genre filter, and a search
 * of the library in a row at the top, the focused title's name and facts
 * under them, and its titles as a grid of posters, the focused one's
 * backdrop behind the page. The sort and the genre open a panel at the
 * right. They're the phone's, kept the same way, and the server sorts,
 * filters, and searches.
 */
@Composable
fun TvLibraryScreen(route: LibraryRoute) {
    val api = LocalApi.current
    val res = LocalResources.current
    val library = rememberLibrary(route.id)
    val filters = rememberLibraryFilters(route)
    val pages = rememberLibraryPages(route, filters)
    val genres = rememberLibraryGenres(route.id)
    val memory = rememberTvFocusMemory()
    var focused by remember { mutableStateOf<FocusedItem?>(null) }
    var backdrop by remember { mutableStateOf(emptyList<io.github.zekurio.matinee.ui.components.ImageSource>()) }
    var panel by rememberSaveable { mutableStateOf<String?>(null) }
    val sortButton = remember { FocusRequester() }
    val genreButton = remember { FocusRequester() }
    val current by rememberUpdatedState(pages)
    // Restore keeps its first lambda, so it reads the pages through current.
    memory.Restore {
        current.items.firstOrNull()?.let { TvGrid.ROW to it.id }
            // Nothing to show: the controls, so the drawer and the filters are still in reach.
            ?: (CONTROLS to SORT).takeIf { current.done || current.error != null }
    }
    ShowBackdrop(backdrop)
    // Another order or filter: the line named a title that may have moved or gone.
    LaunchedEffect(filters.sort, filters.genre, filters.settled) {
        focused = null
        backdrop = emptyList()
    }

    val shows = library?.kind == LibraryKind.SHOWS
    val sortLabel = LIBRARY_SORTS.firstOrNull { it.first == filters.sort }?.second ?: R.string.library_sort_name
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            GridHeader(
                title = library?.name.orEmpty(),
                detail = pages.total?.let { res.getQuantityString(R.plurals.browse_title_count, it, it) },
                focused = focused,
            ) {
                TvButton(
                    stringResource(sortLabel),
                    { panel = SORT },
                    with(memory) { Modifier.item(CONTROLS, SORT) }.focusRequester(sortButton),
                    icon = Lucide.ArrowUpDown,
                    trailingIcon = Lucide.ChevronDown,
                )
                TvButton(
                    filters.genre ?: stringResource(R.string.library_any_genre),
                    { panel = GENRE },
                    with(memory) { Modifier.item(CONTROLS, GENRE) }.focusRequester(genreButton),
                    icon = Lucide.ListFilter,
                    trailingIcon = Lucide.ChevronDown,
                    active = filters.genre != null,
                )
                TvSearchField(
                    filters.query,
                    { filters.query = it },
                    placeholder = stringResource(if (shows) R.string.library_search_shows else R.string.library_search_movies),
                    clearLabel = stringResource(R.string.library_clear_search),
                    modifier = Modifier.width(SEARCH_WIDTH),
                    field = with(memory) { Modifier.item(CONTROLS, SEARCH) },
                )
            }
            TvTitleGrid(
                pages,
                memory,
                empty = libraryEmptyMessage(res, library, filters),
                onFocus = { title ->
                    val info = titleInfo(title, api, res)
                    focused = info
                    backdrop = info.backdrop
                },
                modifier = Modifier.weight(1f),
                scrollKey = "${filters.sort}-${filters.genre}-${filters.settled}",
            )
        }
        TvOptionsPanel(
            open = panel == SORT,
            title = stringResource(R.string.library_sort),
            options = LIBRARY_SORTS.map { (value, label) -> TvOption(value, stringResource(label), selected = value == filters.sort) },
            onPick = {
                filters.sort = it.key
                panel = null
            },
            onClose = { panel = null },
            returnFocus = { runCatching { sortButton.requestFocus() } },
        )
        val genreList = (genres.state as? Load.Ready)?.value.orEmpty()
        TvOptionsPanel(
            open = panel == GENRE,
            title = stringResource(R.string.library_genre),
            options = listOf(TvOption(ANY_GENRE, stringResource(R.string.library_any_genre), selected = filters.genre == null)) +
                genreList.map { TvOption(it.name, it.name, it.titleCount.toString(), selected = it.name == filters.genre) },
            onPick = {
                filters.genre = it.key.takeIf { key -> key != ANY_GENRE }
                panel = null
            },
            onClose = { panel = null },
            returnFocus = { runCatching { genreButton.requestFocus() } },
            loading = genres.state is Load.Loading,
        )
    }
}

/** The genre panel's first option's key; a genre's own name can't be empty. */
private const val ANY_GENRE = ""

private val SEARCH_WIDTH = 300.dp
