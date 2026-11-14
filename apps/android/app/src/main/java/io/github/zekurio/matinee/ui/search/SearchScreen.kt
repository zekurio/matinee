package io.github.zekurio.matinee.ui.search

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.CatalogInput
import io.github.zekurio.matinee.api.CatalogPage
import io.github.zekurio.matinee.api.CatalogTitleSummary
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.browse.creditKind
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.PersonCard
import io.github.zekurio.matinee.ui.components.PosterCard
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.SearchBarFrame
import io.github.zekurio.matinee.ui.components.SectionTitle
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.kit.Chip
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.RoundIconButton
import io.github.zekurio.matinee.ui.kit.Spinner
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.requests.CatalogCard
import io.github.zekurio.matinee.ui.requests.DiscoverFailed
import io.github.zekurio.matinee.ui.requests.DiscoverNothing
import io.github.zekurio.matinee.ui.requests.FollowRails
import io.github.zekurio.matinee.ui.requests.FollowTitles
import io.github.zekurio.matinee.ui.requests.askable
import io.github.zekurio.matinee.ui.requests.discoverRails
import io.github.zekurio.matinee.ui.requests.key
import io.github.zekurio.matinee.ui.requests.rememberDiscover
import io.github.zekurio.matinee.ui.requests.rememberRailPages
import io.github.zekurio.matinee.ui.tabBarPadding
import io.github.zekurio.matinee.ui.theme.Palette

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SearchScreen() {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    var query by rememberSaveable { mutableStateOf("") }
    val search = remember { SearchState() }
    val focus = remember { FocusRequester() }
    val libraries = rememberLoader("libraries") { libraries.list() }
    val names = (libraries.state as? Load.Ready)?.value.orEmpty().associate { it.id to it.name }

    // Discover sits under the field until something's typed. It's for looking
    // around, so the keyboard waits for a tap then, rather than covering it.
    val discover = rememberDiscover()
    val discoverAnswer = (discover.state as? Load.Ready)?.value
    val rails = discoverAnswer?.takeIf { it.enabled }?.rails.orEmpty()
    val railPages = rememberRailPages(rails)
    val takeKeyboard = when (val state = discover.state) {
        Load.Loading -> null
        is Load.Failed -> true
        is Load.Ready -> !state.value.enabled
    }
    LaunchedEffect(takeKeyboard) { if (takeKeyboard == true && query.isEmpty()) focus.requestFocus() }
    SearchEffect(search, query)
    val catalog = remember { CatalogSearchState() }
    CatalogSearchEffect(catalog, query)
    val searching = search.searching
    val failed = search.failed

    // A tab's first page: its name, then the field, which takes the keyboard when the tab opens.
    Column(Modifier.fillMaxSize()) {
        TopBar(stringResource(R.string.search_title), back = false)
        Box(Modifier.padding(start = Gutter, end = Gutter, bottom = 12.dp)) {
            SearchBarFrame {
                Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) {
                    LucideIcon(Lucide.Search, null, size = 20.dp, tint = Palette.Muted)
                }
                BasicTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = Palette.Foreground),
                    cursorBrush = SolidColor(Palette.Accent),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    modifier = Modifier.weight(1f).focusRequester(focus),
                    decorationBox = { field ->
                        Box(contentAlignment = Alignment.CenterStart) {
                            if (query.isEmpty()) {
                                Text(
                                    stringResource(R.string.search_field),
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = Palette.Faint,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                            field()
                        }
                    },
                )
                if (query.isNotEmpty()) {
                    RoundIconButton(Lucide.X, stringResource(R.string.search_clear), { query = "" }, size = 44.dp, iconSize = 18.dp, background = Color.Transparent)
                } else {
                    Box(Modifier.size(12.dp))
                }
            }
        }
        val found = search.results
        val text = query.trim()
        val notHere = catalog.results?.let { page -> askable(page.items) { it.availability } }
        val catalogPending = catalog.results == null && !catalog.failed
        // Here rather than in the section, so its cards stay live while its heading is scrolled away.
        FollowTitles(if (text.isEmpty()) emptyList() else notHere.orEmpty().map { CatalogInput(it.ref) })
        when {
            // The field's placeholder already says what search finds; Discover sits under it.
            text.isEmpty() -> if (rails.isNotEmpty()) DiscoverList(rails, railPages, discover)
            failed -> Hint(stringResource(R.string.search_failed))
            found == null -> Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                Spinner(size = 32.dp, color = Palette.Accent)
            }
            found.isEmpty && !(catalogPending || !notHere.isNullOrEmpty()) -> Column {
                Hint(stringResource(R.string.search_no_match, text), stringResource(R.string.search_no_match_hint), Lucide.SearchX)
                if (catalog.failed) Hint(stringResource(R.string.web_catalog_search_failed))
            }
            else -> LazyVerticalGrid(
                columns = GridCells.Adaptive(150.dp),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = Gutter, end = Gutter, bottom = tabBarPadding() + 24.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                val groups = found.titlesByLibrary()
                groups.forEach { (libraryId, titles) ->
                    item(span = { GridItemSpan(maxLineSpan) }, key = "lib-$libraryId") {
                        // On one baseline: the count's smaller line would sit low at the boxes' bottom.
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(
                                names[libraryId] ?: stringResource(R.string.search_titles_heading),
                                style = MaterialTheme.typography.titleLarge,
                                modifier = Modifier.alignByBaseline(),
                            )
                            Text(
                                res.getQuantityString(R.plurals.browse_title_count, titles.size, titles.size),
                                style = MaterialTheme.typography.bodyMedium,
                                color = Palette.Muted,
                                modifier = Modifier.alignByBaseline(),
                            )
                        }
                    }
                    items(titles, key = { it.id }) { title -> PosterCard(title, title.year?.toString()) }
                }
                if (found.people.isNotEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "people") {
                        Column {
                            SectionTitle(stringResource(R.string.search_section_cast))
                            Gap(12.dp)
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                items(found.people, key = { it.name }) { person ->
                                    PersonCard(
                                        person.name,
                                        creditKind(person.kind, res, 1),
                                        api.art(person.photo, ArtworkSize.Thumb),
                                        Modifier.width(railItemWidth(RailArt.Person)),
                                    )
                                }
                            }
                        }
                    }
                }
                if (found.genres.isNotEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "genres") {
                        Column {
                            SectionTitle(stringResource(R.string.search_section_genres))
                            Gap(12.dp)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                found.genres.forEach { Chip(it.name, false, { nav.genre(it.name) }) }
                            }
                        }
                    }
                }
                if (found.studios.isNotEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "studios") {
                        Column {
                            SectionTitle(stringResource(R.string.search_section_studios))
                            Gap(12.dp)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                found.studios.forEach { Chip(it.name, false, { nav.studio(it.name) }) }
                            }
                        }
                    }
                }
                notHereSection(text, catalog, notHere, first = found.isEmpty)
                if (searching) {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "searching") {
                        Text(stringResource(R.string.search_searching), style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
                    }
                }
            }
        }
    }
}

