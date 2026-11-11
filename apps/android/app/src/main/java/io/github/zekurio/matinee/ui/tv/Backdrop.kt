package io.github.zekurio.matinee.ui.tv

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.ImageSource
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest

/**
 * The picture behind a TV page, which the shell draws edge to edge and the
 * page picks with [ShowBackdrop]. A page that shows none gets the plain
 * background.
 */
@Stable
class TvBackdrop {
    /** What the page asked for last, before the wait that keeps a held D-pad from loading every picture. */
    internal var requested by mutableStateOf<List<ImageSource>>(emptyList())
    private var owner: Any? = null

    internal fun set(by: Any, sources: List<ImageSource>) {
        owner = by
        requested = sources
    }

    internal fun clear(by: Any) {
        if (owner !== by) return
        owner = null
        requested = emptyList()
    }
}

val LocalTvBackdrop = staticCompositionLocalOf<TvBackdrop?> { null }

/**
 * Show [sources] behind the page, the first that loads, while this is in
 * the composition. A page calls it with what's focused; changes wait a
 * moment and crossfade. Does nothing off a TV.
 */
@Composable
fun ShowBackdrop(sources: List<ImageSource>) {
    val backdrop = LocalTvBackdrop.current ?: return
    val owner = remember { Any() }
    LaunchedEffect(sources) { backdrop.set(owner, sources) }
    DisposableEffect(backdrop) { onDispose { backdrop.clear(owner) } }
}

/** How long focus has to rest before the backdrop follows it. */
private const val SETTLE_MS = 350L

/**
 * The shell's layer for [state]: the picture, dimmed from the left and the
 * bottom where a page's text and rows sit, crossfading when it changes.
 */
@Composable
internal fun BackdropLayer(state: TvBackdrop, modifier: Modifier = Modifier) {
    var shown by remember { mutableStateOf<List<ImageSource>>(emptyList()) }
    LaunchedEffect(state) {
        snapshotFlow { state.requested }.collectLatest { next ->
            // The first picture, or none, shows at once; a change waits for focus to rest.
            if (shown.isNotEmpty() && next.isNotEmpty()) delay(SETTLE_MS)
            shown = next
        }
    }
    Box(modifier.fillMaxSize().background(Palette.Background)) {
        Crossfade(shown, Modifier.fillMaxSize(), animationSpec = tween(Motion.MOVE_MS * 2, easing = Motion.Easing), label = "backdrop") { sources ->
            if (sources.isNotEmpty()) {
                BoxWithConstraints(Modifier.fillMaxSize()) {
                    Picture(sources, Modifier.fillMaxSize(), alignment = Alignment.TopEnd)
                    Scrim()
                }
            }
        }
    }
}

/** Darkens the picture so text reads on it: most at the left and bottom, a little at the top for the clock. */
@Composable
private fun Scrim() {
    val shade = Palette.Background
    Box(
        Modifier.fillMaxSize().background(
            Brush.horizontalGradient(
                0f to shade.copy(alpha = 0.94f),
                0.35f to shade.copy(alpha = 0.78f),
                0.7f to shade.copy(alpha = 0.3f),
                1f to shade.copy(alpha = 0.15f),
            ),
        ),
    )
    Box(
        Modifier.fillMaxSize().background(
            Brush.verticalGradient(
                0f to shade.copy(alpha = 0.45f),
                0.18f to Color.Transparent,
                0.45f to shade.copy(alpha = 0.35f),
                1f to shade.copy(alpha = 0.95f),
            ),
        ),
    )
}
