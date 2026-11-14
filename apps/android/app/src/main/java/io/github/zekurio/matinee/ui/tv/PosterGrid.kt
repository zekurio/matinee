package io.github.zekurio.matinee.ui.tv

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.gestures.BringIntoViewSpec
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec
import androidx.compose.foundation.gestures.snapping.SnapLayoutInfoProvider
import androidx.compose.foundation.gestures.snapping.SnapPosition
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.input.InputMode
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalInputModeManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.browse.TitlePages
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.Spinner
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.home.FocusedItem

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

    /** Where a grid page's header starts, under the top overscan. */
    val Top: Dp = Overscan.Vertical + 6.dp

    /** Between the header and the line that names the focused card. */
    val LineGap: Dp = 18.dp

    /** Clear of the clock at the top right, for the line while the header is away. */
    val ClockRoom: Dp = 140.dp
}

/**
 * Cards in columns across a TV page, from [TvPage.Start] to [TvPage.End],
 * under the page's [header]. Left from the first column goes to the drawer.
 *
 * The header shows while focus is in the first row or above it, and
 * collapses when focus goes below, so the grid has the screen to itself;
 * it comes back when focus returns to the first row. Wholphin does the
 * same. After a click or a drag, which put the TV in touch mode, it
 * shows while the first row is in view instead. [line] stays: it's the
 * line that names the focused card, for grids whose cards have no
 * caption, under the header or at the top while the header is away.
 *
 * A focused card that's already in full view doesn't move the grid.
 * One that isn't scrolls the grid by whole rows, so no row is ever left
 * cut off at the top; a fling of the pointer stops at a row too.
 *
 * A page gives it the page's [memory]: each card is remembered under
 * [TvGrid.ROW] by [key], so coming back from a title, or Down from the
 * header, lands on the card it left. Call [TvFocusMemory.Restore] with
 * `TvGrid.ROW to key(first)` as the fallback for focus to start on the
 * first card. [card] draws an item; pass its `focus` modifier to what
 * takes focus, as with `TvPosterCard(..., modifier = focus.fillMaxWidth())`,
 * which fills the column. [onNearEnd] runs while the last few rows are in
 * view, to load the next page. [scrollKey] changing, as when the sort
 * does, scrolls back to the top. [footer] goes after the cards, spanning
 * the width, for a spinner or a notice.
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
    columns: GridCells = GridCells.Fixed(TvGrid.COLUMNS),
    header: @Composable () -> Unit = {},
    line: (@Composable () -> Unit)? = null,
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
        val nearEnd by remember {
            derivedStateOf {
                val info = state.layoutInfo
                val last = info.visibleItemsInfo.lastOrNull()?.index ?: 0
                last >= info.totalItemsCount - info.maxSpan * 3
            }
        }
        LaunchedEffect(nearEnd, items.size) { if (nearEnd) onNearEnd() }
    }

    // The row of the card that had focus last; -1 while the header has it.
    var focusRow by rememberSaveable { mutableIntStateOf(0) }
    val input = LocalInputModeManager.current
    val shown by remember {
        derivedStateOf {
            if (input.inputMode == InputMode.Touch) state.firstRowInView() else focusRow < 1
        }
    }
    val density = LocalDensity.current
    // Where the grid starts, which is lower by the header while it shows.
    var gridTop by remember { mutableFloatStateOf(0f) }
    val spec = remember(state, density) {
        with(density) {
            val collapsed = (TvGrid.Top + TvFocusLineHeight).toPx()
            RowSpec(state, edge = TvGrid.Inset.toPx(), room = { (gridTop - collapsed).coerceAtLeast(0f) })
        }
    }
    val snap = rememberSnapFlingBehavior(remember(state) { SnapLayoutInfoProvider(state, SnapPosition.Start) })

    GridFrame(shown, header, line, Modifier.onFocusChanged { if (it.hasFocus) focusRow = -1 }) {
        BoxWithConstraints(modifier.weight(1f).onGloballyPositioned { gridTop = it.positionInParent().y }) {
            // Room after the last row, so any row can scroll up to the top.
            val end = with(density) {
                val cell = state.layoutInfo.visibleItemsInfo.firstOrNull()?.size?.height?.toDp() ?: 0.dp
                (maxHeight - TvGrid.Inset - cell).coerceAtLeast(48.dp)
            }
            CompositionLocalProvider(LocalBringIntoViewSpec provides spec) {
                LazyVerticalGrid(
                    columns = columns,
                    state = state,
                    modifier = with(memory) { Modifier.row(TvGrid.ROW) }
                        .fillMaxSize()
                        .padding(start = TvPage.Start - TvGrid.Inset)
                        .fadeTop(TvGrid.Fade),
                    contentPadding = PaddingValues(start = TvGrid.Inset, end = TvPage.End, top = TvGrid.Inset, bottom = end),
                    flingBehavior = snap,
                    horizontalArrangement = Arrangement.spacedBy(TvGrid.Gap),
                    verticalArrangement = Arrangement.spacedBy(TvGrid.RowGap),
                ) {
                    itemsIndexed(items, key = { _, item -> key(item) }) { index, item ->
                        val focus = with(memory) { Modifier.item(TvGrid.ROW, key(item)) }.onFocusChanged {
                            if (it.hasFocus) focusRow = state.rowOf(index)
                        }
                        card(item, focus)
                    }
                    footer()
                }
            }
        }
    }
}

/**
 * Whether any of the first row shows below the grid's top padding. The
 * focused card stays laid out after a drag takes it away, so being laid
 * out isn't enough.
 */
