package io.github.zekurio.matinee.ui

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.BoundsTransform
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer

/*
 * Home's search button growing into Media's search field, and the field
 * shrinking back into the button: one pill (the kit's SearchPill) whose
 * bounds move from the button's to the field's across the two pages, as a
 * shared transition of the layout the pages move in. Only Media's field is
 * drawn while they move. It starts in the button's look, at the button's
 * place and size, so the first frame is the button as it was, and ends as
 * the field at rest; the button itself stays hidden until it's back in
 * its place. It runs when search opens from Home's button with motion on
 * (`searchMorphs`), and the pages trade places by fading through instead
 * of sliding (Shell.kt). Its timings are Motion's:
 *
 * - The pill's bounds: MOVE_MS, Motion.Easing, both ways; linear while
 *   the back gesture seeks them.
 * - Its look follows its width, not a clock (the kit's
 *   SearchPillOpenness, 0 at the button's 40 wide and 1 at the field's
 *   width): its fill goes from the button's to the field's and the
 *   hairline from nothing to 12% across all of it, and the magnifier
 *   from the text's color to muted. The field's text and placeholder
 *   come in from 0.4 to 1 (so over the last 60% of the widening, and go
 *   over the first 60% of the shrinking); within that, the magnifier
 *   shrinks to 80% and fades out from 0.4 to 0.7 and the Back arrow
 *   grows from 80% and fades in from 0.7 to 1. The corners stay half the
 *   height, 20, all along, and the height stays 40. So they're where the
 *   bounds are on every frame, even when the first frame of Media comes
 *   late, and they follow the back gesture's finger as the bounds do.
 * - The pages under it fade through (Shell.kt, Move.Search): the one
 *   left gone in 90 on Motion.Easing, the one coming in over ENTER_MS
 *   from 80, Motion.Easing, in at MOVE_MS with the pill. With the back
 *   gesture both are linear, Media's out over the first 140 and Home's
 *   in over the whole 280.
 * - The keyboard rises once Media's page is resumed, after the move
 *   (MediaScreen), and goes down as Media's page starts leaving.
 */

/** The page a composable is on, entering or leaving: what a part that moves with its page reads. */
internal val LocalPage = staticCompositionLocalOf<AnimatedVisibilityScope?> { null }

/**
 * Whether Home's button and Media's field are one pill now:
 * [Navigator.searchMorph] while Home or Media is in front, which takes in
 * the move between them both ways. Any other move from Media, as to a
 * title, leaves the field as it is.
 */
internal val LocalSearchMorph = compositionLocalOf { false }

private const val SEARCH_PILL = "search-pill"

/**
 * The pill's bounds over MOVE_MS: on Motion.Easing from a tap or the
 * field's arrow, and linear while the back gesture seeks the move, where
 * the finger's own progress is the curve (Shell.kt, Move.Search).
 */
private fun pillBounds(nav: Navigator) = BoundsTransform { _, _ ->
    tween(Motion.MOVE_MS, easing = if (nav.backGesture) LinearEasing else Motion.Easing)
}

/** The pill's bounds in the morph: with [hiddenWhileMoving], as Home's button, it isn't drawn while they move, and the field is. */
@Composable
private fun Modifier.searchPill(hiddenWhileMoving: Boolean): Modifier {
    val transitions = LocalPageTransitions.current
    val page = LocalPage.current
    val nav = LocalNavigator.current
    if (transitions == null || page == null || !LocalSearchMorph.current) return this
    val shared = with(transitions) {
        sharedBounds(
            rememberSharedContentState(SEARCH_PILL),
            page,
            enter = EnterTransition.None,
            exit = ExitTransition.None,
            boundsTransform = remember(nav) { pillBounds(nav) },
            // Laid out anew at each size, so the icon keeps its place at the start and nothing is stretched.
            resizeMode = SharedTransitionScope.ResizeMode.RemeasureToBounds,
        )
    }
    if (!hiddenWhileMoving) return shared
    val transition = page.transition
    return shared.graphicsLayer { alpha = if (transition.currentState == transition.targetState) 1f else 0f }
}

/** On Home's search button: where the field grows from, and comes back to. */
@Composable
fun Modifier.searchMorphButton(): Modifier = searchPill(hiddenWhileMoving = true)

/** On Media's search field: what's drawn while the pill moves. */
@Composable
fun Modifier.searchMorphField(): Modifier = searchPill(hiddenWhileMoving = false)
