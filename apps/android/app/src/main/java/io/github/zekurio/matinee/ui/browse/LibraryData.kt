package io.github.zekurio.matinee.ui.browse

import android.content.res.Resources
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.Facet
import io.github.zekurio.matinee.api.Library
import io.github.zekurio.matinee.api.LibraryKind
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.TitleFilters
import io.github.zekurio.matinee.api.TitleList
import io.github.zekurio.matinee.api.TitleSort
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LibraryRoute
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.rememberLoader
import kotlinx.coroutines.delay

/* What a library's page and a genre's or studio's page load and filter by, for the phone's pages and the TV's alike. */

/** How long typing has to pause before a library's search asks the server. */
const val LIBRARY_SEARCH_DEBOUNCE_MS = 250L

/** A library's orders, in the order the sort offers them, each with its name. */
val LIBRARY_SORTS: List<Pair<String, Int>> = listOf(
    TitleSort.NAME to R.string.library_sort_name,
    TitleSort.RECENT to R.string.library_sort_recent,
    TitleSort.YEAR to R.string.library_sort_year,
)

/**
 * A library page's sort, genre, and search, kept while the page is on the
 * back stack. [settled] is [query] once typing pauses, trimmed; it's what
 * goes to the server.
 */
@Stable
class LibraryFilters internal constructor(
    sort: MutableState<String>,
    genre: MutableState<String?>,
    query: MutableState<String>,
    settled: MutableState<String>,
) {
    var sort by sort
    var genre by genre
    var query by query
    var settled by settled
        internal set
}

@Composable
fun rememberLibraryFilters(route: LibraryRoute): LibraryFilters = rememberLibraryFilters(route.sort)

/** A page's filters as [LibraryFilters], starting in [initialSort], or by name. */
@Composable
fun rememberLibraryFilters(initialSort: String? = null): LibraryFilters {
    val sort = rememberSaveable { mutableStateOf(initialSort ?: TitleSort.NAME) }
    val genre = rememberSaveable { mutableStateOf<String?>(null) }
    val query = rememberSaveable { mutableStateOf("") }
    // Waits for a pause in typing before asking the server.
    val settled = rememberSaveable { mutableStateOf("") }
    LaunchedEffect(query.value) {
        delay(LIBRARY_SEARCH_DEBOUNCE_MS)
        settled.value = query.value.trim()
    }
    return remember { LibraryFilters(sort, genre, query, settled) }
}

/** The libraries, to find the one a page is for. */
@Composable
fun rememberLibrary(id: String): Library? {
    val libraries = rememberLoader("libraries") { libraries.list() }
    return (libraries.state as? Load.Ready)?.value.orEmpty().firstOrNull { it.id == id }
}

/** A library's titles in [filters]' order, filtered and searched by the server. */
@Composable
fun rememberLibraryPages(route: LibraryRoute, filters: LibraryFilters): TitlePages {
    val sort = filters.sort
    val genre = filters.genre
    val settled = filters.settled
    return rememberTitlePages("titles-${route.id}-$sort-$genre-$settled") { offset, limit ->
        titles.list(route.id, sort = sort, query = settled.ifEmpty { null }, filters = genreFilters(genre), limit = limit, offset = offset)
    }
}

/** The genres a library's titles have, with how many each, for its filter. */
@Composable
fun rememberLibraryGenres(libraryId: String): Loader<List<Facet>> = rememberLoader("genres-$libraryId") { titles.facets(libraryId).genres }

/** Why a library page shows no titles: nothing matches the search, nothing the genre, or there are none. */
fun libraryEmptyMessage(res: Resources, library: Library?, filters: LibraryFilters): String =
    libraryEmptyMessage(res, library?.kind == LibraryKind.SHOWS, filters)

/** As [libraryEmptyMessage] for a page of shows, or of movies. */
fun libraryEmptyMessage(res: Resources, shows: Boolean, filters: LibraryFilters): String {
    val settled = filters.settled
    return when {
        settled.isNotEmpty() -> res.getString(if (shows) R.string.library_no_match_shows else R.string.library_no_match_movies, settled)
        filters.genre != null -> res.getString(if (shows) R.string.library_no_filter_match_shows else R.string.library_no_filter_match_movies)
        else -> res.getString(if (shows) R.string.library_none_shows else R.string.library_none_movies)
    }
}

/** Every title of [kind] from every library in [filters]' order, filtered and searched by the server. */
@Composable
fun rememberKindPages(kind: String, filters: LibraryFilters): TitlePages {
    val sort = filters.sort
    val genre = filters.genre
    val settled = filters.settled
    return rememberTitlePages("kind-$kind-$sort-$genre-$settled") { offset, limit ->
        titles.browse(kind = kind, sort = sort, query = settled.ifEmpty { null }, filters = genreFilters(genre), limit = limit, offset = offset).let {
            TitleList(it.items, it.total)
        }
    }
}

/** The genres the titles of [kind] have in every library, with how many each, for its filter. */
@Composable
fun rememberKindGenres(kind: String): Loader<List<Facet>> = rememberLoader("genres-kind-$kind") { titles.facets(kind = kind).genres }

/** A genre's or a studio's page's choice of kind: [TitleKind.MOVIE], [TitleKind.SHOW], or null for both. */
val BROWSE_KINDS: List<Pair<String?, Int>> = listOf(
    null to R.string.browse_kind_all,
    TitleKind.MOVIE to R.string.browse_kind_movie,
    TitleKind.SHOW to R.string.browse_kind_show,
)

/** A genre's or a studio's titles from every library, of [kind] if it's set. */
@Composable
fun rememberBrowsePages(genre: String?, studio: String?, kind: String?): TitlePages =
    rememberTitlePages("browse-$genre-$studio-$kind") { offset, limit ->
        titles.browse(filters = TitleFilters(genres = listOfNotNull(genre), studios = listOfNotNull(studio)), kind = kind, limit = limit, offset = offset).let {
            TitleList(it.items, it.total)
        }
    }

/** Titles with [genre], or every title without one. */
private fun genreFilters(genre: String?): TitleFilters? = genre?.let { TitleFilters(genres = listOf(it)) }
