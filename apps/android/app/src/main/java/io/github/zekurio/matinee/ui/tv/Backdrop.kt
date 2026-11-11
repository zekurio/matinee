package io.github.zekurio.matinee.ui.tv

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.navigation.NavBackStackEntry
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.ImageSource
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest

/**
 * The picture behind a TV page, which the shell draws edge to edge and the
 * page picks with [ShowBackdrop]. Each page on the back stack keeps what it
 * asked for, so one that comes back shows its picture again at once. A page
 * that asks for none gets the plain background from its first frame.
 */
@Stable
class TvBackdrop {
    /** What each page asked for last, by its back stack entry's id; empty for a page that asks for none. */
    private val requests = mutableStateMapOf<String, List<ImageSource>>()

    internal fun set(page: String, sources: List<ImageSource>) {
        if (requests[page] != sources) requests[page] = sources
    }

    /** [page] is on screen: none for it, unless it asks for a picture. */
    internal fun open(page: String) {
        if (page !in requests) requests[page] = emptyList()
    }

    /**
     * What [page] asked for, before the wait that keeps a held D-pad from
     * loading every picture, or null before it has been composed.
     */
    internal fun of(page: String?): List<ImageSource>? = page?.let { requests[it] }

    /** Forget the pages that left the back stack. */
    internal fun retain(pages: Collection<String>) {
        requests.keys.retainAll(pages.toSet())
    }
}

val LocalTvBackdrop = staticCompositionLocalOf<TvBackdrop?> { null }

/** In the NavHost, the lifecycle owner is the page's back stack entry. */
@Composable
private fun pageId(): String? = (LocalLifecycleOwner.current as? NavBackStackEntry)?.id

/**
 * Show [sources] behind the page, the first that loads, while the page is
 * on screen. A page calls it with what's focused; changes wait a moment
 * and crossfade. Does nothing off a TV.
 */
@Composable
fun ShowBackdrop(sources: List<ImageSource>) {
    val backdrop = LocalTvBackdrop.current ?: return
    val page = pageId() ?: return
    SideEffect { backdrop.set(page, sources) }
}

/**
 * Marks the page as composed, for the shell to call around every page: one
 * that doesn't call [ShowBackdrop] shows none.
 */
@Composable
internal fun BackdropPage() {
    val backdrop = LocalTvBackdrop.current ?: return
    val page = pageId() ?: return
    SideEffect { backdrop.open(page) }
}

/** How long focus has to rest before the backdrop follows it. */
private const val SETTLE_MS = 350L

/** The pictures on screen, and the page that asked for them. */
private class Shown(val page: String?, val sources: List<ImageSource>)

/**
 * The shell's layer for [state] while [page] is on screen: the picture,
 * dimmed from the left and the bottom where a page's text and rows sit,
 * crossfading when it changes. A page with none shows none at once,
 * without fading out the last page's picture.
 */
@Composable
internal fun BackdropLayer(state: TvBackdrop, page: String?, modifier: Modifier = Modifier) {
    val current by rememberUpdatedState(page)
    var shown by remember { mutableStateOf(Shown(page, state.of(page).orEmpty())) }
    LaunchedEffect(state) {
        snapshotFlow { current.let { it to state.of(it) } }.collectLatest { (page, sources) ->
            // A page not yet composed keeps the last picture for the frame until it is.
            if (sources == null) return@collectLatest
            // A change on the same page waits for focus to rest; a new page, the first picture, or none shows at once.
            if (page == shown.page && shown.sources.isNotEmpty() && sources.isNotEmpty()) delay(SETTLE_MS)
            shown = Shown(page, sources)
        }
    }
    Box(modifier.fillMaxSize().background(Palette.Background)) {
        // Read here rather than from [shown], which lags a frame behind.
        if (state.of(page)?.isEmpty() == true) return@Box
        Crossfade(shown.sources, Modifier.fillMaxSize(), animationSpec = tween(Motion.MOVE_MS * 2, easing = Motion.Easing), label = "backdrop") { sources ->
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
