package io.github.zekurio.matinee.ui.tv

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.InputMode
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalInputModeManager
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.onLongClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * How a focused thing on a TV stands out. There are two looks, and every
 * focusable thing takes one of them:
 *
 * - A picture (a poster, a still, a person's photo) keeps its picture
 *   visible, so it grows, lifts, and gets a ring clear of its edge:
 *   [tvPicture].
 * - A control (a button, a chip, a tab, a list row, a drawer entry, a
 *   field) fills with the text color and its content turns dark, with no
 *   ring: [tvControl] and [tvContent].
 */
object TvFocus {
    /** How much a focused picture grows. */
    const val SCALE = 1.06f

    /** How much a focused button, chip, or tab grows. */
    const val CONTROL_SCALE = 1.05f

    /** How much a focused list row grows, less since rows sit close together. */
    const val ROW_SCALE = 1.02f

    val Ring = 3.dp
    val Gap = 3.dp
    val Lift = 16.dp

    /** A control's fill while it doesn't have focus, so its shape shows on any backdrop or picture. */
    val Rest: Color get() = Palette.Foreground.copy(alpha = 0.12f)
}

/**
 * The focus look for a picture: it grows by [scale], lifts, and gets a
 * ring. Put it before the picture's `clip`, so the ring draws outside its
 * [shape], and after its [tvClickable], with the same [interaction]. A
 * list scrolls the focused card into place by the clickable's bounds,
 * which then don't grow with the picture: a row that does would come to
 * rest a few pixels off, and move again as the picture shrinks.
 */
@Composable
fun Modifier.tvPicture(interaction: InteractionSource, shape: Shape, scale: Float = TvFocus.SCALE): Modifier {
    val focused by interaction.collectIsFocusedAsState()
    val shown by animateFloatAsState(if (focused) 1f else 0f, if (focused) Motion.enter() else Motion.exit(), label = "tvPicture")
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
 * The focus look for a control: [focused], it grows by [scale] and fills
 * with the text color; otherwise it shows [rest]. It clips to [shape], so
 * put it before the `clickable` and draw the content in [tvContent].
 */
@Composable
fun Modifier.tvControl(focused: Boolean, shape: Shape, rest: Color = TvFocus.Rest, scale: Float = TvFocus.CONTROL_SCALE): Modifier {
    val grow by animateFloatAsState(if (focused) scale else 1f, if (focused) Motion.enter() else Motion.exit(), label = "tvControlScale")
    val fill by animateColorAsState(if (focused) Palette.Foreground else rest, Motion.color(), label = "tvControlFill")
    return this
        .graphicsLayer {
            scaleX = grow
            scaleY = grow
        }
        .clip(shape)
        .background(fill)
}

/** The color of a control's content: dark on the fill while [focused], else [rest]. */
@Composable
fun tvContent(focused: Boolean, rest: Color = Palette.Foreground): Color {
    val color by animateColorAsState(if (focused) Palette.Background else rest, Motion.color(), label = "tvContent")
    return color
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
    private var fallback: (() -> Pair<String, String>?)? = null

    /** [Restore] is still waiting for the card it starts on, as a page loads. */
    private var opening = false
    private val requesters = mutableStateMapOf<Pair<String, String>, FocusRequester>()

    /** A row of cards: focus that comes in lands on the card it left. */
    fun Modifier.row(key: String): Modifier = focusProperties {
        onEnter = {
            val item = rowItems[key]
            val requester = item?.let { requesters[key to it] }
            if (requester != null) requester.requestFocus()
        }
    }.focusGroup()

    /** A card in [row], remembered when it takes focus. */
    fun Modifier.item(row: String, key: String): Modifier = composed {
        val requester = androidx.compose.runtime.remember(row, key) { FocusRequester() }
        androidx.compose.runtime.DisposableEffect(row, key) {
            requesters[row to key] = requester
            onDispose { if (requesters[row to key] === requester) requesters.remove(row to key) }
        }
        focusRequester(requester)
            // A press names this card as its row's before the tap focuses it.
            // Focus coming into the row would land on the card it had last instead.
            .pointerInput(row, key) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                    rowItems[row] = key
                }
            }
            .onFocusChanged {
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
        val start by rememberUpdatedState(fallback)
        androidx.compose.runtime.DisposableEffect(shell) {
            val restore = { focusLast() }
            shell?.restore = restore
            this@TvFocusMemory.fallback = { start() }
            onDispose {
                if (shell?.restore === restore) shell.restore = null
                this@TvFocusMemory.fallback = null
            }
        }
        val window = androidx.compose.ui.platform.LocalWindowInfo.current
        LaunchedEffect(this) {
            opening = true
            // A page that never shows its card, as one that failed to load, lets the shell focus what it has.
            val wait = launch {
                delay(OPENING_MS)
                opening = false
            }
            // Focus asked for before the window has it, as the app starts, doesn't stick.
            snapshotFlow { window.isWindowFocused }.first { it }
            val requester = snapshotFlow {
                val saved = lastRow?.let { row -> lastItem?.let { requesters[row to it] } }
                saved ?: start()?.let { requesters[it] }
            }.filterNotNull().first()
            // Composed is not yet placed; one frame on, it can take focus.
            androidx.compose.runtime.withFrameNanos { }
            runCatching { requester.requestFocus() }
            wait.cancel()
            opening = false
        }
    }

    /**
     * Focus the card that had it last, if it's on screen, or else the one
     * [Restore] starts on: a row that loaded again may no longer have it.
     * True while [Restore] is still waiting for its card, so the shell
     * doesn't put focus on whatever showed first in the meantime.
     */
    fun focusLast(): Boolean {
        val saved = lastRow?.let { row -> lastItem?.let { requesters[row to it] } }
        val requester = saved ?: fallback?.invoke()?.let { requesters[it] } ?: return opening
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

/**
 * Clicks for a TV control or card, in place of `clickable`. A `clickable`
 * can't hold focus in touch mode, so a mouse click or a touch takes focus
 * off everything and the next D-pad press has nowhere to move from. This
 * one stays focusable in touch mode, and a click focuses what it clicks
 * before running [onClick], so the pointer and the D-pad share one focus:
 * a click shows what focus would show, and the D-pad goes on from there.
 *
 * Select or Enter clicks on release. Held as long as a long press, it runs
 * [onLongClick] instead, if there is one, as a long press of the pointer
 * does. Give it the [interaction] the focus look reads.
 */
fun Modifier.tvClickable(
    interaction: MutableInteractionSource,
    enabled: Boolean = true,
    role: Role = Role.Button,
    onClickLabel: String? = null,
    onLongClick: (() -> Unit)? = null,
    onClick: () -> Unit,
): Modifier = composed {
    val requester = remember { FocusRequester() }
    val click by rememberUpdatedState(onClick)
    val longClick by rememberUpdatedState(onLongClick)
    val scope = rememberCoroutineScope()
    val timeout = LocalViewConfiguration.current.longPressTimeoutMillis
    val press = remember { KeyPress() }
    val long = onLongClick != null
    this
        .focusRequester(requester)
        .onKeyEvent { event ->
            if (!enabled || event.key !in SELECT_KEYS) return@onKeyEvent false
            when (event.type) {
                KeyEventType.KeyDown -> if (event.nativeKeyEvent.repeatCount == 0) {
                    press.down = true
                    press.held = longClick?.let { run ->
                        scope.launch {
                            delay(timeout)
                            press.down = false
                            run()
                        }
                    }
                }
                KeyEventType.KeyUp -> if (press.down) {
                    press.down = false
                    press.held?.cancel()
                    click()
                }
            }
            true
        }
        .focusable(enabled, interaction)
        .semantics(mergeDescendants = true) {
            this.role = role
            onClick(onClickLabel) {
                click()
                true
            }
            if (long) {
                onLongClick {
                    longClick?.invoke()
                    true
                }
            }
            if (!enabled) disabled()
        }
        .pointerInput(enabled, long) {
            if (!enabled) return@pointerInput
            detectTapGestures(
                onLongPress = if (long) {
                    {
                        runCatching { requester.requestFocus() }
                        longClick?.invoke()
                    }
                } else {
                    null
                },
                onTap = {
                    runCatching { requester.requestFocus() }
                    click()
                },
            )
        }
}

/** The keys that click a [tvClickable]. */
private val SELECT_KEYS = setOf(Key.DirectionCenter, Key.Enter, Key.NumPadEnter)

/** A Select press [tvClickable] has seen go down, and the wait for it to become a long one. */
private class KeyPress {
    var down = false
    var held: Job? = null
}

/**
 * A click or a touch focuses this, for something that takes focus but
 * isn't clicked, like a chart read with Left and Right. Put it before the
 * `focusable`.
 */
fun Modifier.tvFocusOnTap(): Modifier = composed {
    val requester = remember { FocusRequester() }
    focusRequester(requester).pointerInput(Unit) {
        detectTapGestures { runCatching { requester.requestFocus() } }
    }
}

/**
 * Puts focus back with [restore] when nothing on a TV screen has it and
 * the D-pad is in charge, since a key press then has nowhere to move from.
 * That happens when the keys take over after a touch or a mouse click in
 * an empty spot, and when the focused card leaves: a row loads again
 * without it, as Continue watching does after its episode is finished.
 * For the root of a TV screen.
 */
fun Modifier.tvRefocus(restore: () -> Unit): Modifier = composed {
    val mode = LocalInputModeManager.current
    var focused by remember { mutableStateOf(false) }
    val current by rememberUpdatedState(restore)
    LaunchedEffect(mode.inputMode) {
        if (mode.inputMode == InputMode.Keyboard && !focused) current()
    }
    LaunchedEffect(mode.inputMode, focused) {
        if (mode.inputMode != InputMode.Keyboard || focused) return@LaunchedEffect
        // A page opening has no focus for a moment and takes it itself.
        // Tried again while nothing can take it yet, as on a page still loading.
        while (true) {
            delay(REFOCUS_AFTER_MS)
            current()
        }
    }
    onFocusChanged { focused = it.hasFocus }
}

private const val REFOCUS_AFTER_MS = 300L

/** How long [TvFocusMemory.Restore] holds off the shell while its page loads. */
private const val OPENING_MS = 2_000L
