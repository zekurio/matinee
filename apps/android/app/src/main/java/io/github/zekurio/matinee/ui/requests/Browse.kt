package io.github.zekurio.matinee.ui.requests

import android.content.res.Resources
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.CatalogBrowseInput
import io.github.zekurio.matinee.api.CatalogBrowseOptions
import io.github.zekurio.matinee.api.CatalogBrowseTitle
import io.github.zekurio.matinee.api.CatalogFilters
import io.github.zekurio.matinee.api.CatalogInput
import io.github.zekurio.matinee.api.CatalogRange
import io.github.zekurio.matinee.api.CatalogSort
import io.github.zekurio.matinee.api.CatalogTitleSummary
import io.github.zekurio.matinee.api.MatineeJson
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.components.ActiveFilter
import io.github.zekurio.matinee.ui.components.ActiveFilterChips
import io.github.zekurio.matinee.ui.components.ChoiceChips
import io.github.zekurio.matinee.ui.components.FilterButton
import io.github.zekurio.matinee.ui.components.FilterChoice
import io.github.zekurio.matinee.ui.components.FilterSection
import io.github.zekurio.matinee.ui.components.FilterSheet
import io.github.zekurio.matinee.ui.components.FilterSpan
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.OptionRow
import io.github.zekurio.matinee.ui.components.OptionSheet
import io.github.zekurio.matinee.ui.components.PANEL_WORDS
import io.github.zekurio.matinee.ui.components.PosterCard
import io.github.zekurio.matinee.ui.components.RUNTIME_CHIP_WORDS
import io.github.zekurio.matinee.ui.components.RangeField
import io.github.zekurio.matinee.ui.components.SCORE_CHIP_WORDS
import io.github.zekurio.matinee.ui.components.ToggleChips
import io.github.zekurio.matinee.ui.components.YEAR_WORDS
import io.github.zekurio.matinee.ui.components.countryName
import io.github.zekurio.matinee.ui.components.formatCount
import io.github.zekurio.matinee.ui.components.rangeText
import io.github.zekurio.matinee.ui.components.runtimeText
import io.github.zekurio.matinee.ui.components.yearText
import io.github.zekurio.matinee.ui.formatDay
import io.github.zekurio.matinee.ui.formatRating
import io.github.zekurio.matinee.ui.formatRuntime
import io.github.zekurio.matinee.ui.kit.ButtonLook
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.MatineeButton
import io.github.zekurio.matinee.ui.kit.Menu
import io.github.zekurio.matinee.ui.kit.MenuItem
import io.github.zekurio.matinee.ui.kit.RoundIconButton
import io.github.zekurio.matinee.ui.kit.Spinner
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette
import java.io.IOException
import kotlin.math.roundToInt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException

/*
 * All of TMDB's movies or shows, narrowed by filters and in the order the
 * viewer picks, as the web's browse pages under Discover have them: a
 * grid that loads more as it scrolls, the filters in a bottom sheet as a
 * library's genre is, and the sort in the bar's menu. What each filter
 * offers comes from the server. Titles that are here are the library's
 * cards; the rest ask, as on Discover.
 */

private val NO_FILTERS = CatalogFilters(
    genres = emptyList(),
    yearFrom = null,
    yearTo = null,
    scoreMin = null,
    scoreMax = null,
    votesMin = null,
    rating = null,
    language = null,
    runtimeMin = null,
    runtimeMax = null,
)

/** Kept across rotation and process death, as JSON. */
private val FiltersSaver = Saver<CatalogFilters, String>(
    save = { MatineeJson.encodeToString(CatalogFilters.serializer(), it) },
    restore = { runCatching { MatineeJson.decodeFromString(CatalogFilters.serializer(), it) }.getOrNull() },
)

/** The sorts' words, by the server's ids. */
private fun sortWord(sort: String): Int = when (sort) {
    CatalogSort.SCORE_HIGH -> R.string.web_filters_sort_scoreHigh
    CatalogSort.SCORE_LOW -> R.string.web_filters_sort_scoreLow
    CatalogSort.VOTES -> R.string.web_discover_browse_sort_votes
    CatalogSort.NEWEST -> R.string.web_filters_sort_newest
    CatalogSort.OLDEST -> R.string.web_filters_sort_oldest
    CatalogSort.NAME_ASC -> R.string.web_filters_sort_nameAsc
    CatalogSort.NAME_DESC -> R.string.web_filters_sort_nameDesc
    else -> R.string.web_discover_browse_sort_popular
}

