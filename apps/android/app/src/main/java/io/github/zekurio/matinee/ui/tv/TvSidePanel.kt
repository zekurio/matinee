package io.github.zekurio.matinee.ui.tv

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.flow.first

/** The size of every right-edge panel on a TV, the player's too. */
object TvPanels {
    val Width: Dp = 380.dp

    /** Between the panel's edges and its rows. */
    val ListPadding: Dp = 24.dp

    /** Where the panel's heading starts, in line with its rows' text. */
    val TextStart: Dp = ListPadding + TvListItems.Inset
}

/** How many panels are open, so the shell can take the clock away from under them. */
@Stable
class TvOpenPanels {
    var count by mutableIntStateOf(0)
        internal set
}

val LocalTvOpenPanels = staticCompositionLocalOf<TvOpenPanels?> { null }

/** D-pad moves, which stay in an open panel; focus asked for in code still leaves it. */
private val TRAPPED = setOf(FocusDirection.Left, FocusDirection.Right, FocusDirection.Up, FocusDirection.Down, FocusDirection.Next, FocusDirection.Previous)

/**
 * The panel at the right edge of a TV screen, for a choice or a question:
 * a card's actions, a sort, a setting, the player's menus. While [open] it
 * slides in over the dimmed screen with [title] and [description] at its
 * top and [content] as a list of rows, usually [TvListItem]s. Focus goes
 * to [initial], or the first row, and stays in the panel; Back calls
 * [onBack]. Once it closes, [returnFocus] puts focus back, as a rule on
 * what opened it.
 *
 * Put it last in a box that fills the screen, so it draws over the rest.
 * Keep what [content] shows while it slides away. [initialIndex] is the
 * row [initial] is on, which the list scrolls to if it's out of sight. A
 * new [focusKey] while open, like the panel turning to another question,
 * focuses [initial] again. While [loading], a spinner in place of the rows.
 */
@Composable
fun TvSidePanel(
    open: Boolean,
    title: String?,
    onBack: () -> Unit,
    returnFocus: () -> Unit,
    modifier: Modifier = Modifier,
    description: String? = null,
    initial: FocusRequester? = null,
    initialIndex: Int = 0,
    focusKey: Any? = null,
    loading: Boolean = false,
    content: LazyListScope.() -> Unit,
) {
    BackHandler(enabled = open, onBack = onBack)
    val isOpen by rememberUpdatedState(open)
    val restore by rememberUpdatedState(returnFocus)
    val counter = LocalTvOpenPanels.current
    DisposableEffect(open, counter) {
        if (open && counter != null) counter.count++
        onDispose { if (open && counter != null) counter.count-- }
    }
    var wasOpen by remember { mutableStateOf(false) }
    LaunchedEffect(open) {
        if (open) {
            wasOpen = true
        } else if (wasOpen) {
            wasOpen = false
            restore()
        }
    }
    Box(modifier.fillMaxSize()) {
        AnimatedVisibility(open, Modifier.matchParentSize(), enter = fadeIn(Motion.enter()), exit = fadeOut(Motion.exit())) {
            Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(0f to Scrim.copy(alpha = 0.35f), 1f to Scrim.copy(alpha = 0.85f))))
        }
        AnimatedVisibility(
            open,
            Modifier.align(Alignment.CenterEnd).fillMaxHeight(),
            enter = slideInHorizontally(Motion.slide()) { it } + fadeIn(Motion.enter()),
            exit = slideOutHorizontally(Motion.exit()) { it } + fadeOut(Motion.exit()),
        ) {
            val fallback = remember { FocusRequester() }
            val list = rememberLazyListState()
            Column(
                Modifier
                    .width(TvPanels.Width)
                    .fillMaxHeight()
                    .background(Palette.Raised)
                    .focusProperties { onExit = { if (isOpen && requestedFocusDirection in TRAPPED) cancelFocusChange() } }
                    .focusGroup()
                    .padding(top = Overscan.Vertical + 16.dp),
            ) {
                if (title != null) {
                    Text(
                        title,
                        style = TvType.Headline,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(start = TvPanels.TextStart, end = TvPanels.TextStart).semantics { heading() },
                    )
                }
                if (description != null) {
                    Text(
                        description,
                        style = TvType.Body,
                        color = Palette.Muted,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(start = TvPanels.TextStart, end = TvPanels.TextStart, top = 6.dp),
                    )
                }
                if (loading) {
                    Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.TopCenter) {
                        CircularProgressIndicator(color = Palette.Muted, strokeWidth = 3.dp, modifier = Modifier.size(28.dp))
                    }
                } else {
                    LazyColumn(
                        Modifier.focusRequester(fallback).focusGroup(),
                        state = list,
                        contentPadding = PaddingValues(
                            start = TvPanels.ListPadding,
                            end = TvPanels.ListPadding,
                            top = 20.dp,
                            bottom = Overscan.Vertical + 16.dp,
                        ),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                        content = content,
                    )
                }
            }
            val window = LocalWindowInfo.current
            LaunchedEffect(open, focusKey, loading) {
                if (!open || loading) return@LaunchedEffect
                // Focus asked for before the window has it doesn't stick; once composed, it's placed a frame on.
                snapshotFlow { window.isWindowFocused }.first { it }
                withFrameNanos { }
                // A choice below what the list shows scrolls into view first; a short list keeps its top.
                val info = list.layoutInfo
                val shown = info.visibleItemsInfo.any { it.index == initialIndex && it.offset + it.size <= info.viewportEndOffset }
                if (initial != null && !shown) {
                    list.scrollToItem((initialIndex - 3).coerceAtLeast(0))
                    withFrameNanos { }
                }
                val landed = initial != null && runCatching { initial.requestFocus() }.getOrDefault(false)
                if (!landed) runCatching { fallback.requestFocus() }
            }
        }
    }
}

/** What the screen behind an open panel dims to. */
private val Scrim = Color.Black

/**
 * A choice among [options] in a [TvSidePanel], the [current] one checked
 * and focused first. Picking one calls [onClose] and then [onPick], if
 * it's another; Back calls [onClose].
 */
@Composable
fun <T> TvPickerPanel(
    open: Boolean,
    title: String,
    options: List<Pair<T, String>>,
    current: T,
    onPick: (T) -> Unit,
    onClose: () -> Unit,
    returnFocus: () -> Unit,
    description: String? = null,
) {
    val picked = remember { FocusRequester() }
    val currentIndex = options.indexOfFirst { it.first == current }
    TvSidePanel(
        open,
        title,
        onBack = onClose,
        returnFocus = returnFocus,
        description = description,
        initial = picked.takeIf { currentIndex >= 0 },
        initialIndex = currentIndex.coerceAtLeast(0),
    ) {
        itemsIndexed(options) { index, (value, label) ->
            TvListItem(
                label,
                onClick = {
                    onClose()
                    if (value != current) onPick(value)
                },
                modifier = if (index == currentIndex) Modifier.focusRequester(picked) else Modifier,
                quiet = true,
                checked = value == current,
            )
        }
    }
}
