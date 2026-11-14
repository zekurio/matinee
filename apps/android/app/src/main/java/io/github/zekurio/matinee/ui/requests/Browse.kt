package io.github.zekurio.matinee.ui.requests

import android.content.res.Resources
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.shadow
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.systemGestureExclusion
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RangeSlider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
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
import io.github.zekurio.matinee.ui.components.ButtonLook
import io.github.zekurio.matinee.ui.components.Chip
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.MatineeTextField
import io.github.zekurio.matinee.ui.components.PosterCard
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.formatDay
import io.github.zekurio.matinee.ui.formatRating
import io.github.zekurio.matinee.ui.formatRuntime
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette
import java.io.IOException
import java.text.NumberFormat
import java.util.Locale
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
    CatalogSort.SCORE_HIGH -> R.string.web_discover_browse_sort_scoreHigh
    CatalogSort.SCORE_LOW -> R.string.web_discover_browse_sort_scoreLow
    CatalogSort.VOTES -> R.string.web_discover_browse_sort_votes
    CatalogSort.NEWEST -> R.string.web_discover_browse_sort_newest
    CatalogSort.OLDEST -> R.string.web_discover_browse_sort_oldest
    CatalogSort.NAME_ASC -> R.string.web_discover_browse_sort_nameAsc
    CatalogSort.NAME_DESC -> R.string.web_discover_browse_sort_nameDesc
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

/** The keys that word a range: both ends, the low one, the high one. */
private data class RangeWords(@StringRes val between: Int, @StringRes val low: Int, @StringRes val high: Int)

private val PANEL = RangeWords(R.string.web_discover_browse_between, R.string.web_discover_browse_atLeast, R.string.web_discover_browse_upTo)
private val YEARS = PANEL.copy(low = R.string.web_discover_browse_from)
private val SCORE_CHIP = RangeWords(R.string.web_discover_browse_chip_scoreBetween, R.string.web_discover_browse_chip_scoreAtLeast, R.string.web_discover_browse_chip_scoreUpTo)
private val RUNTIME_CHIP = RangeWords(R.string.web_discover_browse_chip_runtimeBetween, R.string.web_discover_browse_chip_runtimeAtLeast, R.string.web_discover_browse_chip_runtimeUpTo)

/** "1980 to 1989", "At least 7.5", or [any] with both ends open. */
private fun rangeText(low: Double?, high: Double?, format: (Double) -> String, any: String, words: RangeWords, res: Resources): String = when {
    low != null && high != null && low == high -> format(low)
    low != null && high != null -> res.getString(words.between, format(low), format(high))
    low != null -> res.getString(words.low, format(low))
    high != null -> res.getString(words.high, format(high))
    else -> any
}

private fun year(value: Double) = value.roundToInt().toString()
private fun runtime(value: Double, res: Resources) = formatRuntime(value.roundToInt(), res) ?: "0"

/** A filter in use, as its chip names it. */
private class ActiveFilter(val key: String, val label: String, val remove: () -> Unit)

private fun activeFilters(filters: CatalogFilters, options: CatalogBrowseOptions, res: Resources, change: (CatalogFilters) -> Unit): List<ActiveFilter> {
    val active = mutableListOf<ActiveFilter>()
    val genres = filters.genres.orEmpty()
    genres.forEach { id ->
        val genre = options.genres.firstOrNull { it.id == id } ?: return@forEach
        active += ActiveFilter("genre-$id", genre.name) { change(filters.copy(genres = genres - id)) }
    }
    if (filters.yearFrom != null || filters.yearTo != null) {
        active += ActiveFilter("years", rangeText(filters.yearFrom?.toDouble(), filters.yearTo?.toDouble(), ::year, "", YEARS, res)) {
            change(filters.copy(yearFrom = null, yearTo = null))
        }
    }
    if (filters.scoreMin != null || filters.scoreMax != null) {
        active += ActiveFilter("score", rangeText(filters.scoreMin, filters.scoreMax, ::formatRating, "", SCORE_CHIP, res)) {
            change(filters.copy(scoreMin = null, scoreMax = null))
        }
    }
    filters.votesMin?.let { votes ->
        active += ActiveFilter("votes", res.getQuantityString(R.plurals.web_discover_browse_chip_votes, votes, formatCount(votes, res))) {
            change(filters.copy(votesMin = null))
        }
    }
    filters.rating?.let { rating ->
        active += ActiveFilter("rating", res.getString(R.string.web_discover_browse_chip_rating, rating)) { change(filters.copy(rating = null)) }
    }
    filters.language?.let { language ->
        val name = options.languages.firstOrNull { it.id == language }?.name ?: language
        active += ActiveFilter("language", name) { change(filters.copy(language = null)) }
    }
    if (filters.runtimeMin != null || filters.runtimeMax != null) {
        active += ActiveFilter("runtime", rangeText(filters.runtimeMin?.toDouble(), filters.runtimeMax?.toDouble(), { runtime(it, res) }, "", RUNTIME_CHIP, res)) {
            change(filters.copy(runtimeMin = null, runtimeMax = null))
        }
    }
    return active
}

