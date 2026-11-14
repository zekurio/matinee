package io.github.zekurio.matinee.ui.browse

import android.content.res.Resources
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.AgeLimit
import io.github.zekurio.matinee.api.FilterRange
import io.github.zekurio.matinee.api.MatineeJson
import io.github.zekurio.matinee.api.RatingSystem
import io.github.zekurio.matinee.api.SortOrder
import io.github.zekurio.matinee.api.TitleFilterOptions
import io.github.zekurio.matinee.api.TitleFilters
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.TitleSort
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.api.WatchFilter
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.components.ActiveFilter
import io.github.zekurio.matinee.ui.components.ChoiceChips
import io.github.zekurio.matinee.ui.components.FilterChoice
import io.github.zekurio.matinee.ui.components.FilterSection
import io.github.zekurio.matinee.ui.components.FilterSheet
import io.github.zekurio.matinee.ui.components.FilterSpan
import io.github.zekurio.matinee.ui.components.OptionRow
import io.github.zekurio.matinee.ui.components.OptionSheet
import io.github.zekurio.matinee.ui.components.PANEL_WORDS
import io.github.zekurio.matinee.ui.components.RUNTIME_CHIP_WORDS
import io.github.zekurio.matinee.ui.components.RangeField
import io.github.zekurio.matinee.ui.components.SCORE_CHIP_WORDS
import io.github.zekurio.matinee.ui.components.ToggleChips
import io.github.zekurio.matinee.ui.components.YEAR_WORDS
import io.github.zekurio.matinee.ui.components.countryName
import io.github.zekurio.matinee.ui.components.rangeText
import io.github.zekurio.matinee.ui.components.runtimeText
import io.github.zekurio.matinee.ui.components.yearText
import io.github.zekurio.matinee.ui.formatRating
import io.github.zekurio.matinee.ui.formatRuntime
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.Menu
import io.github.zekurio.matinee.ui.kit.MenuItem
import io.github.zekurio.matinee.ui.kit.RoundIconButton
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.settings.languageName
import kotlin.math.roundToInt
import kotlinx.coroutines.delay

/*
 * A list of titles' filters and order on a phone, for a library's page
 * and a genre's or studio's, as the web's: what the server offers for the
 * list, in the sheet Discover's browse has, and the sorts in the bar's
 * menu, each in both directions.
 */

/** Every filter off; the server fills in the rest. */
val NO_TITLE_FILTERS = TitleFilters(genres = emptyList(), studios = emptyList())

/** How many studios show before the field that finds the rest. */
private const val STUDIOS_SHOWN = 10

/** A sort and its way, with its words, in the order the menu offers them. */
class TitleOrder(val sort: String, val order: String, val label: Int)

val TITLE_ORDERS = listOf(
    TitleOrder(TitleSort.NAME, SortOrder.ASC, R.string.web_filters_sort_nameAsc),
    TitleOrder(TitleSort.NAME, SortOrder.DESC, R.string.web_filters_sort_nameDesc),
    TitleOrder(TitleSort.RECENT, SortOrder.DESC, R.string.web_filters_sort_recentNew),
    TitleOrder(TitleSort.RECENT, SortOrder.ASC, R.string.web_filters_sort_recentOld),
    TitleOrder(TitleSort.YEAR, SortOrder.DESC, R.string.web_filters_sort_newest),
    TitleOrder(TitleSort.YEAR, SortOrder.ASC, R.string.web_filters_sort_oldest),
    TitleOrder(TitleSort.SCORE, SortOrder.DESC, R.string.web_filters_sort_scoreHigh),
    TitleOrder(TitleSort.SCORE, SortOrder.ASC, R.string.web_filters_sort_scoreLow),
    TitleOrder(TitleSort.RUNTIME, SortOrder.DESC, R.string.web_filters_sort_longest),
    TitleOrder(TitleSort.RUNTIME, SortOrder.ASC, R.string.web_filters_sort_shortest),
)

/** A sort's usual way, as the server has it: A to Z by name, the most of the rest first. */
private fun usual(sort: String) = if (sort == TitleSort.NAME) SortOrder.ASC else SortOrder.DESC

/** Kept across rotation and process death, as JSON. */
private val FiltersSaver = Saver<TitleFilters, String>(
    save = { MatineeJson.encodeToString(TitleFilters.serializer(), it) },
    restore = { runCatching { MatineeJson.decodeFromString(TitleFilters.serializer(), it) }.getOrNull() },
)