private fun LazyGridState.firstRowInView(): Boolean =
    layoutInfo.visibleItemsInfo.isEmpty() || layoutInfo.visibleItemsInfo.any { it.row == 0 && it.offset.y + it.size.height > 0 }

/** The row the card at [index] is in. Focus can reach a card before it's laid out, so this doesn't ask the layout where it is. */
private fun LazyGridState.rowOf(index: Int): Int = index / layoutInfo.maxSpan.coerceAtLeast(1)

/** A grid page's [header], collapsing while not [shown], then its [line] and the [grid]. [headerModifier] goes on the header. */
@Composable
private fun GridFrame(
    shown: Boolean,
    header: @Composable () -> Unit,
    line: (@Composable () -> Unit)?,
    headerModifier: Modifier = Modifier,
    grid: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        AnimatedVisibility(
            shown,
            enter = expandVertically(Motion.enter(), expandFrom = Alignment.Top) + fadeIn(Motion.enter()),
            exit = shrinkVertically(Motion.exit(), shrinkTowards = Alignment.Top) + fadeOut(Motion.exit()),
        ) {
            Box(headerModifier.fillMaxWidth().padding(top = TvGrid.Top)) { header() }
        }
        // Without the header, the line has the top to itself, clear of the clock; a grid with no line keeps the room.
        val top by animateDpAsState(if (shown) TvGrid.LineGap else TvGrid.Top, Motion.enter(), label = "gridLine")
        val end by animateDpAsState(if (shown) TvPage.End else TvPage.End + TvGrid.ClockRoom, Motion.enter(), label = "gridLineEnd")
        if (line != null || !shown) {
            Box(Modifier.padding(start = TvPage.Start, end = end, top = if (line != null) top else TvGrid.Top).height(TvFocusLineHeight)) {
                line?.invoke()
            }
        }
        grid()
    }
}

/**
 * Scrolls a grid of rows the same height by whole rows: a focused card
 * in full view stays where it is, and one that isn't comes in with as
 * many rows above it as fit, every one of them whole. [edge] is the room
 * kept at the top and bottom, the grid's top padding. [room] is what the
 * grid is about to gain at the bottom, as a header collapses for a card
 * below the first row in view.
 */
