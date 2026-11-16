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
import io.github.zekurio.matinee.ui.components.homeAction
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
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.components.ErrorSection
import io.github.zekurio.matinee.ui.components.ErrorState
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.ChoiceChips
import io.github.zekurio.matinee.ui.components.FilterButton
import io.github.zekurio.matinee.ui.components.FilterChoice
import io.github.zekurio.matinee.ui.components.FilterSection
import io.github.zekurio.matinee.ui.components.FilterSheet
import io.github.zekurio.matinee.ui.components.FilterSpan
import io.github.zekurio.matinee.ui.components.LocalActions
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.OptionRow
import io.github.zekurio.matinee.ui.components.OptionSheet
import io.github.zekurio.matinee.ui.components.PANEL_WORDS
import io.github.zekurio.matinee.ui.components.PosterCard
import io.github.zekurio.matinee.ui.components.RangeField
import io.github.zekurio.matinee.ui.components.ToggleChips
import io.github.zekurio.matinee.ui.components.YEAR_WORDS
import io.github.zekurio.matinee.ui.components.countryName
import io.github.zekurio.matinee.ui.components.formatCount
import io.github.zekurio.matinee.ui.components.rangeText
import io.github.zekurio.matinee.ui.components.runtimeText
import io.github.zekurio.matinee.ui.components.yearText
import io.github.zekurio.matinee.ui.formatDay
import io.github.zekurio.matinee.ui.formatRating
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
 * All of TMDB's movies or shows, or the viewer's recommendations of
 * them, narrowed by filters and in the order the viewer picks, as the
 * web's browse pages under Discover have them: a grid that loads more as
 * it scrolls, the filters in a bottom sheet as a library's genre is, and
 * the sort in the bar's menu. Each Discover row's heading opens one with
 * the row's filters and sort. What each filter offers comes from the
 * server. Titles that are here are the library's cards; the rest ask, as
 * on Discover.
 */

val NO_FILTERS = CatalogFilters(
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
    recommended = null,
    upcoming = null,
    requestable = null,
)

/** Whether a browse lists the viewer's recommendations, whose cards offer "Not interested". */
fun recommends(filters: CatalogFilters) = filters.recommended == true

/** Whether a sort goes with the list: best match only among recommendations, as the server has it. */
private fun sortFits(sort: String, filters: CatalogFilters) = sort != CatalogSort.FOR_YOU || recommends(filters)

/** Kept across rotation and process death, as JSON. */
private val FiltersSaver = Saver<CatalogFilters, String>(
    save = { MatineeJson.encodeToString(CatalogFilters.serializer(), it) },
    restore = { runCatching { MatineeJson.decodeFromString(CatalogFilters.serializer(), it) }.getOrNull() },
)