@Composable
private fun Hint(text: String, detail: String? = null, icon: Int? = null) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (icon != null) {
            LucideIcon(icon, null, size = 28.dp, tint = Palette.Muted)
            Gap(12.dp)
        }
        Text(text, style = MaterialTheme.typography.bodyLarge, color = if (detail != null) Palette.Foreground else Palette.Muted)
        if (detail != null) {
            Gap(4.dp)
            Text(detail, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
        }
    }
}

/**
 * "Not here yet": titles the catalog found that no library here has,
 * under the library's own results with that heading, or first and
 * unheaded when the library has none. It loads on its own, so the library's
 * results never wait for the catalog.
 */
private fun LazyGridScope.notHereSection(query: String, catalog: CatalogSearchState, items: List<CatalogTitleSummary>?, first: Boolean) {
    if (items != null && items.isEmpty()) return
    item(span = { GridItemSpan(maxLineSpan) }, key = "notHere") {
        val res = LocalResources.current
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            // With nothing in the library, the titles follow the field without a heading.
            if (!first) Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    stringResource(R.string.web_catalog_notHere),
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.alignByBaseline().weight(1f, fill = false),
                )
                if (!items.isNullOrEmpty()) {
                    Text(
                        res.getQuantityString(R.plurals.browse_title_count, items.size, items.size),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Palette.Muted,
                        modifier = Modifier.alignByBaseline(),
                    )
                }
            }
            when {
                catalog.failed -> Text(stringResource(R.string.web_catalog_search_failed), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                items == null -> Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Palette.Accent)
                }
                catalog.results?.stale == true ->
                    Text(stringResource(R.string.web_catalog_search_stale), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
            }
        }
    }
    if (items != null) {
        items(items, key = { "catalog-${it.ref.key}" }) { item -> CatalogCard(item) }
    }
}

