package io.github.zekurio.matinee.ui.tv.detail

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.border
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.gestures.BringIntoViewSpec
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.formatRating
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.title.FileInfo
import io.github.zekurio.matinee.ui.tv.Overscan
import io.github.zekurio.matinee.ui.tv.TvButton
import io.github.zekurio.matinee.ui.tv.TvPage
import io.github.zekurio.matinee.ui.tv.TvType
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** How far below the list's top a row's focused card sits once the header has scrolled away. */
private val ROW_PIVOT = 88.dp

/** How far down from the top rows scrolling past it fade out. */
private val TOP_FADE = 44.dp

/** Room after the last row, so it too can scroll up to where the focused row sits. */
private val ROWS_END = 360.dp

/** The header's room from the top of the screen, level with the clock. */
internal val HEADER_TOP = Overscan.Vertical + 8.dp

/** How wide a header's text runs, clear of the art on the right. */
internal val HEADER_TEXT_WIDTH = 560.dp

/**
 * A detail page: [header] first, over the backdrop, with its buttons, then
 * [rows] below it, reached with Down. While the header has focus the page
 * sits at its top; once a row has it, each row scrolls to the same height
 * as Home's do.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun DetailList(header: @Composable () -> Unit, rows: LazyListScope.() -> Unit) {
    val state = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val inHeader = remember { mutableStateOf(true) }
    val pivot = with(LocalDensity.current) { ROW_PIVOT.toPx() }
    val spec = remember(pivot) {
        object : BringIntoViewSpec {
            override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float =
                if (inHeader.value) 0f else offset - pivot
        }
    }
    val scrolled by remember { derivedStateOf { state.firstVisibleItemIndex > 0 || state.firstVisibleItemScrollOffset > 0 } }
    CompositionLocalProvider(LocalBringIntoViewSpec provides spec) {
        LazyColumn(
            Modifier
                .fillMaxSize()
                // Rows that scroll past the top fade out there, rather than end at a hard edge under the clock.
                .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
                .drawWithContent {
                    drawContent()
                    if (scrolled) {
                        drawRect(
                            Brush.verticalGradient(listOf(Color.Transparent, Color.Black), startY = 0f, endY = TOP_FADE.toPx()),
                            blendMode = BlendMode.DstIn,
                        )
                    }
                },
            state = state,
            contentPadding = PaddingValues(bottom = ROWS_END),
            verticalArrangement = Arrangement.spacedBy(32.dp),
        ) {
            item(key = "header") {
                Box(
                    Modifier
                        .onFocusChanged {
                            inHeader.value = it.hasFocus
                            if (it.hasFocus) scope.launch { state.animateScrollToItem(0) }
                        }
                        .focusGroup(),
                ) { header() }
            }
            rows()
        }
    }
}

/** The header's column: from the top of the page, at the page's start, as wide as its text runs. */
@Composable
internal fun HeaderColumn(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(modifier.padding(start = TvPage.Start, end = TvPage.End, top = HEADER_TOP)) { content() }
}

/** Year, length, and the like, then the age rating in a box, the score by its star, and the file's badges. */
@Composable
internal fun DetailFacts(
    facts: List<String>,
    contentRating: String?,
    rating: Double?,
    modifier: Modifier = Modifier,
    flags: List<String> = emptyList(),
) {
    if (facts.isEmpty() && contentRating == null && rating == null && flags.isEmpty()) return
    val color = Palette.Foreground.copy(alpha = 0.85f)
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
        if (facts.isNotEmpty()) Text(facts.joinToString("  ·  "), style = TvType.Facts, color = color, maxLines = 1)
        contentRating?.let { Boxed(it, color) }
        rating?.let {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                LucideIcon(Lucide.Star, stringResource(R.string.media_hero_rated), size = 16.dp, tint = Palette.Star)
                Text(formatRating(it), style = TvType.Facts, color = color)
            }
        }
        flags.forEach { Boxed(it, color) }
    }
}

@Composable
private fun Boxed(text: String, color: Color) {
    Text(
        text,
        style = TvType.Caption,
        color = color,
        maxLines = 1,
        modifier = Modifier
            .border(1.dp, Palette.Foreground.copy(alpha = 0.4f), RoundedCornerShape(4.dp))
            .padding(horizontal = 8.dp, vertical = 1.dp),
    )
}

/** An overview, cut to [lines]. */
@Composable
internal fun DetailOverview(text: String, modifier: Modifier = Modifier, lines: Int = 3, tagline: String? = null) {
    Column(modifier.width(HEADER_TEXT_WIDTH)) {
        if (tagline != null) {
            Text(tagline, style = TvType.Facts, color = Palette.Foreground, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(text, style = TvType.Body, color = Palette.Foreground.copy(alpha = 0.78f), maxLines = lines, overflow = TextOverflow.Ellipsis)
    }
}

/** What a file holds, a line each with its icon, set small beside a header's text. */
@Composable
internal fun FileInfoLines(info: FileInfo, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        info.video?.let { InfoLine(Lucide.Film, stringResource(R.string.media_info_video), it) }
        info.audio?.let { InfoLine(Lucide.AudioLines, stringResource(R.string.media_info_audio), it) }
        info.subtitles?.let { InfoLine(Lucide.Captions, stringResource(R.string.media_info_subtitles), it) }
    }
}

@Composable
private fun InfoLine(icon: Int, label: String, text: String) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        LucideIcon(icon, label, size = 16.dp, tint = Palette.Muted, modifier = Modifier.padding(top = 2.dp))
        Text(text, style = TvType.Caption, color = Palette.Foreground.copy(alpha = 0.8f), maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

/**
 * A page that has nothing to show but its load: a spinner while it loads,
 * why it failed with Try again, or [content] once it's there.
 */
@Composable
internal fun <T> DetailState(state: Load<T>, error: String, retry: () -> Unit, content: @Composable (T) -> Unit) {
    when (state) {
        Load.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = Palette.Muted, strokeWidth = 3.dp, modifier = Modifier.size(36.dp))
        }
        is Load.Failed -> DetailMessage(error, state.message, retry)
        is Load.Ready -> content(state.value)
    }
}

/** A page as one message, with Try again where there's a way to. */
@Composable
internal fun DetailMessage(title: String, message: String?, retry: (() -> Unit)?) {
    val requester = remember { FocusRequester() }
    Column(
        Modifier.fillMaxSize().padding(start = TvPage.Start, end = TvPage.End),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(title, style = TvType.Headline)
        if (message != null) Text(message, style = TvType.Body, color = Palette.Muted, modifier = Modifier.padding(top = 8.dp))
        if (retry != null) {
            TvButton(stringResource(R.string.common_retry), retry, Modifier.padding(top = 28.dp).focusRequester(requester), icon = Lucide.RefreshCw)
        }
    }
    if (retry != null) FocusOnce(requester)
}

/** Focus [requester] once it's on screen and the window has focus. */
@Composable
internal fun FocusOnce(requester: FocusRequester) {
    val window = androidx.compose.ui.platform.LocalWindowInfo.current
    androidx.compose.runtime.LaunchedEffect(requester) {
        androidx.compose.runtime.snapshotFlow { window.isWindowFocused }.first { it }
        androidx.compose.runtime.withFrameNanos { }
        runCatching { requester.requestFocus() }
    }
}

/** A gap of [height], for spacing in a header's column. */
@Composable
internal fun Gap(height: Dp) = Box(Modifier.padding(top = height).fillMaxWidth())