/** "Browse movies", "Browse shows". */
fun browseName(kind: String, res: Resources): String =
    res.getString(if (kind == TitleKind.SHOW) R.string.web_discover_browse_show else R.string.web_discover_browse_movie)

/** How many filters are on, a range counting once. */
private fun CatalogFilters.count(): Int =
    genres.orEmpty().size +
        listOf(yearFrom != null || yearTo != null, scoreMin != null || scoreMax != null, votesMin != null, rating != null, language != null, runtimeMin != null || runtimeMax != null)
            .count { it }

private fun activeFilters(filters: CatalogFilters, options: CatalogBrowseOptions, res: Resources, change: (CatalogFilters) -> Unit): List<ActiveFilter> {
    val active = mutableListOf<ActiveFilter>()
    val genres = filters.genres.orEmpty()
    genres.forEach { id ->
        val genre = options.genres.firstOrNull { it.id == id } ?: return@forEach
        active += ActiveFilter("genre-$id", genre.name) { change(filters.copy(genres = genres - id)) }
    }
    if (filters.yearFrom != null || filters.yearTo != null) {
        active += ActiveFilter("years", rangeText(filters.yearFrom?.toDouble(), filters.yearTo?.toDouble(), ::yearText, "", YEAR_WORDS, res)) {
            change(filters.copy(yearFrom = null, yearTo = null))
        }
    }
    if (filters.scoreMin != null || filters.scoreMax != null) {
        active += ActiveFilter("score", rangeText(filters.scoreMin, filters.scoreMax, ::formatRating, "", SCORE_CHIP_WORDS, res)) {
            change(filters.copy(scoreMin = null, scoreMax = null))
        }
    }
    filters.votesMin?.let { votes ->
        active += ActiveFilter("votes", res.getQuantityString(R.plurals.web_discover_browse_chip_votes, votes, formatCount(votes, res))) {
            change(filters.copy(votesMin = null))
        }
    }
    filters.rating?.let { rating ->
        active += ActiveFilter("rating", res.getString(R.string.web_filters_chip_rating, rating)) { change(filters.copy(rating = null)) }
    }
    filters.language?.let { language ->
        val name = options.languages.firstOrNull { it.id == language }?.name ?: language
        active += ActiveFilter("language", name) { change(filters.copy(language = null)) }
    }
    if (filters.runtimeMin != null || filters.runtimeMax != null) {
        active += ActiveFilter("runtime", rangeText(filters.runtimeMin?.toDouble(), filters.runtimeMax?.toDouble(), { runtimeText(it, res) }, "", RUNTIME_CHIP_WORDS, res)) {
            change(filters.copy(runtimeMin = null, runtimeMax = null))
        }
    }
    return active
}

/** What a card says under its name, as the server says the list calls for; else the year. */
private fun browseDetail(detail: String?, item: CatalogBrowseTitle, res: Resources): String? {
    val score = item.score
    if (detail == "score" && score != null) {
        return item.year?.let { res.getString(R.string.web_filters_card_score, formatRating(score), it.toString()) }
            ?: res.getString(R.string.web_filters_card_scoreOnly, formatRating(score))
    }
    if (detail == "releaseDate") formatDay(item.releaseDate)?.let { return it }
    return item.year?.toString()
}

