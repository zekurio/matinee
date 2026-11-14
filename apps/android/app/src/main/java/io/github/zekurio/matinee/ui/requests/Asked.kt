package io.github.zekurio.matinee.ui.requests

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.CatalogInput
import io.github.zekurio.matinee.api.RequestItem
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.RefreshOnResume
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.components.CardText
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.PosterArt
import io.github.zekurio.matinee.ui.components.Rail
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.kit.ButtonLook
import io.github.zekurio.matinee.ui.kit.Chip
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.MatineeButton
import io.github.zekurio.matinee.ui.kit.Spinner
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/*
 * What the viewer asked for: Home's "Asked for" rail, the profile's, and
 * the whole list behind both, as the web's asked.tsx.
 */

/** What the viewer asked for, newest first: on its way and lately come or answered, or all of it. */
private const val IN_PROGRESS = "inProgress"
private const val ALL = "all"

/** The titles of a list of requests, for one stream that follows them all. */
fun askedInputs(items: List<RequestItem>): List<CatalogInput> = items.map { CatalogInput(it.title.ref, it.library.id) }

/**
 * One title the viewer asked for, as its state stands: the catalog card
 * while it isn't here, then the library's card, with the accent dot while
 * [fresh]. A show that's partly here and still waits for a season is the
 * library's poster with that season's state.
 */
@Composable
fun AskedCard(item: RequestItem, fresh: Boolean, modifier: Modifier = Modifier) {
    val hub = LocalRequests.current
    val nav = LocalNavigator.current
    val api = LocalApi.current
    val res = LocalResources.current
    val entry = hub.live[item.title.ref.key]
    val availability = entry?.availability ?: item.availability
    val here = availability.libraryTitleId?.takeIf { availability.state == AvailabilityState.HERE }
    // Already here when the list loaded: the library's card at once.
    val hereAtFirst = remember { item.availability.state == AvailabilityState.HERE }
    val pending = item.season?.let { season -> entry?.seasons?.firstOrNull { it.number == season.number } ?: season }
    if (here != null && pending != null && pending.state != AvailabilityState.HERE) {
        val seasonState = pending.asTitle()
        val line = nextSeasonLine(pending.number, seasonState, res)
        Column(modifier) {
            Box(Modifier.cardTap({ nav.title(here) }, label = "${item.title.name}, $line")) {
                PosterArt(item.title.name, api.art(item.title.poster))
                CatalogBadge(seasonState, Modifier.align(Alignment.TopEnd).padding(6.dp))
            }
            CardText(item.title.name, line)
        }
        return
    }
    CatalogCard(item.title, modifier, hereAtFirst = hereAtFirst, fresh = fresh)
}

/** Why a declined title isn't coming, under its card in the full list. */
@Composable
private fun DeclinedNote(item: RequestItem) {
    val res = LocalResources.current
    val availability = LocalRequests.current.availability(item.title.ref, item.availability)
    val reason = availability.reason ?: return
    if (availability.state != AvailabilityState.UNAVAILABLE) return
    Column(Modifier.padding(top = 4.dp)) {
        Text(declineText(reason, res), style = MaterialTheme.typography.bodySmall, color = Palette.Muted, maxLines = 2)
        reason.note?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, fontStyle = FontStyle.Italic, color = Palette.Foreground.copy(alpha = 0.7f), maxLines = 2)
        }
    }
}

/**
 * Home's "Asked for": what's on its way, and what came or was answered
 * in the last three days. Nothing when there's none of either, so Home
 * stays about what's here. The heading opens the whole list.
 */
@Composable
fun HomeAskedRail() {
    val nav = LocalNavigator.current
    val mine = rememberLoader("asked-home") { requests.mine(limit = 24, filter = IN_PROGRESS) }
    ReloadOnAsk(mine)
    RefreshOnResume(mine)
    val items = (mine.state as? Load.Ready)?.value?.items.orEmpty()
    FollowTitles(askedInputs(items))
    if (items.isEmpty()) return
    // A new ask at the front starts the row there again, rather than keeping the old first card in view.
    key(items.first().id) {
        Rail(stringResource(R.string.web_ask_mine_title), onTitleClick = nav::asked) {
            items(items, key = { it.id }) { item -> AskedCard(item, fresh = true, Modifier.width(railItemWidth(RailArt.Poster))) }
        }
    }
}

/**
 * The profile's "Asked for", only on the viewer's own: the latest of
 * everything they asked for. Its heading opens the whole list.
 */
