package io.github.zekurio.matinee.ui.tv.detail

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.gestures.BringIntoViewSpec
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.Season
import io.github.zekurio.matinee.api.Title
import io.github.zekurio.matinee.api.summary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.components.LocalActions
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.launchShowing
import io.github.zekurio.matinee.ui.episodeNumber
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.Spinner
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.timeLeft
import io.github.zekurio.matinee.ui.title.episodeFacts
import io.github.zekurio.matinee.ui.title.isResuming
import io.github.zekurio.matinee.ui.title.rememberSeasonItems
import io.github.zekurio.matinee.ui.title.seasonNext
import io.github.zekurio.matinee.ui.title.seasonWatched
import io.github.zekurio.matinee.ui.title.setSeasonWatched
import io.github.zekurio.matinee.ui.tv.Overscan
import io.github.zekurio.matinee.ui.tv.ShowBackdrop
import io.github.zekurio.matinee.ui.tv.TvButton
import io.github.zekurio.matinee.ui.tv.TvCards
import io.github.zekurio.matinee.ui.tv.TvChip
import io.github.zekurio.matinee.ui.tv.TvFocusMemory
import io.github.zekurio.matinee.ui.tv.TvIconButton
import io.github.zekurio.matinee.ui.tv.TvPage
import io.github.zekurio.matinee.ui.tv.TvType
import io.github.zekurio.matinee.ui.tv.rememberTvFocusMemory

/** A season's page on a TV. [season] null is the files without a season number. */
@Composable
fun TvSeasonScreen(titleId: String, season: Int?) {
    val loader = rememberLoader("title-$titleId") { titles.get(titleId) }
    // The season on screen, which the tabs change without leaving the page.
    var shown by rememberSaveable { mutableStateOf(season ?: NO_SEASON) }
    DetailState(loader.state, stringResource(R.string.title_season_show_error), loader::reload) { title ->
        val current = title.seasons.firstOrNull { (it.number ?: NO_SEASON) == shown }
        if (current == null) {
            DetailMessage(stringResource(R.string.title_season_missing, title.name), null, null)
        } else {
            SeasonPage(title, current) { shown = it.number ?: NO_SEASON }
        }
    }
}

private const val NO_SEASON = -1

/**
 * The season over its show's backdrop: the show's name, the season, or
 * tabs for every season of a show with more than one, how many episodes
 * it has and are watched, and Play with the marks. Below, its episodes in
 * a row, with what the focused one is about above them. Focus starts on
 * the episode Play would start.
 */