@Composable
fun CatalogBrowseScreen(kind: String) {
    val res = LocalResources.current
    val options = rememberLoader("browse-options-$kind") { discover.browseOptions(kind) }
    var filters by rememberSaveable(stateSaver = FiltersSaver) { mutableStateOf(NO_FILTERS) }
    var sort by rememberSaveable { mutableStateOf(CatalogSort.POPULAR) }
    var filtering by rememberSaveable { mutableStateOf(false) }
    val ready = (options.state as? Load.Ready)?.value?.takeIf { it.enabled }
    Column(Modifier.fillMaxSize()) {
        TopBar(browseName(kind, res)) {
            if (ready != null) {
                FilterButton(filters.count()) { filtering = true }
                SortButton(ready.sorts, sort) { sort = it }
            }
        }
        when (val state = options.state) {
            Load.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Spinner(size = 32.dp, color = Palette.Accent) }
            is Load.Failed -> Message(Lucide.CloudOff, stringResource(R.string.web_discover_browse_optionsFailed), stringResource(R.string.web_discover_failedHint)) {
                MatineeButton(onClick = options::reload, look = ButtonLook.Outline) {
                    LucideIcon(Lucide.RotateCw, null, size = 16.dp)
                    Text(stringResource(R.string.web_discover_retry))
                }
            }
            is Load.Ready -> if (!state.value.enabled) {
                Message(Lucide.Compass, stringResource(R.string.web_discover_off), stringResource(R.string.web_discover_offHint))
            } else {
                BrowseGrid(kind, state.value, filters, sort, onChange = { filters = it }, onFilters = { filtering = true })
            }
        }
    }
    if (filtering && ready != null) {
        BrowseFilterSheet(kind, ready, filters, onChange = { filters = it }, onDismiss = { filtering = false })
    }
}

@Composable
private fun SortButton(sorts: List<String>, sort: String, onSort: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        RoundIconButton(
            Lucide.ArrowUpDown,
            stringResource(R.string.browse_sort_current, stringResource(sortWord(sort))),
            { open = true },
            size = 48.dp,
            iconSize = 22.dp,
            background = Color.Transparent,
        )
        Menu(expanded = open, onDismissRequest = { open = false }) {
            sorts.forEach { value ->
                MenuItem(stringResource(sortWord(value)), selected = value == sort, onClick = {
                    open = false
                    onSort(value)
                })
            }
        }
    }
}

/** A whole-screen state: an icon, what happened, a line on it, and an action. */
@Composable
private fun Message(icon: Int, title: String, hint: String?, action: (@Composable () -> Unit)? = null) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        LucideIcon(icon, null, size = 28.dp, tint = Palette.Muted)
        Gap(12.dp)
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        if (!hint.isNullOrEmpty()) {
            Gap(4.dp)
            Text(hint, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted, textAlign = TextAlign.Center)
        }
        if (action != null) {
            Gap(16.dp)
            action()
        }
    }
}

/** Cards in a block of the grid the stream follows. */
private const val BLOCK = 12

/** Blocks followed at once: the ones on screen and one either side. */
private const val MOST_BLOCKS = 6

/** One browse, a page at a time. */
private class BrowsePages {
    val items = mutableStateListOf<CatalogBrowseTitle>()
    var next by mutableStateOf<Int?>(1)
    var loading by mutableStateOf(false)
    var error by mutableStateOf(false)
    var stale by mutableStateOf(false)
    var floor by mutableStateOf<Int?>(null)
    var detail by mutableStateOf<String?>(null)
}