@Composable
fun ProfileAskedRail(modifier: Modifier = Modifier) {
    val nav = LocalNavigator.current
    val mine = rememberLoader("asked-profile") { requests.mine(limit = 24, filter = ALL) }
    ReloadOnAsk(mine)
    RefreshOnResume(mine)
    val items = (mine.state as? Load.Ready)?.value?.items.orEmpty()
    FollowTitles(askedInputs(items))
    if (items.isEmpty()) return
    key(items.first().id) {
        Rail(stringResource(R.string.web_ask_mine_title), modifier, onTitleClick = nav::asked) {
            items(items, key = { it.id }) { item -> AskedCard(item, fresh = false, Modifier.width(railItemWidth(RailArt.Poster))) }
        }
    }
}

/** A page of the whole list, loading more as it scrolls. */
private class AskedPages {
    val items = mutableStateListOf<RequestItem>()
    var cursor by mutableStateOf<String?>(null)
    var done by mutableStateOf(false)
    var loading by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
}

/**
 * Everything the viewer asked for, newest first, with "In progress" and
 * "All". Declined titles say why.
 */
@Composable
fun AskedScreen() {
    val api = LocalApi.current
    val hub = LocalRequests.current
    var filter by rememberSaveable { mutableStateOf(IN_PROGRESS) }
    val pages = remember(filter, hub.version) { AskedPages() }
    val scope = rememberCoroutineScope()
    val more = {
        if (!pages.loading && !pages.done) {
            pages.loading = true
            scope.launch {
                try {
                    val page = api.requests.mine(cursor = pages.cursor, limit = 40, filter = filter)
                    pages.items.addAll(page.items.filter { new -> pages.items.none { it.id == new.id } })
                    pages.cursor = page.nextCursor
                    pages.done = page.nextCursor == null
                    pages.error = null
                } catch (e: CancellationException) {
                    throw e
                } catch (e: IOException) {
                    pages.error = e.message ?: ""
                } finally {
                    pages.loading = false
                }
            }
        }
    }
    LaunchedEffect(pages) { more() }
    FollowTitles(askedInputs(pages.items.take(100)))
    Column(Modifier.fillMaxSize()) {
        TopBar(stringResource(R.string.web_ask_mine_title))
        Row(Modifier.padding(horizontal = Gutter).padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Chip(stringResource(R.string.web_ask_mine_inProgress), filter == IN_PROGRESS, { filter = IN_PROGRESS })
            Chip(stringResource(R.string.web_ask_mine_all), filter == ALL, { filter = ALL })
        }
        val error = pages.error
        when {
            error != null && pages.items.isEmpty() ->
                ErrorBox(stringResource(R.string.web_ask_mine_error, error), null, { more() })
            !pages.done && pages.items.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Spinner(size = 32.dp, color = Palette.Accent)
            }
            pages.done && pages.items.isEmpty() -> Column(
                Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                LucideIcon(Lucide.Clock, null, size = 28.dp, tint = Palette.Muted)
                Gap(12.dp)
                Text(
                    stringResource(if (filter == IN_PROGRESS) R.string.web_ask_mine_emptyInProgress else R.string.web_ask_mine_empty),
                    style = MaterialTheme.typography.titleMedium,
                )
                if (filter != IN_PROGRESS) {
                    Gap(4.dp)
                    Text(
                        stringResource(R.string.web_ask_mine_emptyHint),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Palette.Muted,
                        textAlign = TextAlign.Center,
                    )
                }
            }
            else -> LazyVerticalGrid(
                columns = GridCells.Adaptive(150.dp),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = Gutter, end = Gutter, bottom = 32.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                items(pages.items, key = { it.id }) { item ->
                    Column {
                        AskedCard(item, fresh = false)
                        DeclinedNote(item)
                    }
                }
                if (!pages.done) {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "more") {
                        LaunchedEffect(pages.items.size) { if (pages.error == null) more() }
                        Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                            if (pages.error != null) {
                                MatineeButton(onClick = { more() }, look = ButtonLook.Outline) { Text(stringResource(R.string.common_retry)) }
                            } else {
                                Spinner(size = 32.dp, color = Palette.Accent)
                            }
                        }
                    }
                }
                item(span = { GridItemSpan(maxLineSpan) }, key = "bottom") { Box(Modifier.navigationBarsPadding()) }
            }
        }
    }
}
