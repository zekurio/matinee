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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CircularProgressIndicator
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
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.RefreshOnResume
import io.github.zekurio.matinee.ui.components.ImageSource
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.landscape
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.media.rememberFavorites
import io.github.zekurio.matinee.ui.progressRatio
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
import io.github.zekurio.matinee.ui.tv.home.FocusedItem
import io.github.zekurio.matinee.ui.tv.home.itemInfo
import io.github.zekurio.matinee.ui.tv.rememberTvFocusMemory
import io.github.zekurio.matinee.ui.tv.titleInfo

private const val TITLES = "titles"
private const val EPISODES = "episodes"
private const val EMPTY = "empty"

/** Above the focused card in the rows: the list's top padding, a row's heading, and the gap under it. */
private val ROW_PIVOT = 8.dp + 26.dp + TvCards.TitleGap

/**
 * The person's favorites on a TV, split as the phone splits them: the
 * titles as a row of posters, the episodes as a row of stills, with the
 * focused one's name, facts, and overview at the top and its backdrop
 * behind the page.
 */
@Composable
fun TvFavoritesScreen() {
    val api = LocalApi.current
    val res = LocalResources.current
    val nav = LocalNavigator.current
    val viewer = LocalContext.current.app.viewer
    val favorites = rememberFavorites()
    // Back from a title that was taken off, or from another device's changes.
    RefreshOnResume(favorites.titles, favorites.items)
    val memory = rememberTvFocusMemory()
    var focused by remember { mutableStateOf<FocusedItem?>(null) }
    var backdrop by remember { mutableStateOf(emptyList<ImageSource>()) }
    val titles = favorites.titles(viewer)
    val episodes = favorites.episodes(viewer)
    val failed = favorites.titles.state as? Load.Failed
    memory.Restore {
        // Read here, not from the values above: Restore keeps its first lambda.
        val loaded = favorites.titles(viewer)
        val loadedEpisodes = favorites.episodes(viewer)
        when {
            favorites.titles.state is Load.Failed -> EMPTY to EMPTY
            loaded == null -> null
            loaded.isNotEmpty() -> TITLES to loaded.first().id
            loadedEpisodes.isNotEmpty() -> EPISODES to loadedEpisodes.first().id
            // The episodes may still be on their way.
            favorites.items.state is Load.Loading -> null
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
            ) { favorites.titles.reload() }
            titles == null -> Box(Modifier.fillMaxWidth().padding(top = 48.dp), contentAlignment = Alignment.TopCenter) {
                CircularProgressIndicator(color = Palette.Muted, strokeWidth = 3.dp, modifier = Modifier.size(32.dp))
            }
            titles.isEmpty() && episodes.isEmpty() -> Notice(
                stringResource(R.string.favorites_empty),
                stringResource(R.string.tv_favorites_empty_hint),
                Lucide.House,
                stringResource(R.string.tab_home),
                with(memory) { Modifier.item(EMPTY, EMPTY) },
                glyph = Lucide.Heart,
            ) { nav.home() }
            else -> PinnedRows(ROW_PIVOT) {
                LazyColumn(
                    Modifier.fillMaxSize(),
                    state = rememberLazyListState(),
                    contentPadding = PaddingValues(top = 8.dp, bottom = 320.dp),
                    verticalArrangement = Arrangement.spacedBy(28.dp),
                ) {
                    if (titles.isNotEmpty()) {
                        item(key = TITLES) {
                            TvRow(stringResource(R.string.favorites_titles), TITLES, memory) {
                                items(titles, key = { it.id }) { title ->
                                    TvPosterCard(
                                        title.name,
                                        api.art(title.images.poster),
                                        onClick = { nav.title(title) },
                                        watched = viewer.isWatched(title),
                                        modifier = with(memory) { Modifier.item(TITLES, title.id) }
                                            .onFocusChanged { if (it.isFocused) onFocus(titleInfo(title, api, res, kind = true)) },
                                    )
                                }
                            }
                        }
                    }
                    if (episodes.isNotEmpty()) {
                        item(key = EPISODES) {
                            TvRow(stringResource(R.string.favorites_episodes), EPISODES, memory) {
                                items(episodes, key = { it.id }) { item ->
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
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

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
        TvButton(onAction, focus.padding(top = 28.dp)) {
            LucideIcon(icon, null, size = 18.dp)
            Text(action)
        }
    }
}