@Composable
private fun BrowseGrid(
    kind: String,
    options: CatalogBrowseOptions,
    filters: CatalogFilters,
    sort: String,
    onChange: (CatalogFilters) -> Unit,
    onFilters: () -> Unit,
) {
    val api = LocalApi.current
    val res = LocalResources.current
    // A new browse starts its own pages, at the top.
    val pages = remember(kind, filters, sort) { BrowsePages() }
    val scope = rememberCoroutineScope()
    val more = {
        val page = pages.next
        if (!pages.loading && page != null) {
            pages.loading = true
            scope.launch {
                try {
                    val answer = api.discover.browse(CatalogBrowseInput(kind, filters, sort, page))
                    pages.items.addAll(answer.items.filter { new -> pages.items.none { it.ref.key == new.ref.key } })
                    pages.next = answer.nextPage
                    pages.stale = pages.stale || answer.stale
                    pages.floor = answer.voteFloor
                    pages.detail = answer.detail
                    pages.error = false
                } catch (e: CancellationException) {
                    throw e
                } catch (_: IOException) {
                    pages.error = true
                } catch (_: SerializationException) {
                    pages.error = true
                } finally {
                    pages.loading = false
                }
            }
        }
    }
    val grid = remember(pages) { androidx.compose.foundation.lazy.grid.LazyGridState() }
    val nearEnd by remember(grid) {
        derivedStateOf {
            val last = grid.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= grid.layoutInfo.totalItemsCount - 12
        }
    }
    LaunchedEffect(pages, nearEnd, pages.items.size) { if (nearEnd && !pages.error) more() }
    val window by remember(grid) {
        derivedStateOf {
            val shown = grid.layoutInfo.visibleItemsInfo.map { it.index }
            val first = (shown.minOrNull() ?: 0) / BLOCK
            val last = (shown.maxOrNull() ?: 0) / BLOCK
            val from = maxOf(0, first - 1)
            val to = minOf(last + 1, from + MOST_BLOCKS - 1)
            from * BLOCK to (to + 1) * BLOCK
        }
    }
    // Library cards play; only the rest can change.
    val followed = pages.items.toList().let { list -> list.subList(minOf(window.first, list.size), minOf(window.second, list.size)) }
        .filter { it.title == null }
    FollowTitles(followed.map { CatalogInput(it.ref) })
    val chips = activeFilters(filters, options, res, onChange)
    val clear = { onChange(NO_FILTERS) }

    LazyVerticalGrid(
        columns = GridCells.Adaptive(150.dp),
        state = grid,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = Gutter, end = Gutter, bottom = 32.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        if (chips.isNotEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }, key = "chips") {
                ActiveFilterChips(chips, clear)
            }
        }
        pages.floor?.let { floor ->
            item(span = { GridItemSpan(maxLineSpan) }, key = "floor") {
                Column {
                    Text(
                        res.getString(
                            if (sort == CatalogSort.SCORE_HIGH || sort == CatalogSort.SCORE_LOW) R.string.web_discover_browse_floorScore else R.string.web_discover_browse_floorList,
                            formatCount(floor, res),
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Palette.Muted,
                    )
                    Gap(8.dp)
                    MatineeButton(onClick = onFilters, look = ButtonLook.Outline, height = 36.dp) {
                        LucideIcon(Lucide.ListFilter, null, size = 16.dp)
                        Text(stringResource(R.string.web_discover_browse_floorChange))
                    }
                }
            }
        }
        if (pages.stale) {
            item(span = { GridItemSpan(maxLineSpan) }, key = "stale") {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    LucideIcon(Lucide.CloudOff, null, size = 16.dp, tint = Palette.Muted)
                    Text(stringResource(R.string.web_discover_stale), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                }
            }
        }
        if (pages.items.isEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }, key = "first") {
                LaunchedEffect(pages) { more() }
                when {
                    pages.error -> Message(Lucide.CloudOff, stringResource(R.string.web_discover_browse_failed), null) {
                        MatineeButton(onClick = { more() }, look = ButtonLook.Outline) {
                            LucideIcon(Lucide.RotateCw, null, size = 16.dp)
                            Text(stringResource(R.string.web_discover_retry))
                        }
                    }
                    pages.loading || pages.next != null -> Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                        Spinner(size = 32.dp, color = Palette.Accent)
                    }
                    chips.isNotEmpty() -> Message(
                        Lucide.SearchX,
                        stringResource(if (kind == TitleKind.SHOW) R.string.web_discover_browse_none_show else R.string.web_discover_browse_none_movie),
                        stringResource(R.string.web_filters_noneHint),
                    ) {
                        MatineeButton(onClick = clear, look = ButtonLook.Outline) { Text(stringResource(R.string.browse_clear_filters)) }
                    }
                    else -> Message(Lucide.SearchX, stringResource(R.string.web_discover_browse_nothing), null)
                }
            }
        }
        itemsIndexed(pages.items, key = { _, item -> item.ref.key }) { _, item ->
            BrowseCard(item, browseDetail(pages.detail, item, res))
        }
        if (pages.items.isNotEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }, key = "end") {
                Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                    when {
                        pages.loading -> Spinner(size = 32.dp, color = Palette.Accent)
                        pages.error -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(stringResource(R.string.web_discover_moreFailed), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                            Gap(8.dp)
                            MatineeButton(onClick = { more() }, look = ButtonLook.Outline) { Text(stringResource(R.string.web_discover_retry)) }
                        }
                        pages.next == null -> Text(stringResource(R.string.web_discover_end), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                    }
                }
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }, key = "bottom") { Box(Modifier.navigationBarsPadding()) }
    }
}

/**
 * A title the viewer can watch is the library's card. The rest are
 * catalog cards with what the stream says now; one that arrives while on
 * screen turns into the library's card in place.
 */
