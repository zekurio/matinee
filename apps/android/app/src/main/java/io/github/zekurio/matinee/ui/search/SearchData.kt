package io.github.zekurio.matinee.ui.search

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import io.github.zekurio.matinee.api.SearchResults
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.ui.components.LocalApi
import java.io.IOException
import kotlinx.coroutines.delay

/* How search asks the server, for the phone's page and the TV's alike. */

private const val LIMIT = 40

/** How long typing has to pause before a search goes out. */
const val SEARCH_DEBOUNCE_MS = 250L

/**
 * What the newest search answered, and whether one is out or failed. The
 * phone keeps it while its page shows; the TV keeps it while the page is
 * on the back stack, so coming back from a title finds the results there.
 */
@Stable
class SearchState {
    var results by mutableStateOf<SearchResults?>(null)
        internal set

    /** The text [results] answer. */
    internal var resultsFor: String? = null
    var searching by mutableStateOf(false)
        internal set
    var failed by mutableStateOf(false)
        internal set
}

/**
 * Searches for [query] once typing pauses, into [state]. An empty query
 * clears the results. Results already there for the same text stay.
 */
@Composable
fun SearchEffect(state: SearchState, query: String) {
    val api = LocalApi.current
    LaunchedEffect(state, query) {
        val text = query.trim()
        if (text.isEmpty()) {
            state.results = null
            state.resultsFor = null
            return@LaunchedEffect
        }
        if (state.resultsFor == text && state.results != null && !state.failed) return@LaunchedEffect
        delay(SEARCH_DEBOUNCE_MS)
        state.searching = true
        state.failed = false
        try {
            state.results = api.search.query(text, LIMIT)
            state.resultsFor = text
        } catch (_: IOException) {
            state.failed = true
        } finally {
            state.searching = false
        }
    }
}

/** Nothing at all matched. */
val SearchResults.isEmpty: Boolean
    get() = titles.isEmpty() && people.isEmpty() && genres.isEmpty() && studios.isEmpty() && users.isEmpty()

/** The titles by library, in the order the server ranked them. */
fun SearchResults.titlesByLibrary(): Map<String, List<TitleSummary>> = titles.groupBy { it.libraryId }
