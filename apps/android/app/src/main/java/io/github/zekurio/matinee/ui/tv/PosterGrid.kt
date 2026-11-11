package io.github.zekurio.matinee.ui.tv

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.gestures.BringIntoViewSpec
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.browse.TitlePages
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.theme.Palette

/** The TV's poster grid, for a 960x540dp screen. */
object TvGrid {
    /** Columns across a page's width: posters a little narrower than a row's, so more show at once. */
    const val COLUMNS = 7
    val Gap: Dp = 18.dp
    val RowGap: Dp = 24.dp

    /** Room above the top row and beside the outer columns, for the focus ring and the card's growth. */
    val Inset: Dp = 20.dp

    /** How far down the grid's top edge fades in. */
    val Fade: Dp = 12.dp

    /** The key [TvPosterGrid] gives its cards in a page's [TvFocusMemory]. */
    const val ROW = "grid"
}

/**
 * Cards in a fixed number of columns across a TV page, from [TvPage.Start]
 * to [TvPage.End], that scrolls so the focused row always sits at the top
 * of the grid; holding Down moves the page one row at a time. Left from the
 * first column goes to the drawer.
 *
 * A page puts it under its header and gives it the page's [memory]: each
 * card is remembered under [TvGrid.ROW] by [key], so coming back from a
 * title, or Down from the header, lands on the card it left. Call
 * [TvFocusMemory.Restore] with `TvGrid.ROW to key(first)` as the fallback
 * for focus to start on the first card. [card] draws an item; pass its
 * `focus` modifier to what takes focus, as with
 * `TvPosterCard(..., modifier = focus.fillMaxWidth())`, which fills the
 * column. [onNearEnd] runs while the last few rows are in view, to load
 * the next page. [scrollKey] changing, as when the sort does, scrolls back
 * to the top. [footer] goes after the cards, spanning the width, for a
 * spinner or a notice.
 *
 * For a [TitlePages] list, [TvTitleGrid] does all this with posters.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun <T> TvPosterGrid(
    items: List<T>,
    key: (T) -> String,
    memory: TvFocusMemory,
    modifier: Modifier = Modifier,
    columns: Int = TvGrid.COLUMNS,
    onNearEnd: (() -> Unit)? = null,
    scrollKey: Any? = null,
    footer: LazyGridScope.() -> Unit = {},
    card: @Composable (item: T, focus: Modifier) -> Unit,
) {
    val state = rememberLazyGridState()
    // Saved, so the same key coming back with the page doesn't scroll it.
    var scrolledFor by rememberSaveable { mutableStateOf(scrollKey?.toString()) }
    LaunchedEffect(scrollKey) {
        val now = scrollKey?.toString()
        if (now != scrolledFor) {
            scrolledFor = now
            state.scrollToItem(0)
        }
    }
    if (onNearEnd != null) {
        val nearEnd by remember(columns) {
            derivedStateOf {
                val last = state.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
                last >= state.layoutInfo.totalItemsCount - columns * 3
            }
        }
        LaunchedEffect(nearEnd, items.size) { if (nearEnd) onNearEnd() }
    }
    val pivot = with(LocalDensity.current) { TvGrid.Inset.toPx() }
    val spec = remember(pivot) {
        object : BringIntoViewSpec {
            override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float = offset - pivot
        }
    }
    CompositionLocalProvider(LocalBringIntoViewSpec provides spec) {
        LazyVerticalGrid(
            columns = GridCells.Fixed(columns),
            state = state,
            modifier = with(memory) { modifier.row(TvGrid.ROW) }
                .fillMaxSize()
                .padding(start = TvPage.Start - TvGrid.Inset)
                // A row scrolled half away fades out at the top rather than ending in a hard line.
                .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
                .drawWithContent {
                    drawContent()
                    drawRect(Brush.verticalGradient(0f to Color.Transparent, 1f to Color.Black, startY = 0f, endY = TvGrid.Fade.toPx()), blendMode = BlendMode.DstIn)
                },
            contentPadding = PaddingValues(start = TvGrid.Inset, end = TvPage.End, top = TvGrid.Inset, bottom = 48.dp),
            horizontalArrangement = Arrangement.spacedBy(TvGrid.Gap),
            verticalArrangement = Arrangement.spacedBy(TvGrid.RowGap),
        ) {
            items(items, key = key) { item ->
                card(item, with(memory) { Modifier.item(TvGrid.ROW, key(item)) })
            }
            footer()
        }
    }
}

/**
 * A [TitlePages] list as a [TvPosterGrid] of posters, loading the next page
 * as focus nears the end. While the first page loads it shows a spinner;
 * when that fails, why, with a way to try again; with no titles, [empty].
 * [onFocus] hears of each title as it takes focus, for the page's header
 * and backdrop. Selecting a poster opens its title.
 */
@Composable
fun TvTitleGrid(
    pages: TitlePages,
    memory: TvFocusMemory,
    empty: String,
    onFocus: (TitleSummary) -> Unit,
    modifier: Modifier = Modifier,
    scrollKey: Any? = null,
) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val viewer = LocalContext.current.app.viewer
    val error = pages.error
    when {
        pages.items.isEmpty() && error != null -> GridNotice(stringResource(R.string.tv_grid_failed), error, pages::more, modifier)
        pages.items.isEmpty() && pages.done -> GridNotice(empty, null, null, modifier)
        pages.items.isEmpty() -> Box(modifier.fillMaxSize().padding(top = 96.dp), contentAlignment = Alignment.TopCenter) {
            CircularProgressIndicator(color = Palette.Muted, strokeWidth = 3.dp, modifier = Modifier.size(32.dp))
        }
        else -> TvPosterGrid(
            pages.items,
            key = { it.id },
            memory = memory,
            modifier = modifier,
            onNearEnd = pages::more,
            scrollKey = scrollKey,
            footer = {
                when {
                    error != null -> item(span = { GridItemSpan(maxLineSpan) }, key = "more-failed") {
                        GridNotice(stringResource(R.string.tv_grid_more_failed), error, pages::more, Modifier, inGrid = true)
                    }
                    pages.loading -> item(span = { GridItemSpan(maxLineSpan) }, key = "loading") {
                        Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = Palette.Muted, strokeWidth = 3.dp, modifier = Modifier.size(28.dp))
                        }
                    }
                }
            },
        ) { title, focus ->
            TvPosterCard(
                title.name,
                api.art(title.images.poster),
                onClick = { nav.title(title) },
                watched = viewer.isWatched(title),
                modifier = focus.fillMaxWidth().onFocusChanged { if (it.isFocused) onFocus(title) },
            )
        }
    }
}

/** Where the grid would be: why it's empty, with a way to try again where there is one. */
@Composable
private fun GridNotice(headline: String, message: String?, onRetry: (() -> Unit)?, modifier: Modifier, inGrid: Boolean = false) {
    Column(
        modifier
            .fillMaxWidth()
            .padding(start = if (inGrid) 0.dp else TvPage.Start, end = if (inGrid) 0.dp else TvPage.End, top = if (inGrid) 8.dp else 48.dp),
    ) {
        Text(headline, style = TvType.Title, color = Palette.Foreground.copy(alpha = 0.9f))
        if (message != null) Text(message, style = TvType.Body, color = Palette.Muted, modifier = Modifier.padding(top = 6.dp))
        if (onRetry != null) {
            TvButton(onRetry, Modifier.padding(top = 20.dp)) {
                LucideIcon(Lucide.RefreshCw, null, size = 18.dp)
                Text(stringResource(R.string.common_retry))
            }
        }
    }
}