private fun formatCount(count: Int, res: Resources): String =
    NumberFormat.getIntegerInstance(res.configuration.locales[0] ?: Locale.getDefault()).format(count)

/** A country's name for its ISO code, in the app's language. */
private fun countryName(code: String, res: Resources): String =
    runCatching { Locale.Builder().setRegion(code).build().getDisplayCountry(res.configuration.locales[0] ?: Locale.getDefault()) }
        .getOrNull()?.ifEmpty { null } ?: code

/** What a card says under its name, as the server says the list calls for; else the year. */
private fun browseDetail(detail: String?, item: CatalogBrowseTitle, res: Resources): String? {
    val score = item.score
    if (detail == "score" && score != null) {
        return item.year?.let { res.getString(R.string.web_discover_browse_card_score, formatRating(score), it.toString()) }
            ?: res.getString(R.string.web_discover_browse_card_scoreOnly, formatRating(score))
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
                RoundIconButton(
                    Lucide.ListFilter,
                    if (filters.count() > 0) {
                        res.getQuantityString(R.plurals.browse_filters_on, filters.count(), filters.count())
                    } else {
                        stringResource(R.string.web_discover_browse_filters)
                    },
                    { filtering = true },
                    size = 48.dp,
                    iconSize = 22.dp,
                    background = Color.Transparent,
                    tint = if (filters.count() > 0) Palette.Accent else Palette.Foreground,
                )
                SortButton(ready.sorts, sort) { sort = it }
            }
        }
        when (val state = options.state) {
            Load.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Palette.Accent) }
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
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = Palette.Raised) {
            sorts.forEach { value ->
                DropdownMenuItem(
                    text = { Text(stringResource(sortWord(value))) },
                    trailingIcon = if (value == sort) ({ LucideIcon(Lucide.Check, null, size = 16.dp) }) else null,
                    onClick = {
                        open = false
                        onSort(value)
                    },
                )
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
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp), contentPadding = PaddingValues(vertical = 2.dp)) {
                    items(chips, key = { it.key }) { chip ->
                        Chip(
                            chip.label,
                            selected = true,
                            trailingIcon = Lucide.X,
                            onClick = chip.remove,
                            modifier = Modifier.semantics { contentDescription = res.getString(R.string.browse_remove_filter, chip.label) },
                        )
                    }
                    if (chips.size > 1) {
                        item(key = "clear") { Chip(stringResource(R.string.browse_clear_all), selected = false, onClick = clear) }
                    }
                }
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
                        CircularProgressIndicator(color = Palette.Accent)
                    }
                    chips.isNotEmpty() -> Message(
                        Lucide.SearchX,
                        stringResource(if (kind == TitleKind.SHOW) R.string.web_discover_browse_none_show else R.string.web_discover_browse_none_movie),
                        stringResource(R.string.web_discover_browse_noneHint),
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
                        pages.loading -> CircularProgressIndicator(color = Palette.Accent)
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

/**
 * The filters, in a bottom sheet as a library's genre is. Each change
 * applies at once; a range applies when its handle is let go.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun BrowseFilterSheet(
    kind: String,
    options: CatalogBrowseOptions,
    filters: CatalogFilters,
    onChange: (CatalogFilters) -> Unit,
    onDismiss: () -> Unit,
) {
    val res = LocalResources.current
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var choosingLanguage by remember { mutableStateOf(false) }
    val close: () -> Unit = { scope.launch { sheet.hide() }.invokeOnCompletion { onDismiss() } }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet, containerColor = Palette.Raised) {
        Text(
            stringResource(R.string.web_discover_browse_filters),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = Gutter, vertical = 8.dp),
        )
        Column(
            Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(horizontal = Gutter, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            if (options.genres.isNotEmpty()) {
                Section(stringResource(R.string.web_discover_browse_genres)) {
                    val genres = filters.genres.orEmpty()
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        options.genres.forEach { genre ->
                            val on = genre.id in genres
                            Chip(genre.name, selected = on, onClick = { onChange(filters.copy(genres = if (on) genres - genre.id else genres + genre.id)) })
                        }
                    }
                }
            }
            RangeField(
                stringResource(R.string.web_discover_browse_years),
                null,
                options.years,
                filters.yearFrom?.toDouble(),
                filters.yearTo?.toDouble(),
                { low, high -> rangeText(low, high, ::year, res.getString(R.string.web_discover_browse_anyYear), YEARS, res) },
            ) { low, high -> onChange(filters.copy(yearFrom = low?.roundToInt(), yearTo = high?.roundToInt())) }
            RangeField(
                stringResource(R.string.web_discover_browse_score),
                stringResource(R.string.web_discover_browse_scoreHint),
                options.scores,
                filters.scoreMin,
                filters.scoreMax,
                { low, high -> rangeText(low, high, ::formatRating, res.getString(R.string.web_discover_browse_anyScore), PANEL, res) },
            ) { low, high -> onChange(filters.copy(scoreMin = low, scoreMax = high)) }
            if (options.votes.isNotEmpty()) {
                Section(stringResource(R.string.web_discover_browse_votes)) {
                    ChoiceChips(
                        options.votes.map { it to res.getString(R.string.web_discover_browse_votesStep, formatCount(it, res)) },
                        filters.votesMin,
                    ) { onChange(filters.copy(votesMin = it)) }
                }
            }
            options.ratings?.let { ratings ->
                Section(
                    stringResource(R.string.web_discover_browse_rating),
                    stringResource(R.string.web_discover_browse_ratingHint, countryName(ratings.country, res)),
                ) {
                    ChoiceChips(ratings.ratings.map { it to it }, filters.rating) { onChange(filters.copy(rating = it)) }
                }
            }
            if (options.languages.isNotEmpty()) {
                Section(stringResource(R.string.web_discover_browse_language)) {
                    val name = options.languages.firstOrNull { it.id == filters.language }?.name ?: stringResource(R.string.web_discover_browse_anyLanguage)
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable { choosingLanguage = true },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                        LucideIcon(Lucide.ChevronRight, null, size = 18.dp, tint = Palette.Muted)
                    }
                }
            }
            RangeField(
                stringResource(R.string.web_discover_browse_runtime),
                stringResource(if (kind == TitleKind.SHOW) R.string.web_discover_browse_runtimeHint_show else R.string.web_discover_browse_runtimeHint_movie),
                options.runtime,
                filters.runtimeMin?.toDouble(),
                filters.runtimeMax?.toDouble(),
                { low, high -> rangeText(low, high, { runtime(it, res) }, res.getString(R.string.web_discover_browse_anyLength), PANEL, res) },
            ) { low, high -> onChange(filters.copy(runtimeMin = low?.roundToInt(), runtimeMax = high?.roundToInt())) }
        }
        HorizontalDivider(color = Palette.Border)
        Row(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = Gutter, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (filters.count() > 0) {
                MatineeButton(onClick = { onChange(NO_FILTERS) }, look = ButtonLook.Ghost) {
                    LucideIcon(Lucide.X, null, size = 16.dp)
                    Text(stringResource(R.string.browse_clear_filters))
                }
            }
            Box(Modifier.weight(1f))
            MatineeButton(onClick = close) { Text(stringResource(R.string.web_discover_browse_done)) }
        }
    }
    if (choosingLanguage) {
        LanguageSheet(options, filters.language, onPick = {
            choosingLanguage = false
            onChange(filters.copy(language = it))
        }, onDismiss = { choosingLanguage = false })
    }
}

/** A filter's heading, a line about it, what it's set to, and its control. */
@Composable
private fun Section(title: String, hint: String? = null, value: String? = null, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                if (hint != null) Text(hint, style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
            }
            if (value != null) Text(value, style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
        }
        content()
    }
}

