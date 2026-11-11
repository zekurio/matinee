package io.github.zekurio.matinee.ui.tv

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.theme.Palette

private val PANEL_WIDTH = 400.dp

/**
 * A panel at the right edge of a TV page, over the dimmed page, for a
 * choice or a question. It's a dialog window of its own, so focus stays in
 * it until Back or a choice closes it, and the page gets focus back where
 * it was. Give one of its rows [initial] to land there; else the first row
 * takes focus.
 */
@Composable
fun TvSidePanel(
    title: String,
    onDismiss: () -> Unit,
    description: String? = null,
    initial: FocusRequester? = null,
    content: LazyListScope.() -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        val shown = remember { MutableTransitionState(false).apply { targetState = true } }
        val fallback = remember { FocusRequester() }
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        0f to Palette.Background.copy(alpha = 0.2f),
                        1f to Palette.Background.copy(alpha = 0.7f),
                    ),
                ),
        ) {
            AnimatedVisibility(
                shown,
                Modifier.align(Alignment.CenterEnd),
                enter = slideInHorizontally(Motion.slide()) { it / 3 } + fadeIn(Motion.enter()),
            ) {
                Column(
                    Modifier
                        .width(PANEL_WIDTH)
                        .fillMaxHeight()
                        .background(Palette.Raised)
                        .padding(top = Overscan.Vertical + 16.dp),
                ) {
                    Text(title, style = TvType.Headline, modifier = Modifier.padding(horizontal = PANEL_PAD))
                    if (description != null) {
                        Text(
                            description,
                            style = TvType.Body,
                            color = Palette.Muted,
                            modifier = Modifier.padding(start = PANEL_PAD, end = PANEL_PAD, top = 8.dp),
                        )
                    }
                    LazyColumn(
                        Modifier.focusRequester(fallback).focusGroup(),
                        state = rememberLazyListState(),
                        contentPadding = PaddingValues(start = PANEL_PAD - 20.dp, end = Overscan.Horizontal - 8.dp, top = 20.dp, bottom = Overscan.Vertical + 16.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                        content = content,
                    )
                }
            }
        }
        LaunchedEffect(Unit) {
            withFrameNanos {}
            withFrameNanos {}
            if (initial == null || runCatching { initial.requestFocus() }.isFailure) runCatching { fallback.requestFocus() }
        }
    }
}

/** Where the panel's text starts; its rows' text lines up with it. */
private val PANEL_PAD = 40.dp

/**
 * A choice among [options] in a [TvSidePanel], the [current] one checked
 * and focused first. Picking one closes the panel.
 */
@Composable
fun <T> TvPickerPanel(
    title: String,
    options: List<Pair<T, String>>,
    current: T,
    onPick: (T) -> Unit,
    onDismiss: () -> Unit,
    description: String? = null,
) {
    val picked = remember { FocusRequester() }
    val currentIndex = options.indexOfFirst { it.first == current }
    TvSidePanel(title, onDismiss, description, initial = if (currentIndex >= 0) picked else null) {
        itemsIndexed(options) { index, (value, label) ->
            TvListItem(
                label,
                onClick = {
                    onDismiss()
                    if (value != current) onPick(value)
                },
                modifier = if (index == currentIndex) Modifier.focusRequester(picked) else Modifier,
                quiet = true,
                trailing = if (value == current) ({ LucideIcon(Lucide.Check, null, size = 22.dp) }) else null,
            )
        }
    }
}
