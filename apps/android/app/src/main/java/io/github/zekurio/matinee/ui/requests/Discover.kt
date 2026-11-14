package io.github.zekurio.matinee.ui.requests

import android.content.res.Resources
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
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.CatalogInput
import io.github.zekurio.matinee.api.CatalogPage
import io.github.zekurio.matinee.api.CatalogTitleSummary
import io.github.zekurio.matinee.api.DiscoverRail
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Rail
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.kit.ButtonLook
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
 * Discover, for when there's nothing in mind yet: on a phone, rows of
 * titles under the search field until something's typed, as the web's
 * phone has them, and each row's whole list behind its heading. Nothing
 * of it shows when the server says Discover is off.
 */

/** How many cards a row shows. Its heading leads to the rest. */
private const val RAIL_CARDS = 20

/** "Because you watched Dune", "Popular movies". */
fun railName(rail: DiscoverRail, res: Resources): String = when (rail.id) {
    "becauseWatched" -> res.getString(R.string.web_discover_rail_becauseWatched, rail.seedName.orEmpty())
    "popularFilms" -> res.getString(R.string.web_discover_rail_popularFilms)
    "popularShows" -> res.getString(R.string.web_discover_rail_popularShows)
    "comingSoon" -> res.getString(R.string.web_discover_rail_comingSoon)
    else -> res.getString(R.string.web_discover_rail_othersAsked)
}

/** Coming soon says when, where other rows say the year: "14 Aug · Movie". */
fun releaseLine(rail: String, item: CatalogTitleSummary, res: Resources): String? {
    if (rail != "comingSoon") return null
    val day = parseDay(item.availability.releaseDate) ?: return null
    return res.getString(R.string.web_discover_card_release, formatShortDay(day, res), kindWord(item.ref.kind, res))
}

/** Whether Discover is on for this viewer and its rows, kept by the search tab. */
@Composable
fun rememberDiscover(): Loader<io.github.zekurio.matinee.api.DiscoverRails> = rememberLoader("discover-rails") { discover.rails() }

/**
 * Discover's rows in the order the server sends them, each loading on its
 * own, for the search tab's list. Rows whose titles are all here already
 * leave nothing to show and stay out. One that failed says so in its place.
 */
fun LazyListScope.discoverRails(rails: List<DiscoverRail>, pages: Map<String, Loader<CatalogPage>>) {
    rails.forEach { rail ->
        val page = pages[rail.id] ?: return@forEach
        item(key = "discover-${rail.id}") { DiscoverRow(rail, page) }
    }
}

/** The first page of each of [rails], kept while the search tab is. */
@Composable
fun rememberRailPages(rails: List<DiscoverRail>): Map<String, Loader<CatalogPage>> =
    rails.associate { rail -> rail.id to rememberLoader("discover-${rail.id}-${rail.seed?.key}") { discover.page(rail, 1) } }

/** Follows the titles the rows show, once each, under the stream's hundred. */
@Composable
fun FollowRails(pages: Collection<Loader<CatalogPage>>) {
    val refs = pages.flatMap { (it.state as? Load.Ready)?.value?.items?.take(RAIL_CARDS).orEmpty() }
        .map { CatalogInput(it.ref) }
    FollowTitles(refs)
}

@Composable
private fun DiscoverRow(rail: DiscoverRail, page: Loader<CatalogPage>) {
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val title = railName(rail, res)
    when (val state = page.state) {
        Load.Loading -> io.github.zekurio.matinee.ui.home.RailSkeleton(title, RailArt.Poster)
        is Load.Failed -> RailFailed(title, page::reload)
        is Load.Ready -> {
            val items = state.value.items.take(RAIL_CARDS)
            if (items.isEmpty()) return
            // The popular rows' headings open browsing that kind, as the web's do.
            Rail(
                title,
                onTitleClick = {
                    when (rail.id) {
                        "popularFilms" -> nav.catalogBrowse(TitleKind.MOVIE)
                        "popularShows" -> nav.catalogBrowse(TitleKind.SHOW)
                        else -> nav.discoverRail(rail.id)
                    }
                },
            ) {
                items(items, key = { it.ref.key }) { item ->
                    CatalogCard(item, Modifier.width(railItemWidth(RailArt.Poster)), detail = releaseLine(rail.id, item, res))
                }
            }
        }
    }
}

/** A row under its heading whose cards didn't load, with a retry. */
@Composable
fun RailFailed(title: String, onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        io.github.zekurio.matinee.ui.components.SectionTitle(title, Modifier.padding(horizontal = Gutter))
        Gap(12.dp)
        Row(Modifier.padding(horizontal = Gutter), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(stringResource(R.string.web_discover_railFailed), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted, modifier = Modifier.weight(1f))
            MatineeButton(onClick = onRetry, look = ButtonLook.Outline, height = 36.dp) {
                LucideIcon(Lucide.RotateCw, null, size = 16.dp)
                Text(stringResource(R.string.web_discover_retry))
            }
        }
    }
}

/** Discover's whole answer couldn't be had: the catalog is down and nothing was kept. */
@Composable
fun DiscoverFailed(onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        LucideIcon(Lucide.CloudOff, null, size = 28.dp, tint = Palette.Muted)
        Gap(12.dp)
        Text(stringResource(R.string.web_discover_failed), style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Gap(4.dp)
        Text(stringResource(R.string.web_discover_failedHint), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted, textAlign = TextAlign.Center)
        Gap(16.dp)
        MatineeButton(onClick = onRetry, look = ButtonLook.Outline) {
            LucideIcon(Lucide.RotateCw, null, size = 16.dp)
            Text(stringResource(R.string.web_discover_retry))
        }
    }
}

