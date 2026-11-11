package io.github.zekurio.matinee.ui.tv.browse

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.Facet
import io.github.zekurio.matinee.api.PersonSummary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.browse.creditKind
import io.github.zekurio.matinee.ui.components.ImageSource
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.search.SearchEffect
import io.github.zekurio.matinee.ui.search.SearchState
import io.github.zekurio.matinee.ui.search.isEmpty
import io.github.zekurio.matinee.ui.search.titlesByLibrary
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.Overscan
import io.github.zekurio.matinee.ui.tv.PinnedRows
import io.github.zekurio.matinee.ui.tv.ShowBackdrop
import io.github.zekurio.matinee.ui.tv.TvButton
import io.github.zekurio.matinee.ui.tv.TvPerson
import io.github.zekurio.matinee.ui.tv.TvPersonCard
import io.github.zekurio.matinee.ui.tv.TvCards
import io.github.zekurio.matinee.ui.tv.TvFocusLine
import io.github.zekurio.matinee.ui.tv.TvFocusMemory
import io.github.zekurio.matinee.ui.tv.TvPage
import io.github.zekurio.matinee.ui.tv.TvPosterCard
import io.github.zekurio.matinee.ui.tv.TvRow
import io.github.zekurio.matinee.ui.tv.TvSearchField
import io.github.zekurio.matinee.ui.tv.TvType
import io.github.zekurio.matinee.ui.tv.home.FocusedItem
import io.github.zekurio.matinee.ui.tv.rememberTvFocusMemory
import io.github.zekurio.matinee.ui.tv.titleInfo

private const val FIELD = "field"
private const val PEOPLE = "people"
private const val GENRES = "genres"
private const val STUDIOS = "studios"

private fun libraryRow(id: String) = "lib-$id"

/** Above the focused card in the rows: the list's top padding, a row's heading, and the gap under it. */
private val ROW_PIVOT = 8.dp + 26.dp + TvCards.TitleGap

/** The search's results kept while the page is on the back stack, so they're there when the page comes back. */
class TvSearchModel : ViewModel() {
    val state = SearchState()
}

/**
 * Search on a TV: the field at the top, which takes the system's keyboard
 * on Select, and the phone's results under it as rows, in the phone's
 * order: the titles of each library, cast and crew, genres, and studios.
 * The focused result's name and facts sit between them, its backdrop
 * behind the page. With no query, only the field, as on the phone.
 */
@Composable
fun TvSearchScreen() {
    val api = LocalApi.current
    val res = LocalResources.current
    var query by rememberSaveable { mutableStateOf("") }
    val search = viewModel<TvSearchModel>().state
    SearchEffect(search, query)
    val libraries = rememberLoader("libraries") { libraries.list() }
    val names = (libraries.state as? Load.Ready)?.value.orEmpty().associate { it.id to it.name }
    val memory = rememberTvFocusMemory()
    var focused by remember { mutableStateOf<FocusedItem?>(null) }
    var backdrop by remember { mutableStateOf(emptyList<ImageSource>()) }
    memory.Restore { FIELD to FIELD }
    // Down from the field goes to the first result, not to whichever card sits under it.
    val firstResult = remember { FocusRequester() }
    var firstShown by remember { mutableStateOf(false) }
    ShowBackdrop(backdrop)
    val text = query.trim()
    // A new query's results replace what was focused in the last; no query shows no backdrop.
    LaunchedEffect(text) {
        focused = null
        if (text.isEmpty()) backdrop = emptyList()
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.padding(start = TvPage.Start, end = TvPage.End + 140.dp, top = Overscan.Vertical),
            horizontalArrangement = Arrangement.spacedBy(20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TvSearchField(
                query,
                { query = it },
                placeholder = stringResource(R.string.search_field),
                clearLabel = stringResource(R.string.search_clear),
                modifier = Modifier.widthIn(max = 640.dp).weight(1f, fill = false),
                field = with(memory) { Modifier.item(FIELD, FIELD) }
                    .focusProperties { if (firstShown) down = firstResult },
                height = 56.dp,
                textStyle = TvType.Title,
            )
            if (search.searching && search.results != null) {
                Text(stringResource(R.string.search_searching), style = TvType.Caption, color = Palette.Muted)
            }
        }
        val found = search.results
        if (text.isNotEmpty()) TvFocusLine(focused, Modifier.padding(start = TvPage.Start, end = TvPage.End, top = 16.dp))
        when {
            text.isEmpty() -> Unit
            search.failed -> Hint(stringResource(R.string.search_failed), null)
            found == null -> Box(Modifier.fillMaxWidth().padding(top = 48.dp), contentAlignment = Alignment.TopCenter) {
                CircularProgressIndicator(color = Palette.Muted, strokeWidth = 3.dp, modifier = Modifier.size(32.dp))
            }
            found.isEmpty -> Hint(stringResource(R.string.search_no_match, text), stringResource(R.string.search_no_match_hint))
            else -> PinnedRows(ROW_PIVOT) {
                val nav = LocalNavigator.current
                val viewer = LocalContext.current.app.viewer
                LazyColumn(
                    Modifier.fillMaxSize(),
                    state = rememberLazyListState(),
                    contentPadding = PaddingValues(top = 8.dp, bottom = 320.dp),
                    verticalArrangement = Arrangement.spacedBy(28.dp),
                ) {
                    found.titlesByLibrary().entries.forEachIndexed { index, (libraryId, titles) ->
                        val row = libraryRow(libraryId)
                        item(key = row) {
                            val heading = names[libraryId] ?: stringResource(R.string.search_titles_heading)
                            TvRow("$heading  ·  ${res.getQuantityString(R.plurals.browse_title_count, titles.size, titles.size)}", row, memory) {
                                items(titles, key = { it.id }) { title ->
                                    val first = index == 0 && title == titles.first()
                                    if (first) {
                                        DisposableEffect(Unit) {
                                            firstShown = true
                                            onDispose { firstShown = false }
                                        }
                                    }
                                    TvPosterCard(
                                        title.name,
                                        api.art(title.images.poster),
                                        onClick = { nav.title(title) },
                                        watched = viewer.isWatched(title),
                                        modifier = with(memory) { Modifier.item(row, title.id) }
                                            .then(if (first) Modifier.focusRequester(firstResult) else Modifier)
                                            .onFocusChanged {
                                            if (it.isFocused) {
                                                val info = titleInfo(title, api, res)
                                                focused = info
                                                backdrop = info.backdrop
                                            }
                                        },
                                    )
                                }
                            }
                        }
                    }
                    if (found.people.isNotEmpty()) {
                        item(key = PEOPLE) {
                            TvRow(stringResource(R.string.search_section_cast), PEOPLE, memory) {
                                items(found.people, key = { it.name }) { person ->
                                    PersonCard(person, memory) { focused = personInfo(person, res) }
                                }
                            }
                        }
                    }
                    facetRow(GENRES, R.string.search_section_genres, found.genres, memory, { focused = facetInfo(it, res) }) { nav.genre(it.name) }
                    facetRow(STUDIOS, R.string.search_section_studios, found.studios, memory, { focused = facetInfo(it, res) }) { nav.studio(it.name) }
                }
            }
        }
    }
}