@Composable
private fun SeasonPage(title: Title, season: Season, onSeason: (Season) -> Unit) {
    val api = LocalApi.current
    val res = LocalResources.current
    val viewer = LocalContext.current.app.viewer
    val memory = rememberTvFocusMemory()
    val items = rememberSeasonItems(title.id, season.number)
    val list = (items.state as? Load.Ready)?.value
    val next = seasonNext(list, viewer)
    val row = "episodes-${season.number ?: NO_SEASON}"
    // Read again until the episodes load, so it names the card once there is one.
    val start by rememberUpdatedState(next?.let { row to it.id })
    memory.Restore { start }
    ShowBackdrop(listOfNotNull(api.art(title.images.backdrop, ArtworkSize.Large)))
    var focused by remember(season.number) { mutableStateOf<MediaItem?>(null) }

    Column(Modifier.fillMaxSize().padding(top = HEADER_TOP)) {
        Column(Modifier.padding(start = TvPage.Start, end = TvPage.End)) {
            Text(title.name, style = TvType.Title, color = Palette.Foreground.copy(alpha = 0.9f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (title.seasons.size > 1) {
                SeasonTabs(title, season, memory, onSeason, Modifier.padding(top = 10.dp))
            } else {
                Text(seasonName(season.number, res), style = TvType.Hero, maxLines = 1, modifier = Modifier.padding(top = 2.dp))
            }
            Text(
                listOf(
                    res.getQuantityString(R.plurals.media_episode_count, season.itemCount, season.itemCount),
                    res.getQuantityString(R.plurals.title_season_watched_count, season.watchedCount, season.watchedCount),
                ).joinToString("  ·  "),
                style = TvType.Facts,
                color = Palette.Foreground.copy(alpha = 0.85f),
                modifier = Modifier.padding(top = 6.dp),
            )
            SeasonButtons(title, season, list, memory, Modifier.padding(top = 18.dp))
        }
        Box(Modifier.weight(1f))
        // What the focused episode is about; with focus above, the one Play starts.
        // The time left in the episode Play resumes is on the button, so not here.
        val about = focused ?: next
        EpisodeAbout(about, left = about?.id != next?.id, modifier = Modifier.padding(start = TvPage.Start, end = TvPage.End))
        when (val state = items.state) {
            Load.Loading -> Box(Modifier.fillMaxWidth().height(ROW_HEIGHT), contentAlignment = Alignment.Center) {
                Spinner(size = 32.dp, color = Palette.Muted)
            }
            is Load.Failed -> Text(
                stringResource(R.string.title_episodes_error, state.message),
                style = TvType.Body,
                color = Palette.Muted,
                modifier = Modifier.height(ROW_HEIGHT).padding(start = TvPage.Start, end = TvPage.End, top = 24.dp),
            )
            is Load.Ready -> EpisodeRow(state.value, row, memory) { focused = it }
        }
    }
}

/** The row of episodes: cards and their names, from under the drawer's rail to the screen's edge. */
private val ROW_HEIGHT = 200.dp

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun EpisodeRow(list: List<MediaItem>, row: String, memory: TvFocusMemory, onFocus: (MediaItem) -> Unit) {
    val density = LocalDensity.current
    val inset = 20.dp
    val spec = remember(density) {
        val start = with(density) { inset.toPx() }
        val end = with(density) { (TvPage.End + inset).toPx() }
        object : BringIntoViewSpec {
            override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float {
                val trailing = offset + size
                return when {
                    offset < start -> offset - start
                    trailing > containerSize - end -> trailing - (containerSize - end)
                    else -> 0f
                }
            }
        }
    }
    CompositionLocalProvider(LocalBringIntoViewSpec provides spec) {
        LazyRow(
            with(memory) { Modifier.row(row) }.fillMaxWidth().height(ROW_HEIGHT).padding(start = TvPage.Start - inset),
            state = rememberLazyListState(),
            contentPadding = PaddingValues(start = inset, end = TvPage.End, top = TvCards.TitleGap, bottom = Overscan.Vertical),
            horizontalArrangement = Arrangement.spacedBy(TvCards.Gap),
        ) {
            items(list, key = { it.id }) { item ->
                EpisodeCard(item, row, memory, Modifier.onFocusChanged { if (it.hasFocus) onFocus(item) }, detail = false)
            }
        }
    }
}

/** An episode's number and name, facts, and the start of its overview, above the row. [left] adds the time left in it. */
@Composable
private fun EpisodeAbout(item: MediaItem?, left: Boolean, modifier: Modifier = Modifier) {
    val res = LocalResources.current
    val viewer = LocalContext.current.app.viewer
    Column(modifier.height(ABOUT_HEIGHT), verticalArrangement = Arrangement.Bottom) {
        if (item == null) return@Column
        val label = itemLabel(item, res)
        val number = episodeNumber(item, res)
        Text(
            if (number != null && !label.untitled) stringResource(R.string.title_episodes_coded_name, number, label.title) else label.title,
            style = TvType.Title,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        val facts = episodeFacts(item, viewer, res, left)
        if (facts.isNotEmpty()) Text(facts.joinToString("  ·  "), style = TvType.Caption, color = Palette.Muted, maxLines = 1)
        item.episode?.overview?.let {
            Text(
                it,
                style = TvType.Body,
                color = Palette.Foreground.copy(alpha = 0.78f),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.width(HEADER_TEXT_WIDTH + 120.dp).padding(top = 4.dp),
            )
        }
    }
}

private val ABOUT_HEIGHT = 100.dp

/**
 * Play the season's next episode, or resume it with the time left, then
 * the season's watched mark, its favorite, and the show. The files
 * without a season number aren't a season to mark, so they get no heart.
 */
@Composable
private fun SeasonButtons(title: Title, season: Season, list: List<MediaItem>?, memory: TvFocusMemory, modifier: Modifier = Modifier) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val actions = LocalActions.current
    val snackbar = LocalSnackbar.current
    val viewer = LocalContext.current.app.viewer
    val scope = rememberCoroutineScope()
    val summary = title.summary
    val next = seasonNext(list, viewer)
    val resume = isResuming(next)
    val watched = seasonWatched(list, viewer)
    val favorite = viewer.isFavorite(summary, season)
    val watchedFailure = stringResource(if (watched) R.string.media_mark_unwatched_failed else R.string.media_mark_watched_failed)
    val favoriteFailure = stringResource(R.string.media_favorite_failed)
    val name = "${title.name} · ${seasonName(season.number, res)}"
    Row(with(memory) { modifier.row(ACTIONS) }, horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
        TvButton(
            stringResource(if (resume) R.string.title_resume else R.string.title_play),
            icon = Lucide.Play,
            onClick = { next?.let { nav.play(it.id) } },
            modifier = with(memory) { Modifier.item(ACTIONS, PLAY) }.widthIn(min = 180.dp),
            detail = if (resume) next?.let { timeLeft(it, res) } else null,
            enabled = next != null,
        )
        TvIconButton(
            if (watched) Lucide.CircleCheck else Lucide.Check,
            stringResource(if (watched) R.string.media_mark_unwatched else R.string.media_mark_watched),
            {
                if (watched) scope.launchShowing(snackbar, watchedFailure) { setSeasonWatched(api, viewer, summary, season.number, false, null) }
                else actions.askWatched(name) { at -> setSeasonWatched(api, viewer, summary, season.number, true, at) }
            },
            with(memory) { Modifier.item(ACTIONS, WATCHED) },
            tint = if (watched) Palette.Accent else Palette.Foreground,
        )
        if (season.number != null) TvIconButton(
            if (favorite) Lucide.HeartFilled else Lucide.Heart,
            stringResource(if (favorite) R.string.media_remove_favorite else R.string.media_add_favorite),
            { scope.launchShowing(snackbar, favoriteFailure) { viewer.setFavorite(api, summary, season, !favorite) } },
            with(memory) { Modifier.item(ACTIONS, "favorite") },
            tint = if (favorite) Palette.Danger else Palette.Foreground,
        )
        TvIconButton(
            Lucide.Tv,
            stringResource(R.string.actions_go_to_show, title.name),
            { nav.titleUp(title.id) },
            with(memory) { Modifier.item(ACTIONS, "show") },
        )
    }
}

/** Every season of the show as a tab; Select shows that season's episodes here. */
@Composable
private fun SeasonTabs(title: Title, current: Season, memory: TvFocusMemory, onSeason: (Season) -> Unit, modifier: Modifier = Modifier) {
    val res = LocalResources.current
    Row(with(memory) { modifier.row(TABS) }, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        title.seasons.forEach { season ->
            val key = (season.number ?: NO_SEASON).toString()
            TvChip(
                seasonName(season.number, res),
                { onSeason(season) },
                with(memory) { Modifier.item(TABS, key) },
                selected = season.number == current.number,
                role = Role.Tab,
            )
        }
    }
}

private const val TABS = "tabs"