/**
 * A list's search, filters, and order, kept while the page is on the
 * back stack. [settled] is [query] once typing pauses, trimmed; it's what
 * goes to the server.
 */
@Stable
class TitleListState internal constructor(
    sort: MutableState<String>,
    order: MutableState<String>,
    filters: MutableState<TitleFilters>,
    query: MutableState<String>,
    settled: MutableState<String>,
) {
    var sort by sort
    var order by order
    var filters by filters
    var query by query
    var settled by settled
        internal set

    /** What the list's pages are kept under: one set per search, filters, and order. */
    val key get() = "$sort-$order-$settled-${MatineeJson.encodeToString(TitleFilters.serializer(), filters)}"
}

/** A list's state as [TitleListState], starting in [initialSort], or by name. */
@Composable
fun rememberTitleListState(initialSort: String? = null): TitleListState {
    val start = initialSort?.takeIf { it in TitleSort.all } ?: TitleSort.NAME
    val sort = rememberSaveable { mutableStateOf(start) }
    val order = rememberSaveable { mutableStateOf(usual(start)) }
    val filters = rememberSaveable(stateSaver = FiltersSaver) { mutableStateOf(NO_TITLE_FILTERS) }
    val query = rememberSaveable { mutableStateOf("") }
    // Waits for a pause in typing before asking the server.
    val settled = rememberSaveable { mutableStateOf("") }
    LaunchedEffect(query.value) {
        delay(LIBRARY_SEARCH_DEBOUNCE_MS)
        settled.value = query.value.trim()
    }
    return remember { TitleListState(sort, order, filters, query, settled) }
}

/** What each filter offers for the titles in a scope, from the server. */
@Composable
fun rememberFilterOptions(libraryId: String? = null, kind: String? = null, genre: String? = null, studio: String? = null): Loader<TitleFilterOptions> =
    rememberLoader("title-filter-options-$libraryId-$kind-$genre-$studio") { titles.filterOptions(libraryId, kind, genre, studio) }

/** How many filters are on, a range counting once. */
fun TitleFilters.count(): Int =
    genres.orEmpty().size + studios.orEmpty().size +
        listOf(
            yearFrom != null || yearTo != null,
            scoreMin != null || scoreMax != null,
            movieRating != null,
            showRating != null,
            language != null,
            runtimeMin != null || runtimeMax != null,
            watched != null,
        ).count { it }

private fun watchWord(state: String) = when (state) {
    WatchFilter.UNWATCHED -> R.string.web_filters_watch_unwatched
    WatchFilter.IN_PROGRESS -> R.string.web_filters_watch_inProgress
    else -> R.string.web_filters_watch_watched
}

/** The filters in use as chips, each taking its own off. A range is one chip; so is each genre and studio. */
fun activeTitleFilters(filters: TitleFilters, options: TitleFilterOptions?, res: Resources, change: (TitleFilters) -> Unit): List<ActiveFilter> {
    val active = mutableListOf<ActiveFilter>()
    filters.watched?.let { state ->
        active += ActiveFilter("watched", res.getString(watchWord(state))) { change(filters.copy(watched = null)) }
    }
    val genres = filters.genres.orEmpty()
    genres.forEach { name -> active += ActiveFilter("genre-$name", name) { change(filters.copy(genres = genres - name)) } }
    val studios = filters.studios.orEmpty()
    studios.forEach { name -> active += ActiveFilter("studio-$name", name) { change(filters.copy(studios = studios - name)) } }
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
    // With one kind of title, "Rated up to"; with both, which kind.
    val both = (options?.ratings?.size ?: 0) > 1
    filters.movieRating?.let { limit ->
        val label = res.getString(if (both) R.string.web_filters_chip_movieRating else R.string.web_filters_chip_rating, limit.rating)
        active += ActiveFilter("movieRating", label) { change(filters.copy(movieRating = null)) }
    }
    filters.showRating?.let { limit ->
        val label = res.getString(if (both) R.string.web_filters_chip_showRating else R.string.web_filters_chip_rating, limit.rating)
        active += ActiveFilter("showRating", label) { change(filters.copy(showRating = null)) }
    }
    filters.language?.let { language ->
        active += ActiveFilter("language", languageName(language)) { change(filters.copy(language = null)) }
    }
    if (filters.runtimeMin != null || filters.runtimeMax != null) {
        active += ActiveFilter("runtime", rangeText(filters.runtimeMin?.toDouble(), filters.runtimeMax?.toDouble(), { runtimeText(it, res) }, "", RUNTIME_CHIP_WORDS, res)) {
            change(filters.copy(runtimeMin = null, runtimeMax = null))
        }
    }
    return active
}