@Composable
private fun BrowseCard(item: CatalogBrowseTitle, detail: String?) {
    val availability = LocalRequests.current.availability(item.ref, item.availability)
    val library = item.title
    if (library != null && availability.state == AvailabilityState.HERE && availability.libraryTitleId == library.id) {
        PosterCard(library, detail)
    } else {
        CatalogCard(CatalogTitleSummary(item.ref, item.name, item.year, item.poster, item.availability), detail = detail)
    }
}

/** The filters, in the sheet the libraries share. */
@Composable
private fun BrowseFilterSheet(
    kind: String,
    options: CatalogBrowseOptions,
    filters: CatalogFilters,
    onChange: (CatalogFilters) -> Unit,
    onDismiss: () -> Unit,
) {
    val res = LocalResources.current
    var choosingLanguage by remember { mutableStateOf(false) }
    FilterSheet(filters.count(), onClear = { onChange(NO_FILTERS) }, onDismiss = onDismiss) {
        if (options.genres.isNotEmpty()) {
            FilterSection(stringResource(R.string.web_filters_genres)) {
                val genres = filters.genres.orEmpty()
                ToggleChips(
                    options.genres.map { FilterChoice(it.id.toString(), it.name) },
                    genres.map { it.toString() },
                    { picked -> onChange(filters.copy(genres = picked.mapNotNull { it.toIntOrNull() })) },
                )
            }
        }
        RangeField(
            stringResource(R.string.web_filters_years),
            null,
            options.years.span(),
            filters.yearFrom?.toDouble(),
            filters.yearTo?.toDouble(),
            { low, high -> rangeText(low, high, ::yearText, res.getString(R.string.web_filters_anyYear), YEAR_WORDS, res) },
        ) { low, high -> onChange(filters.copy(yearFrom = low?.roundToInt(), yearTo = high?.roundToInt())) }
        RangeField(
            stringResource(R.string.web_filters_score),
            stringResource(R.string.web_discover_browse_scoreHint),
            options.scores.span(),
            filters.scoreMin,
            filters.scoreMax,
            { low, high -> rangeText(low, high, ::formatRating, res.getString(R.string.web_filters_anyScore), PANEL_WORDS, res) },
        ) { low, high -> onChange(filters.copy(scoreMin = low, scoreMax = high)) }
        if (options.votes.isNotEmpty()) {
            FilterSection(stringResource(R.string.web_discover_browse_votes)) {
                ChoiceChips(
                    options.votes.map { FilterChoice(it, res.getString(R.string.web_discover_browse_votesStep, formatCount(it, res))) },
                    filters.votesMin,
                ) { onChange(filters.copy(votesMin = it)) }
            }
        }
        options.ratings?.let { ratings ->
            FilterSection(
                stringResource(R.string.web_filters_rating),
                stringResource(R.string.web_filters_ratingHint, countryName(ratings.country, res)),
            ) {
                ChoiceChips(ratings.ratings.map { FilterChoice(it, it) }, filters.rating) { onChange(filters.copy(rating = it)) }
            }
        }
        if (options.languages.isNotEmpty()) {
            FilterSection(stringResource(R.string.web_filters_language)) {
                OptionRow(options.languages.firstOrNull { it.id == filters.language }?.name ?: stringResource(R.string.web_filters_anyLanguage)) {
                    choosingLanguage = true
                }
            }
        }
        RangeField(
            stringResource(R.string.web_filters_runtime),
            stringResource(if (kind == TitleKind.SHOW) R.string.web_filters_runtimeHint_show else R.string.web_filters_runtimeHint_movie),
            options.runtime.span(),
            filters.runtimeMin?.toDouble(),
            filters.runtimeMax?.toDouble(),
            { low, high -> rangeText(low, high, { runtimeText(it, res) }, res.getString(R.string.web_filters_anyLength), PANEL_WORDS, res) },
        ) { low, high -> onChange(filters.copy(runtimeMin = low?.roundToInt(), runtimeMax = high?.roundToInt())) }
    }
    if (choosingLanguage) {
        OptionSheet(
            stringResource(R.string.web_filters_language),
            stringResource(R.string.web_filters_anyLanguage),
            R.string.browse_find_language,
            options.languages.map { FilterChoice(it.id, it.name) },
            filters.language,
            onPick = {
                choosingLanguage = false
                onChange(filters.copy(language = it))
            },
            onDismiss = { choosingLanguage = false },
        )
    }
}

private fun CatalogRange.span() = FilterSpan(min, max, step)
