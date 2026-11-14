package io.github.zekurio.matinee.ui.tv.browse

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.FavoriteSeason
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.RefreshOnResume
import io.github.zekurio.matinee.ui.components.ActionTarget
import io.github.zekurio.matinee.ui.components.ImageSource
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.landscape
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.Spinner
import io.github.zekurio.matinee.ui.media.isEmpty
import io.github.zekurio.matinee.ui.media.rememberFavorites
import io.github.zekurio.matinee.ui.progressRatio
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.timeLeft
import io.github.zekurio.matinee.ui.tv.Overscan
import io.github.zekurio.matinee.ui.tv.PinnedRows
import io.github.zekurio.matinee.ui.tv.ShowBackdrop
import io.github.zekurio.matinee.ui.tv.TvButton
import io.github.zekurio.matinee.ui.tv.TvCards
import io.github.zekurio.matinee.ui.tv.TvFocusLine
import io.github.zekurio.matinee.ui.tv.TvLandscapeCard
import io.github.zekurio.matinee.ui.tv.TvPage
import io.github.zekurio.matinee.ui.tv.TvPosterCard
import io.github.zekurio.matinee.ui.tv.TvRow
import io.github.zekurio.matinee.ui.tv.TvType
import io.github.zekurio.matinee.ui.tv.fadeTop
import io.github.zekurio.matinee.ui.tv.home.FocusedItem
import io.github.zekurio.matinee.ui.tv.home.itemInfo
import io.github.zekurio.matinee.ui.tv.rememberPinnedRowsFling
import io.github.zekurio.matinee.ui.tv.rememberTvFocusMemory
import io.github.zekurio.matinee.ui.tv.seasonInfo
import io.github.zekurio.matinee.ui.tv.titleInfo

private const val SHOWS = "shows"
private const val SEASONS = "seasons"
private const val EPISODES = "episodes"
private const val MOVIES = "movies"
private const val EMPTY = "empty"

/** Above the focused card in the rows: the list's top padding, a row's heading, and the gap under it. */
private val ROW_PIVOT = 8.dp + TvCards.TitleHeight + TvCards.TitleGap

/**
 * The person's favorites on a TV, a row for each kind as the phone has
 * them: shows, seasons, and movies as posters, episodes as stills, each
 * row only when it has any. The focused one's name, facts, and overview
 * show at the top, and its backdrop behind the page.
 */