/**
 * What a card says under its name: the year, with the score or the
 * runtime before it while the list is ordered by that, as the web's and
 * Discover's cards do.
 */
fun titleCardDetail(title: TitleSummary, sort: String, res: Resources): String? {
    val year = title.year?.toString()
    val score = title.rating
    if (sort == TitleSort.SCORE && score != null) {
        return year?.let { res.getString(R.string.web_filters_card_score, formatRating(score), it) }
            ?: res.getString(R.string.web_filters_card_scoreOnly, formatRating(score))
    }
    val runtime = if (sort == TitleSort.RUNTIME) formatRuntime(title.runtimeMinutes, res) else null
    if (runtime != null) {
        return year?.let { res.getString(R.string.web_filters_card_runtime, runtime, it) }
            ?: res.getString(R.string.web_filters_card_runtimeOnly, runtime)
    }
    return year
}

/** The sort in the bar's menu: each sort the list has values for, both ways. */
@Composable
fun TitleSortButton(state: TitleListState, options: TitleFilterOptions?) {
    var open by remember { mutableStateOf(false) }
    val offered = TITLE_ORDERS.filter { options == null || it.sort in options.sorts }
    val current = TITLE_ORDERS.firstOrNull { it.sort == state.sort && it.order == state.order }
    Box {
        RoundIconButton(
            Lucide.ArrowUpDown,
            current?.let { stringResource(R.string.browse_sort_current, stringResource(it.label)) } ?: stringResource(R.string.library_sort),
            { open = true },
            size = 48.dp,
            iconSize = 22.dp,
            background = Color.Transparent,
        )
        Menu(expanded = open, onDismissRequest = { open = false }) {
            offered.forEach { choice ->
                MenuItem(stringResource(choice.label), selected = choice == current, onClick = {
                    open = false
                    state.sort = choice.sort
                    state.order = choice.order
                })
            }
        }
    }
}

private fun FilterRange.span() = FilterSpan(min, max, step)

/**
 * A list's filters in the sheet Discover's browse has. [kind] is the
 * kind of every title in the list, if they're all one, for what runtime
 * means.
 */