private fun personInfo(person: PersonSummary, res: android.content.res.Resources) = FocusedItem(
    name = person.name,
    subtitle = null,
    facts = listOf(creditKind(person.kind, res, 1), res.getQuantityString(R.plurals.browse_title_count, person.titleCount, person.titleCount)),
    contentRating = null,
    rating = null,
    overview = null,
    backdrop = emptyList(),
)

private fun facetInfo(facet: Facet, res: android.content.res.Resources) = FocusedItem(
    name = facet.name,
    subtitle = null,
    facts = listOf(res.getQuantityString(R.plurals.browse_title_count, facet.titleCount, facet.titleCount)),
    contentRating = null,
    rating = null,
    overview = null,
    backdrop = emptyList(),
)

/** Genres or studios as a row of buttons, each opening its titles. */
private fun androidx.compose.foundation.lazy.LazyListScope.facetRow(
    key: String,
    title: Int,
    facets: List<Facet>,
    memory: TvFocusMemory,
    onFocus: (Facet) -> Unit,
    onOpen: (Facet) -> Unit,
) {
    if (facets.isEmpty()) return
    item(key = key) {
        TvRow(stringResource(title), key, memory) {
            items(facets, key = { it.name }) { facet ->
                TvButton(
                    facet.name,
                    { onOpen(facet) },
                    with(memory) { Modifier.item(key, facet.name) }.onFocusChanged { if (it.isFocused) onFocus(facet) },
                )
            }
        }
    }
}

/** Someone in the cast or crew, opening their page. */
@Composable
private fun PersonCard(person: PersonSummary, memory: TvFocusMemory, onFocus: () -> Unit) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    TvPersonCard(
        TvPerson(person.name, null, api.art(person.photo, ArtworkSize.Thumb)),
        onClick = { nav.person(person.name) },
        focus = with(memory) { Modifier.item(PEOPLE, person.name) }.onFocusChanged { if (it.isFocused) onFocus() },
    )
}

/** In place of the results: why there are none. */
@Composable
private fun Hint(headline: String, detail: String?) {
    Column(Modifier.fillMaxWidth().padding(start = TvPage.Start, end = TvPage.End, top = 40.dp)) {
        Text(headline, style = TvType.Title, color = Palette.Foreground.copy(alpha = 0.9f))
        if (detail != null) Text(detail, style = TvType.Body, color = Palette.Muted, modifier = Modifier.padding(top = 6.dp))
    }
}