/** The sorts' words, by the server's ids. */
private fun sortWord(sort: String): Int = when (sort) {
    CatalogSort.FOR_YOU -> R.string.web_discover_browse_sort_forYou
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
        listOf(
            yearFrom != null || yearTo != null,
            scoreMin != null || scoreMax != null,
            votesMin != null,
            rating != null,
            language != null,
            runtimeMin != null || runtimeMax != null,
            recommended == true,
            upcoming == true,
            requestable == true,
        ).count { it }

/** What a card says under its name, as the server says the list calls for; else the year. */
fun browseDetail(detail: String?, item: CatalogBrowseTitle, res: Resources): String? {
    val score = item.score
    if (detail == "score" && score != null) {
        return item.year?.let { res.getString(R.string.web_filters_card_score, formatRating(score), it.toString()) }
            ?: res.getString(R.string.web_filters_card_scoreOnly, formatRating(score))
    }
    if (detail == "releaseDate") formatDay(item.releaseDate)?.let { return it }
    return item.year?.toString()
}

/**
 * Browsing [startKind], with [startFilters] (`CatalogFilters` JSON) and
 * [startSort] from a Discover row's heading, or none.
 */
@Composable
fun CatalogBrowseScreen(startKind: String, startFilters: String? = null, startSort: String? = null) {
    val res = LocalResources.current
    val kind = startKind
    val options = rememberLoader("browse-options-$kind") { discover.browseOptions(kind) }
    var filters by rememberSaveable(stateSaver = FiltersSaver) {
        mutableStateOf(startFilters?.let { FiltersSaver.restore(it) } ?: NO_FILTERS)
    }
    var sort by rememberSaveable { mutableStateOf(startSort ?: CatalogSort.POPULAR) }
    var filtering by rememberSaveable { mutableStateOf(false) }
    // The votes the server asks of the list while no minimum is chosen, for the sheet.
    var voteFloor by remember { mutableStateOf<Int?>(null) }
    val ready = (options.state as? Load.Ready)?.value?.takeIf { it.enabled }
    // Best match goes with the recommendations, and back to popular without them.
    val change = { next: CatalogFilters ->
        filters = next
        if (!sortFits(sort, next)) sort = CatalogSort.POPULAR
    }
    Column(Modifier.fillMaxSize()) {
        TopBar(browseName(kind, res)) {
            if (ready != null) {
                FilterButton(filters.count()) { filtering = true }
                SortButton(ready.sorts.filter { sortFits(it, filters) }, sort) { sort = it }
            }
        }
        when (val state = options.state) {
            Load.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Spinner(size = 32.dp, color = Palette.Accent) }
            is Load.Failed -> ErrorBox(
                stringResource(R.string.browse_filters_failed),
                stringResource(R.string.web_discover_failedHint),
                options::reload,
                icon = Lucide.CloudOff,
            )
            is Load.Ready -> if (!state.value.enabled) {
                Message(Lucide.Compass, stringResource(R.string.web_discover_off), stringResource(R.string.web_discover_offHint))
            } else {
                BrowseGrid(
                    kind,
                    filters,
                    sort,
                    onChange = change,
                    onFloor = { voteFloor = it },
                )
            }
        }
    }
    if (filtering && ready != null) {
        BrowseFilterSheet(kind, ready, filters, sort, voteFloor, onChange = change, onDismiss = { filtering = false })
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
    var detail by mutableStateOf<String?>(null)

    /** Pages read, so one that brought nothing new still moves on to the next. */
    var reads by mutableStateOf(0)
}

@Composable
private fun BrowseGrid(
    kind: String,
    filters: CatalogFilters,
    sort: String,
    onChange: (CatalogFilters) -> Unit,
    onFloor: (Int?) -> Unit,
) {
    val api = LocalApi.current
    val res = LocalResources.current
    val actions = LocalActions.current
    val recommended = recommends(filters)
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
                    onFloor(answer.voteFloor)
                    pages.detail = answer.detail
                    pages.reads++
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
    LaunchedEffect(pages, nearEnd, pages.reads) { if (nearEnd && !pages.error) more() }
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
    val filtered = filters.count() > 0
    val clear = { onChange(NO_FILTERS) }
    val shown = pages.items.filter { !recommended || it.ref.key !in actions.hidden }

    LazyVerticalGrid(
        columns = GridCells.Adaptive(150.dp),
        state = grid,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = Gutter, end = Gutter, bottom = 32.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
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
                    pages.error -> ErrorState(
                        stringResource(R.string.grid_load_failed),
                        stringResource(R.string.web_discover_failedHint),
                        { more() },
                        Modifier.fillMaxWidth().padding(vertical = 48.dp),
                        icon = Lucide.CloudOff,
                        onHome = homeAction(),
                    )
                    pages.loading || pages.next != null -> Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                        Spinner(size = 32.dp, color = Palette.Accent)
                    }
                    recommended -> Message(
                        Lucide.Compass,
                        stringResource(R.string.web_discover_browse_forYouNone),
                        stringResource(R.string.web_discover_browse_forYouHint),
                    ) {
                        if (filtered) {
                            MatineeButton(onClick = clear, look = ButtonLook.Outline) { Text(stringResource(R.string.browse_clear_filters)) }
                        }
                    }
                    filtered -> Message(
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
        itemsIndexed(shown, key = { _, item -> item.ref.key }) { _, item ->
            BrowseCard(item, browseDetail(pages.detail, item, res), recommended)
        }
        if (pages.items.isNotEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }, key = "end") {
                Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                    when {
                        pages.loading -> Spinner(size = 32.dp, color = Palette.Accent)
                        pages.error -> ErrorSection(stringResource(R.string.grid_more_failed), null, { more() })
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
fun BrowseCard(item: CatalogBrowseTitle, detail: String?, recommended: Boolean, modifier: Modifier = Modifier) {
    val availability = LocalRequests.current.availability(item.ref, item.availability)
    val library = item.title
    val actions = LocalActions.current
    if (library != null && availability.state == AvailabilityState.HERE && availability.libraryTitleId == library.id) {
        PosterCard(library, detail, modifier)
    } else {
        val summary = CatalogTitleSummary(item.ref, item.name, item.year, item.poster, item.availability)
        CatalogCard(
            summary,
            modifier,
            detail = detail,
            // "Not interested", for a recommendation.
            onLongClick = if (recommended) ({ actions.notInterested = summary }) else null,
        )
    }
}

/** The filters, in the sheet the libraries share. */
@Composable
private fun BrowseFilterSheet(
    kind: String,
    options: CatalogBrowseOptions,
    filters: CatalogFilters,
    sort: String,
    voteFloor: Int?,
    onChange: (CatalogFilters) -> Unit,
    onDismiss: () -> Unit,
) {
    val res = LocalResources.current
    var choosingLanguage by remember { mutableStateOf(false) }
    FilterSheet(filters.count(), onClear = { onChange(NO_FILTERS) }, onDismiss = onDismiss) {
        FilterSection(stringResource(R.string.web_discover_browse_only), stringResource(R.string.web_discover_browse_onlyHint)) {
            ToggleChips(
                listOf(
                    FilterChoice("recommended", stringResource(R.string.web_discover_browse_recommended)),
                    FilterChoice("upcoming", stringResource(R.string.web_discover_browse_upcoming)),
                    FilterChoice("requestable", stringResource(R.string.web_discover_browse_requestable)),
                ),
                listOfNotNull(
                    "recommended".takeIf { filters.recommended == true },
                    "upcoming".takeIf { filters.upcoming == true },
                    "requestable".takeIf { filters.requestable == true },
                ),
                { picked ->
                    onChange(
                        filters.copy(
                            recommended = true.takeIf { "recommended" in picked },
                            upcoming = true.takeIf { "upcoming" in picked },
                            requestable = true.takeIf { "requestable" in picked },
                        ),
                    )
                },
            )
        }
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
            FilterSection(
                stringResource(R.string.web_discover_browse_votes),
                voteFloor?.let {
                    res.getString(
                        if (sort == CatalogSort.SCORE_HIGH || sort == CatalogSort.SCORE_LOW) R.string.web_discover_browse_floorScore else R.string.web_discover_browse_floorList,
                        formatCount(it, res),
                    )
                },
            ) {
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