/** Discover's rows under the field, or why there are none. */
@Composable
private fun DiscoverList(
    rails: List<io.github.zekurio.matinee.api.DiscoverRail>,
    pages: Map<String, io.github.zekurio.matinee.ui.Loader<io.github.zekurio.matinee.api.CatalogPage>>,
    discover: io.github.zekurio.matinee.ui.Loader<io.github.zekurio.matinee.api.DiscoverRails>,
) {
    FollowRails(pages.values)
    val states = rails.mapNotNull { pages[it.id]?.state }
    val failed = rails.filter { pages[it.id]?.state is Load.Failed }
    when {
        states.isNotEmpty() && states.all { it is Load.Failed } -> DiscoverFailed { pages.values.forEach { it.reload() }; discover.reload() }
        states.isNotEmpty() && states.all { it is Load.Ready && it.value.items.isEmpty() } -> DiscoverNothing()
        else -> androidx.compose.foundation.lazy.LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = tabBarPadding() + 24.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            if (states.any { it is Load.Ready && it.value.stale }) {
                item(key = "stale") {
                    Text(
                        stringResource(R.string.web_discover_stale),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Palette.Muted,
                        modifier = Modifier.padding(horizontal = Gutter),
                    )
                }
            }
            // Several rows that failed say so once, rather than as a stack of empty boxes.
            if (failed.size > 1) {
                item(key = "failed") {
                    val res = LocalResources.current
                    io.github.zekurio.matinee.ui.home.Notice(
                        res.getQuantityString(R.plurals.web_discover_railsFailed, failed.size, failed.size),
                        null,
                        { failed.forEach { pages[it.id]?.reload() } },
                    )
                }
            }
            discoverRails(if (failed.size > 1) rails - failed.toSet() else rails, pages)
        }
    }
}

/** What the catalog found for the text in the field, apart from the library's search. */
@androidx.compose.runtime.Stable
class CatalogSearchState {
    var results by mutableStateOf<CatalogPage?>(null)
        internal set
    var failed by mutableStateOf(false)
        internal set
    internal var resultsFor: String? = null
}

/** Asks the catalog for [query] once typing pauses, into [state]. */
@Composable
private fun CatalogSearchEffect(state: CatalogSearchState, query: String) {
    val api = LocalApi.current
    LaunchedEffect(state, query) {
        val text = query.trim()
        if (state.resultsFor == text && state.results != null) return@LaunchedEffect
        state.results = null
        state.failed = false
        state.resultsFor = null
        if (text.isEmpty()) return@LaunchedEffect
        kotlinx.coroutines.delay(SEARCH_DEBOUNCE_MS)
        try {
            state.results = api.catalog.search(text)
            state.resultsFor = text
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (_: java.io.IOException) {
            state.failed = true
        } catch (_: kotlinx.serialization.SerializationException) {
            state.failed = true
        }
    }
}