@OptIn(ExperimentalFoundationApi::class)
private class RowSpec(private val state: LazyGridState, private val edge: Float, private val room: () -> Float) : BringIntoViewSpec {
    override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float {
        val info = state.layoutInfo
        val cell = info.visibleItemsInfo.firstOrNull()?.size?.height?.toFloat() ?: size
        val pitch = cell + info.mainAxisItemSpacing
        val height = maxOf(size, cell)
        val bottom = containerSize - edge + if (offset > edge + 1f) room() else 0f
        // How far the card sits below the top row's place, in rows, and whether it's on a row's line.
        val rows = (offset - edge) / pitch
        val aligned = rows - kotlin.math.floor(rows + 0.01f) < 0.02f
        if (offset >= edge - 1f && offset + height <= bottom + 1f && aligned) return 0f
        if (offset < edge) return offset - edge
        // The most rows that fit above it, with the card in full view.
        val above = kotlin.math.floor((bottom - edge - height) / pitch).toInt().coerceIn(0, kotlin.math.floor(rows + 0.01f).toInt())
        return offset - (edge + above * pitch)
    }
}

/** Fades the top [fade] of what's drawn, so a row scrolled half away ends softly rather than in a hard line. */
fun Modifier.fadeTop(fade: Dp): Modifier = this
    .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
    .drawWithContent {
        drawContent()
        drawRect(Brush.verticalGradient(0f to Color.Transparent, 1f to Color.Black, startY = 0f, endY = fade.toPx()), blendMode = BlendMode.DstIn)
    }

/**
 * A [TitlePages] list as a [TvPosterGrid] of posters under [header], with
 * the focused poster's name and facts on the line between, loading the
 * next page as focus nears the end. While the first page loads it shows
 * a spinner; when that fails, why, with a way to try again; with no
 * titles, [empty]. [onFocus] hears of each title as it takes focus, for
 * [focused] and the backdrop. Selecting a poster opens its title.
 */
@Composable
fun TvTitleGrid(
    pages: TitlePages,
    memory: TvFocusMemory,
    empty: String,
    focused: FocusedItem?,
    onFocus: (TitleSummary) -> Unit,
    header: @Composable () -> Unit,
    scrollKey: Any? = null,
) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val viewer = LocalContext.current.app.viewer
    val error = pages.error
    val line: @Composable () -> Unit = { TvFocusLine(focused) }
    // One grid whatever the state, so the header stays put and keeps focus while a new sort or filter loads.
    val none = pages.items.isEmpty()
    TvPosterGrid(
        pages.items,
        key = { it.id },
        memory = memory,
        header = header,
        line = line,
        onNearEnd = pages::more,
        scrollKey = scrollKey,
        footer = {
            when {
                error != null -> item(span = { GridItemSpan(maxLineSpan) }, key = "failed") {
                    GridNotice(
                        stringResource(if (none) R.string.tv_grid_failed else R.string.tv_grid_more_failed),
                        error,
                        pages::more,
                        top = if (none) NOTICE_TOP else 8.dp,
                    )
                }
                none && pages.done -> item(span = { GridItemSpan(maxLineSpan) }, key = "empty") {
                    GridNotice(empty, null, null, top = NOTICE_TOP)
                }
                none || pages.loading -> item(span = { GridItemSpan(maxLineSpan) }, key = "loading") {
                    Box(
                        Modifier.fillMaxWidth().padding(top = if (none) SPINNER_TOP else 16.dp, bottom = 16.dp),
                        contentAlignment = if (none) Alignment.TopCenter else Alignment.Center,
                    ) {
                        Spinner(size = if (none) 32.dp else 28.dp, color = Palette.Muted)
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

/** Below the grid's own top room, where a notice or the spinner stands in for the first row. */
private val NOTICE_TOP = 28.dp
private val SPINNER_TOP = 76.dp

/** In the grid, spanning it: why it's empty, with a way to try again where there is one. */
@Composable
private fun GridNotice(headline: String, message: String?, onRetry: (() -> Unit)?, top: Dp) {
    Column(Modifier.fillMaxWidth().padding(top = top)) {
        Text(headline, style = TvType.Title, color = Palette.Foreground.copy(alpha = 0.9f))
        if (message != null) Text(message, style = TvType.Body, color = Palette.Muted, modifier = Modifier.padding(top = 6.dp))
        if (onRetry != null) {
            TvButton(stringResource(R.string.common_retry), onRetry, Modifier.padding(top = 20.dp), icon = Lucide.RefreshCw)
        }
    }
}
