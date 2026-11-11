package io.github.zekurio.matinee.ui.tv

import android.text.format.DateFormat
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import io.github.zekurio.matinee.ui.theme.Palette
import java.util.Date
import kotlinx.coroutines.delay

/** The time at the top right of every TV page, in the device's 12 or 24 hour style. */
@Composable
fun TvClock(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            // Wake at the turn of the next minute.
            delay(60_000 - now % 60_000)
        }
    }
    val format = remember(context) { DateFormat.getTimeFormat(context) }
    Text(format.format(Date(now)), style = TvType.Clock, color = Palette.Foreground.copy(alpha = 0.9f), modifier = modifier)
}

/** How many pages on screen have scrolled up from their top, so the shell can take the clock away from over their content. */
@Stable
class TvScrolledPages {
    var count by mutableIntStateOf(0)
        internal set
}

val LocalTvScrolledPages = staticCompositionLocalOf<TvScrolledPages?> { null }

/** A focused item can nudge its list by a pixel, which isn't the page scrolling. */
private const val NUDGE_PX = 8

/** Whether the list has scrolled up from its top. */
val LazyListState.scrolledUp: Boolean get() = firstVisibleItemIndex > 0 || firstVisibleItemScrollOffset > NUDGE_PX

/** Whether the grid has scrolled up from its top. */
val LazyGridState.scrolledUp: Boolean get() = firstVisibleItemIndex > 0 || firstVisibleItemScrollOffset > NUDGE_PX

/** Hides the clock while [scrolled], for a page whose content scrolls up under it. */
@Composable
fun HideClockWhen(scrolled: Boolean) {
    val pages = LocalTvScrolledPages.current ?: return
    DisposableEffect(pages, scrolled) {
        if (scrolled) pages.count++
        onDispose { if (scrolled) pages.count-- }
    }
}