@Composable
fun TitleFilterSheet(
    kind: String?,
    options: TitleFilterOptions,
    filters: TitleFilters,
    onChange: (TitleFilters) -> Unit,
    onDismiss: () -> Unit,
) {
    val res = LocalResources.current
    var choosingLanguage by remember { mutableStateOf(false) }
    FilterSheet(filters.count(), onClear = { onChange(NO_TITLE_FILTERS) }, onDismiss = onDismiss) {
        if (options.total > 0) {
            FilterSection(stringResource(R.string.web_filters_progress)) {
                ChoiceChips(
                    listOf(
                        FilterChoice(WatchFilter.UNWATCHED, res.getString(watchWord(WatchFilter.UNWATCHED)), options.watched.unwatched),
                        FilterChoice(WatchFilter.IN_PROGRESS, res.getString(watchWord(WatchFilter.IN_PROGRESS)), options.watched.inProgress),
                        FilterChoice(WatchFilter.WATCHED, res.getString(watchWord(WatchFilter.WATCHED)), options.watched.watched),
                    ),
                    filters.watched,
                ) { onChange(filters.copy(watched = it)) }
            }
        }
        if (options.genres.isNotEmpty()) {
            FilterSection(stringResource(R.string.web_filters_genres)) {
                ToggleChips(
                    options.genres.map { FilterChoice(it.name, it.name, it.titleCount) },
                    filters.genres.orEmpty(),
                    { onChange(filters.copy(genres = it)) },
                )
            }
        }
        if (options.studios.isNotEmpty()) {
            FilterSection(stringResource(R.string.web_filters_studios)) {
                ToggleChips(
                    options.studios.map { FilterChoice(it.name, it.name, it.titleCount) },
                    filters.studios.orEmpty(),
                    { onChange(filters.copy(studios = it)) },
                    limit = STUDIOS_SHOWN,
                    findPlaceholder = R.string.web_filters_findStudio,
                    noMatch = R.string.web_filters_noStudio,
                )
            }
        }
        options.years?.let { years ->
            RangeField(
                stringResource(R.string.web_filters_years),
                null,
                years.span(),
                filters.yearFrom?.toDouble(),
                filters.yearTo?.toDouble(),
                { low, high -> rangeText(low, high, ::yearText, res.getString(R.string.web_filters_anyYear), YEAR_WORDS, res) },
            ) { low, high -> onChange(filters.copy(yearFrom = low?.roundToInt(), yearTo = high?.roundToInt())) }
        }
        options.scores?.let { scores ->
            RangeField(
                stringResource(R.string.web_filters_score),
                stringResource(R.string.web_filters_scoreHint),
                scores.span(),
                filters.scoreMin,
                filters.scoreMax,
                { low, high -> rangeText(low, high, ::formatRating, res.getString(R.string.web_filters_anyScore), PANEL_WORDS, res) },
            ) { low, high -> onChange(filters.copy(scoreMin = low, scoreMax = high)) }
        }
        val ratings = options.ratings
        if (ratings.isNotEmpty()) {
            val only = ratings.singleOrNull()
            FilterSection(
                stringResource(R.string.web_filters_rating),
                if (only != null) {
                    stringResource(R.string.web_filters_ratingHint, countryName(only.country, res))
                } else {
                    stringResource(R.string.web_filters_ratingHintBoth)
                },
            ) {
                if (only != null) {
                    RatingChips(only, filters, onChange)
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        ratings.forEach { system ->
                            FilterSection(
                                res.getString(
                                    if (system.kind == TitleKind.SHOW) R.string.web_filters_ratingRow_show else R.string.web_filters_ratingRow_movie,
                                    countryName(system.country, res),
                                ),
                                small = true,
                            ) { RatingChips(system, filters, onChange) }
                        }
                    }
                }
            }
        }
        if (options.languages.size > 1) {
            FilterSection(stringResource(R.string.web_filters_language)) {
                OptionRow(filters.language?.let(::languageName) ?: stringResource(R.string.web_filters_anyLanguage)) { choosingLanguage = true }
            }
        }
        options.runtime?.let { runtime ->
            RangeField(
                stringResource(R.string.web_filters_runtime),
                // A show's runtime is an episode's.
                stringResource(
                    when (kind) {
                        TitleKind.SHOW -> R.string.web_filters_runtimeHint_show
                        TitleKind.MOVIE -> R.string.web_filters_runtimeHint_movie
                        else -> R.string.web_filters_runtimeHint_both
                    },
                ),
                runtime.span(),
                filters.runtimeMin?.toDouble(),
                filters.runtimeMax?.toDouble(),
                { low, high -> rangeText(low, high, { runtimeText(it, res) }, res.getString(R.string.web_filters_anyLength), PANEL_WORDS, res) },
            ) { low, high -> onChange(filters.copy(runtimeMin = low?.roundToInt(), runtimeMax = high?.roundToInt())) }
        }
    }
    if (choosingLanguage) {
        OptionSheet(
            stringResource(R.string.web_filters_language),
            stringResource(R.string.web_filters_anyLanguage),
            R.string.browse_find_language,
            options.languages.map { FilterChoice(it.language, languageName(it.language), it.titleCount) },
            filters.language,
            onPick = {
                choosingLanguage = false
                onChange(filters.copy(language = it))
            },
            onDismiss = { choosingLanguage = false },
        )
    }
}

/** One kind's ratings as "up to" chips, "Any" first. */
@Composable
private fun RatingChips(system: RatingSystem, filters: TitleFilters, onChange: (TitleFilters) -> Unit) {
    val current = if (system.kind == TitleKind.SHOW) filters.showRating else filters.movieRating
    ChoiceChips(system.ratings.map { FilterChoice(it.rating, it.rating) }, current?.rating) { rating ->
        val limit = rating?.let { AgeLimit(system.country, it) }
        onChange(if (system.kind == TitleKind.SHOW) filters.copy(showRating = limit) else filters.copy(movieRating = limit))
    }
}
