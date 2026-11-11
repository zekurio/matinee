package io.github.zekurio.matinee.ui.tv

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first

/** How a focused thing on a TV stands out: it grows, lifts, and gets a ring clear of its edge. */
object TvFocus {
    const val SCALE = 1.06f
    val Ring = 3.dp
    val Gap = 3.dp
    val Lift = 16.dp
}

/**
 * The focus look for cards and buttons on a TV, from across a room. Put it
 * before the thing's `clip`, so the ring draws outside its [shape], and
 * give it the same [interaction] as the `clickable`.
 */
@Composable
fun Modifier.tvFocus(interaction: InteractionSource, shape: Shape, scale: Float = TvFocus.SCALE): Modifier {
    val focused by interaction.collectIsFocusedAsState()
    val shown by animateFloatAsState(if (focused) 1f else 0f, if (focused) Motion.enter() else Motion.exit(), label = "tvFocus")
    val ring = Palette.Foreground
    return this
        .graphicsLayer {
            val grow = 1f + (scale - 1f) * shown
            scaleX = grow
            scaleY = grow
            shadowElevation = TvFocus.Lift.toPx() * shown
            this.shape = shape
            clip = false
        }
        .drawWithContent {
            drawContent()
            if (shown > 0f) {
                val stroke = TvFocus.Ring.toPx()
                val out = TvFocus.Gap.toPx() + stroke / 2
                val outline = shape.createOutline(Size(size.width + out * 2, size.height + out * 2), layoutDirection, this)
                translate(-out, -out) {
                    drawOutline(outline, ring.copy(alpha = shown), style = Stroke(stroke))
                }
            }
        }
}

/**
 * Where focus was on a page, kept across leaving it: the row and card that
 * had it last, and the card each row had last. A row opened again by Up or
 * Down lands on its own card, and a page coming back focuses the card that
 * opened what was on top. Keys are the page's own, like an item's id.
 *
 * Use [rememberTvFocusMemory], mark each row with [row] and each card with
 * [item], and call [Restore] once with where to start the first time.
 */
@Stable
class TvFocusMemory internal constructor(lastRow: String?, lastItem: String?, rows: Map<String, String>) {
    var lastRow by mutableStateOf(lastRow)
        private set
    var lastItem by mutableStateOf(lastItem)
        private set
    internal val rowItems = HashMap(rows)
    private val requesters = mutableStateMapOf<Pair<String, String>, FocusRequester>()

    /** A row of cards: focus that comes in lands on the card it left. */
    fun Modifier.row(key: String): Modifier = focusProperties {
        onEnter = {
            val item = rowItems[key]
            val requester = item?.let { requesters[key to it] }
            if (requester != null) requester.requestFocus()
        }
    }

    /** A card in [row], remembered when it takes focus. */
    fun Modifier.item(row: String, key: String): Modifier = composed {
        val requester = androidx.compose.runtime.remember(row, key) { FocusRequester() }
        androidx.compose.runtime.DisposableEffect(row, key) {
            requesters[row to key] = requester
            onDispose { if (requesters[row to key] === requester) requesters.remove(row to key) }
        }
        focusRequester(requester).onFocusChanged {
            if (it.isFocused) {
                lastRow = row
                lastItem = key
                rowItems[row] = key
            }
        }
    }

    /**
     * Focus the card that had it last, or [fallback] the first time, once
     * it's on screen. [fallback] is read again until a card shows, so a page
     * still loading can name its first card when it has one.
     */
    @Composable
    fun Restore(fallback: () -> Pair<String, String>?) {
        // Back from the drawer, the card that had focus.
        val shell = LocalTvPageFocus.current
        androidx.compose.runtime.DisposableEffect(shell) {
            val restore = { focusLast() }
            shell?.restore = restore
            onDispose { if (shell?.restore === restore) shell.restore = null }
        }
        val window = androidx.compose.ui.platform.LocalWindowInfo.current
        LaunchedEffect(this) {
            // Focus asked for before the window has it, as the app starts, doesn't stick.
            snapshotFlow { window.isWindowFocused }.first { it }
            val requester = snapshotFlow {
                val saved = lastRow?.let { row -> lastItem?.let { requesters[row to it] } }
                saved ?: fallback()?.let { requesters[it] }
            }.filterNotNull().first()
            // Composed is not yet placed; one frame on, it can take focus.
            androidx.compose.runtime.withFrameNanos { }
            runCatching { requester.requestFocus() }
        }
    }

    /** Focus the card that had it last, if it's on screen. */
    fun focusLast(): Boolean {
        val requester = lastRow?.let { row -> lastItem?.let { requesters[row to it] } } ?: return false
        return runCatching { requester.requestFocus() }.getOrDefault(false)
    }

    internal companion object {
        val Saver = listSaver<TvFocusMemory, String?>(
            save = { memory ->
                listOf(memory.lastRow, memory.lastItem) + memory.rowItems.flatMap { (row, item) -> listOf(row, item) }
            },
            restore = { saved ->
                val rows = saved.drop(2).chunked(2).associate { (row, item) -> row.orEmpty() to item.orEmpty() }
                TvFocusMemory(saved[0], saved[1], rows)
            },
        )
    }
}

/** A page's [TvFocusMemory], kept while the page is on the back stack. */
@Composable
fun rememberTvFocusMemory(): TvFocusMemory = rememberSaveable(saver = TvFocusMemory.Saver) { TvFocusMemory(null, null, emptyMap()) }

/**
 * How the shell hands focus back to the page when it leaves the drawer.
 * A page sets [restore] to focus what had it last, as [TvFocusMemory]
 * does; without one, the shell focuses the page's first focusable.
 */
@Stable
class TvPageFocus {
    var restore: (() -> Boolean)? = null
}

val LocalTvPageFocus = androidx.compose.runtime.staticCompositionLocalOf<TvPageFocus?> { null }