@Composable
fun TvFavoritesScreen() {
    val api = LocalApi.current
    val res = LocalResources.current
    val nav = LocalNavigator.current
    val viewer = LocalContext.current.app.viewer
    val favorites = rememberFavorites()
    // Back from a title that was taken off, or from another device's changes.
    RefreshOnResume(favorites.loader)
    val memory = rememberTvFocusMemory()
    var focused by remember { mutableStateOf<FocusedItem?>(null) }
    var backdrop by remember { mutableStateOf(emptyList<ImageSource>()) }
    val lists = favorites.lists(viewer)
    val failed = favorites.loader.state as? Load.Failed
    memory.Restore {
        // Read here, not from the values above: Restore keeps its first lambda.
        val loaded = favorites.lists(viewer)
        when {
            favorites.loader.state is Load.Failed -> EMPTY to EMPTY
            loaded == null -> null
            loaded.shows.isNotEmpty() -> SHOWS to loaded.shows.first().id
            loaded.seasons.isNotEmpty() -> SEASONS to seasonKey(loaded.seasons.first())
            loaded.episodes.isNotEmpty() -> EPISODES to loaded.episodes.first().id
            loaded.movies.isNotEmpty() -> MOVIES to loaded.movies.first().id
            else -> EMPTY to EMPTY
        }
    }
    ShowBackdrop(backdrop)
    val onFocus: (FocusedItem) -> Unit = {
        focused = it
        backdrop = it.backdrop
    }

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxWidth().padding(start = TvPage.Start, end = TvPage.End, top = Overscan.Vertical + 6.dp).height(HEADER_HEIGHT)) {
            Text(stringResource(R.string.favorites_title), style = TvType.Headline, maxLines = 1)
            TvFocusLine(focused, Modifier.padding(top = 14.dp, end = 120.dp))
            val overview = focused?.overview
            if (overview != null) {
                Text(
                    overview,
                    style = TvType.Body,
                    color = Palette.Foreground.copy(alpha = 0.75f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 6.dp).widthIn(max = 600.dp),
                )
            }
        }
        when {
            failed != null -> Notice(
                stringResource(R.string.favorites_load_failed),
                failed.message,
                Lucide.RefreshCw,
                stringResource(R.string.common_retry),
                with(memory) { Modifier.item(EMPTY, EMPTY) },
            ) { favorites.loader.reload() }
            lists == null -> Box(Modifier.fillMaxWidth().padding(top = 48.dp), contentAlignment = Alignment.TopCenter) {
                Spinner(size = 32.dp, color = Palette.Muted)
            }
            lists.isEmpty -> Notice(
                stringResource(R.string.favorites_empty),
                stringResource(R.string.tv_favorites_empty_hint),
                Lucide.House,
                stringResource(R.string.tab_home),
                with(memory) { Modifier.item(EMPTY, EMPTY) },
                glyph = Lucide.Heart,
            ) { nav.home() }
            else -> PinnedRows(ROW_PIVOT) {
                val rows = rememberLazyListState()
                // A movie or show as its poster, in the shows' or the movies' row.
                val titleRow: LazyListScope.(String, List<TitleSummary>) -> Unit = { row, titles ->
                    items(titles, key = { it.id }) { title ->
                        TvPosterCard(
                            title.name,
                            api.art(title.images.poster),
                            onClick = { nav.title(title) },
                            watched = viewer.isWatched(title),
                            menu = ActionTarget.Title(title, null, here = false),
                            modifier = with(memory) { Modifier.item(row, title.id) }
                                .onFocusChanged { if (it.isFocused) onFocus(titleInfo(title, api, res)) },
                        )
                    }
                }
                LazyColumn(
                    Modifier.fillMaxSize().fadeTop(8.dp),
                    state = rows,
                    flingBehavior = rememberPinnedRowsFling(rows),
                    contentPadding = PaddingValues(top = 8.dp, bottom = 320.dp),
                    verticalArrangement = Arrangement.spacedBy(28.dp),
                ) {
                    if (lists.shows.isNotEmpty()) {
                        item(key = SHOWS) {
                            TvRow(stringResource(R.string.favorites_shows), SHOWS, memory) { titleRow(SHOWS, lists.shows) }
                        }
                    }
                    if (lists.seasons.isNotEmpty()) {
                        item(key = SEASONS) {
                            TvRow(stringResource(R.string.favorites_seasons), SEASONS, memory) {
                                items(lists.seasons, key = ::seasonKey) { entry ->
                                    val (title, season) = entry
                                    TvPosterCard(
                                        res.getString(R.string.title_season_of, title.name, seasonName(season.number, res)),
                                        api.art(season.poster ?: title.images.poster),
                                        onClick = { nav.season(title.id, season.number) },
                                        watched = season.itemCount > 0 && season.watchedCount >= season.itemCount,
                                        menu = ActionTarget.Season(title, season, here = false),
                                        modifier = with(memory) { Modifier.item(SEASONS, seasonKey(entry)) }
                                            .onFocusChanged { if (it.isFocused) onFocus(seasonInfo(title, season, api, res)) },
                                    )
                                }
                            }
                        }
                    }
                    if (lists.episodes.isNotEmpty()) {
                        item(key = EPISODES) {
                            TvRow(stringResource(R.string.favorites_episodes), EPISODES, memory) {
                                items(lists.episodes, key = { it.id }) { item ->
                                    val label = itemLabel(item, res)
                                    val code = episodeCode(item, res)
                                    val left = if (item.progress?.completed == false) timeLeft(item, res) else null
                                    TvLandscapeCard(
                                        toneKey = label.showName,
                                        art = api.landscape(item),
                                        caption = label.showName,
                                        detail = listOfNotNull(code, left ?: label.year.takeIf { code == null }).joinToString(" · ").ifEmpty { null },
                                        onClick = { nav.item(item) },
                                        progress = progressRatio(item),
                                        watched = viewer.isWatched(item),
                                        focus = with(memory) { Modifier.item(EPISODES, item.id) }
                                            .onFocusChanged { if (it.isFocused) onFocus(itemInfo(item, api, res)) },
                                        menu = ActionTarget.Item(item, here = false),
                                    )
                                }
                            }
                        }
                    }
                    if (lists.movies.isNotEmpty()) {
                        item(key = MOVIES) {
                            TvRow(stringResource(R.string.favorites_movies), MOVIES, memory) { titleRow(MOVIES, lists.movies) }
                        }
                    }
                }
            }
        }
    }
}

/** A favorite season's card in [memory] and its row. */
private fun seasonKey(entry: FavoriteSeason) = "${entry.title.id}/${entry.season.number}"

/** The header's room above the rows, so the rows start in the same place whatever it says. */
private val HEADER_HEIGHT = 150.dp

/** In place of the rows: what's wrong or missing, and one thing to do about it. */
@Composable
private fun Notice(headline: String, detail: String?, icon: Int, action: String, focus: Modifier, glyph: Int? = null, onAction: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(start = TvPage.Start, end = TvPage.End, top = 24.dp)) {
        if (glyph != null) LucideIcon(glyph, null, size = 40.dp, tint = Palette.Muted)
        Text(headline, style = TvType.Headline, modifier = Modifier.padding(top = if (glyph != null) 18.dp else 0.dp))
        if (detail != null) {
            Text(detail, style = TvType.Body, color = Palette.Muted, modifier = Modifier.padding(top = 6.dp).widthIn(max = 560.dp))
        }
        TvButton(action, onAction, focus.padding(top = 28.dp), icon = icon)
    }
}