/** Every row came back without a title this viewer lacks. */
@Composable
fun DiscoverNothing() {
    Column(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        LucideIcon(Lucide.Compass, null, size = 28.dp, tint = Palette.Muted)
        Gap(12.dp)
        Text(stringResource(R.string.web_discover_empty), style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Gap(4.dp)
        Text(stringResource(R.string.web_discover_emptyHint), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted, textAlign = TextAlign.Center)
    }
}

/** Cards in a block of the grid the stream follows. */
private const val BLOCK = 12

/** Blocks followed at once: the ones on screen and one either side. */
private const val MOST_BLOCKS = 6

/** A row's whole list, a page at a time. */
private class RailPages {
    val items = mutableStateListOf<CatalogTitleSummary>()
    var next by mutableStateOf<Int?>(1)
    var loading by mutableStateOf(false)
    var error by mutableStateOf(false)
    var stale by mutableStateOf(false)
}

/**
 * One of Discover's rows in full, as a grid that loads more as it
 * scrolls. It follows only the cards around the screen, in blocks, since
 * the stream takes a hundred titles and a row can hold more.
 */
@Composable
fun DiscoverRailScreen(id: String) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val rails = rememberDiscover()
    val answer = (rails.state as? Load.Ready)?.value
    val rail = answer?.takeIf { it.enabled }?.rails?.firstOrNull { it.id == id }
    Column(Modifier.fillMaxSize()) {
        TopBar(rail?.let { railName(it, res) } ?: stringResource(R.string.web_discover_title))
        when {
            rails.state is Load.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Spinner(size = 32.dp, color = Palette.Accent) }
            rails.state is Load.Failed -> DiscoverFailed(rails::reload)
            rail == null -> Column(Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                LucideIcon(Lucide.Compass, null, size = 28.dp, tint = Palette.Muted)
                Gap(12.dp)
                Text(stringResource(R.string.web_discover_gone), style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
                Gap(16.dp)
                MatineeButton(onClick = nav::search, look = ButtonLook.Outline) { Text(stringResource(R.string.web_discover_back)) }
            }
            else -> RailGrid(rail, api)
        }
    }
}

@Composable
private fun RailGrid(rail: DiscoverRail, api: io.github.zekurio.matinee.api.MatineeApi) {
    val res = LocalResources.current
    val pages = remember(rail) { RailPages() }
    val scope = rememberCoroutineScope()
    val more = {
        val page = pages.next
        if (!pages.loading && page != null) {
            pages.loading = true
            scope.launch {
                try {
                    val answer = api.discover.page(rail, page)
                    pages.items.addAll(answer.items.filter { new -> pages.items.none { it.ref.key == new.ref.key } })
                    pages.next = answer.nextPage
                    pages.stale = pages.stale || answer.stale
                    pages.error = false
                } catch (e: CancellationException) {
                    throw e
                } catch (_: IOException) {
                    pages.error = true
                } finally {
                    pages.loading = false
                }
            }
        }
    }
    val grid = rememberLazyGridState()
    val nearEnd by remember {
        derivedStateOf {
            val last = grid.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= grid.layoutInfo.totalItemsCount - 12
        }
    }
    LaunchedEffect(nearEnd, pages.items.size) { if (nearEnd && !pages.error) more() }
    // The blocks around what's on screen, which move only when the screen leaves them.
    val window by remember {
        derivedStateOf {
            val shown = grid.layoutInfo.visibleItemsInfo.map { it.index }
            val first = (shown.minOrNull() ?: 0) / BLOCK
            val last = (shown.maxOrNull() ?: 0) / BLOCK
            val from = maxOf(0, first - 1)
            val to = minOf(last + 1, from + MOST_BLOCKS - 1)
            from * BLOCK to (to + 1) * BLOCK
        }
    }
    val followed = pages.items.toList().let { list -> list.subList(minOf(window.first, list.size), minOf(window.second, list.size)) }
    FollowTitles(followed.map { CatalogInput(it.ref) })
    // The first page on its own, so the grid opens at its top rather than kept on the spinner's place.
    if (pages.items.isEmpty()) {
        LaunchedEffect(Unit) { more() }
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            if (pages.error) DiscoverFailed { more() } else Spinner(size = 32.dp, color = Palette.Accent)
        }
        return
    }
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
                Text(stringResource(R.string.web_discover_stale), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
            }
        }
        itemsIndexed(pages.items, key = { _, item -> item.ref.key }) { _, item ->
            CatalogCard(item, detail = releaseLine(rail.id, item, res))
        }
        item(span = { GridItemSpan(maxLineSpan) }, key = "end") {
            Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                when {
                    pages.loading -> Spinner(size = 32.dp, color = Palette.Accent)
                    pages.error -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(stringResource(R.string.web_discover_moreFailed), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                        Gap(8.dp)
                        MatineeButton(onClick = { more() }, look = ButtonLook.Outline) { Text(stringResource(R.string.web_discover_retry)) }
                    }
                    pages.next == null && pages.items.isNotEmpty() ->
                        Text(stringResource(R.string.web_discover_end), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                }
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }, key = "bottom") { Box(Modifier.navigationBarsPadding()) }
    }
}