/** One of a few values, or none: "Any" first, then each. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun <T> ChoiceChips(choices: List<Pair<T, String>>, value: T?, onChange: (T?) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Chip(stringResource(R.string.web_discover_browse_any), selected = value == null, onClick = { onChange(null) })
        choices.forEach { (choice, label) ->
            Chip(label, selected = choice == value, onClick = { onChange(choice) })
        }
    }
}

/**
 * Two handles on a range, each open at its end. What it says follows the
 * handles; the browse changes once they're let go.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RangeField(
    title: String,
    hint: String?,
    range: CatalogRange,
    low: Double?,
    high: Double?,
    words: (Double?, Double?) -> String,
    onCommit: (Double?, Double?) -> Unit,
) {
    val min = range.min.toFloat()
    val max = range.max.toFloat()
    var moving by remember(low, high) { mutableStateOf((low?.toFloat() ?: min)..(high?.toFloat() ?: max)) }
    val open = { values: ClosedFloatingPointRange<Float> ->
        val step = range.step
        fun snap(value: Float) = range.min + ((value - range.min) / step).roundToInt() * step
        val a = snap(values.start)
        val b = snap(values.endInclusive)
        (if (a <= range.min) null else a) to (if (b >= range.max) null else b)
    }
    val (shownLow, shownHigh) = open(moving)
    val said = words(shownLow, shownHigh)
    Section(title, hint, said) {
        val colors = SliderDefaults.colors(
            thumbColor = Palette.Accent,
            activeTrackColor = Palette.Accent,
            inactiveTrackColor = Palette.Border,
            activeTickColor = Color.Transparent,
            inactiveTickColor = Color.Transparent,
        )
        // A thin track and round handles, as the web's range has them.
        val thumb: @Composable (androidx.compose.material3.RangeSliderState) -> Unit = {
            Box(
                Modifier.size(20.dp)
                    .shadow(1.dp, CircleShape)
                    .background(Color.White, CircleShape)
                    .border(1.5.dp, Palette.Accent, CircleShape),
            )
        }
        RangeSlider(
            value = moving,
            onValueChange = { moving = it },
            valueRange = min..max,
            steps = (((range.max - range.min) / range.step).roundToInt() - 1).coerceAtLeast(0),
            onValueChangeFinished = {
                val (a, b) = open(moving)
                onCommit(a, b)
            },
            colors = colors,
            startThumb = thumb,
            endThumb = thumb,
            track = { state ->
                SliderDefaults.Track(
                    rangeSliderState = state,
                    modifier = Modifier.height(4.dp),
                    colors = colors,
                    drawStopIndicator = null,
                    thumbTrackGapSize = 0.dp,
                )
            },
            // The handles sit at the screen's edges, where a swipe would
            // otherwise go back and close the sheet.
            modifier = Modifier.systemGestureExclusion().semantics { stateDescription = said },
        )
    }
}

/** Every language a title can be made in, with a field to find one. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LanguageSheet(options: CatalogBrowseOptions, current: String?, onPick: (String?) -> Unit, onDismiss: () -> Unit) {
    var query by remember { mutableStateOf("") }
    val shown = options.languages.filter { query.isBlank() || it.name.contains(query.trim(), ignoreCase = true) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.Raised) {
        Text(
            stringResource(R.string.web_discover_browse_language),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = Gutter, vertical = 8.dp),
        )
        MatineeTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = stringResource(R.string.browse_find_language),
            leadingIcon = Lucide.Search,
            modifier = Modifier.fillMaxWidth().padding(horizontal = Gutter, vertical = 8.dp),
        )
        HorizontalDivider(color = Palette.Border)
        LazyColumn(Modifier.fillMaxWidth().heightIn(max = 480.dp).navigationBarsPadding()) {
            if (query.isBlank()) {
                item(key = "any") { LanguageRow(stringResource(R.string.web_discover_browse_anyLanguage), current == null) { onPick(null) } }
            }
            items(shown, key = { it.id }) { language ->
                LanguageRow(language.name, current == language.id) { onPick(language.id) }
            }
        }
    }
}

@Composable
private fun LanguageRow(name: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = Gutter, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        if (selected) LucideIcon(Lucide.Check, null, size = 18.dp, tint = Palette.Accent)
    }
}
