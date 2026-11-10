package io.github.zekurio.matinee.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize

/**
 * The app's motion, timed as the web app's (packages/ui: globals.css and
 * lib/modal.ts) so both feel equally quick: things that move take 280 ms
 * and settle fast, overlays open in 200 ms and close in 150, colors change
 * in 120. Every animation in the app takes its timing from here.
 */
object Motion {
    /** The web's cubic-bezier(0.22, 1, 0.36, 1): off at once, then a long, soft landing. */
    val Easing = CubicBezierEasing(0.22f, 1f, 0.36f, 1f)

    /** The web's ease-in, for things on their way out. */
    val ExitEasing = CubicBezierEasing(0.4f, 0f, 1f, 1f)

    /** A page or tab sliding, a sheet or panel moving. */
    const val MOVE_MS = 280

    /** An overlay or a block of content appearing. */
    const val ENTER_MS = 200

    /** The same going away, quicker, so it never holds up what comes next. */
    const val EXIT_MS = 150

    /** A color or a selection changing. */
    const val COLOR_MS = 120

    /** Images over their placeholder. */
    const val IMAGE_MS = 150

    fun <T> move(): FiniteAnimationSpec<T> = tween(MOVE_MS, easing = Easing)

    fun <T> enter(delay: Int = 0): FiniteAnimationSpec<T> = tween(ENTER_MS, delayMillis = delay, easing = Easing)

    fun <T> exit(): FiniteAnimationSpec<T> = tween(EXIT_MS, easing = ExitEasing)

    fun <T> color(): FiniteAnimationSpec<T> = tween(COLOR_MS, easing = Easing)

    /** Controls and overlays fading in, as the player's. */
    val fadeIn: EnterTransition = fadeIn(enter())

    val fadeOut: ExitTransition = fadeOut(exit())

    /** A block of rows opening below the one that asked for it, and closing again. */
    val expand: EnterTransition = expandVertically(enter<IntSize>(), expandFrom = androidx.compose.ui.Alignment.Top) + fadeIn(enter())

    val collapse: ExitTransition = shrinkVertically(exit<IntSize>(), shrinkTowards = androidx.compose.ui.Alignment.Top) + fadeOut(exit())

    /** Offsets for slides, which take an [IntOffset] spec. */
    fun slide(): FiniteAnimationSpec<IntOffset> = move()
}

/**
 * Rows that show only sometimes, like a switch's extra settings: they open
 * and close rather than pop in and push the rest down at once.
 */
@Composable
fun Reveal(visible: Boolean, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    AnimatedVisibility(visible, modifier, enter = Motion.expand, exit = Motion.collapse) { content() }
}
