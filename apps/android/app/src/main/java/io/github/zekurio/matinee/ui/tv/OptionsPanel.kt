package io.github.zekurio.matinee.ui.tv

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.flow.first

/** A choice in a [TvOptionsPanel]: [detail] at its end, like a count; [selected] is the one in force. */
class TvOption(val key: String, val label: String, val detail: String? = null, val selected: Boolean = false)

private val PANEL_WIDTH = 340.dp

private val TRAPPED = listOf(FocusDirection.Left, FocusDirection.Right, FocusDirection.Up, FocusDirection.Down, FocusDirection.Next, FocusDirection.Previous)

/**
 * A panel that slides in over the right of a TV page while [open], to
 * pick one of [options], as a sort or a filter: the page dims behind it,
 * focus starts on the selected option and stays in the panel, and Back or
 * a pick closes it. [onPick] gets the option; [onClose] runs on Back, and
 * should hand focus back to what opened the panel. While [loading], a
 * spinner instead of the options. Put it last in the page's box, so it
 * draws over the rest.
 */
@Composable
fun BoxScope.TvOptionsPanel(
    open: Boolean,
    title: String,
    options: List<TvOption>,
    onPick: (TvOption) -> Unit,
    onClose: () -> Unit,
    loading: Boolean = false,
) {
    BackHandler(enabled = open, onBack = onClose)
    AnimatedVisibility(open, Modifier.matchParentSize(), enter = fadeIn(Motion.enter()), exit = fadeOut(Motion.exit())) {
        Box(
            Modifier.fillMaxSize().background(
                Brush.horizontalGradient(0f to Palette.Background.copy(alpha = 0.35f), 1f to Palette.Background.copy(alpha = 0.8f)),
            ),
        )
    }
    AnimatedVisibility(
        open,
        Modifier.align(Alignment.CenterEnd).fillMaxHeight(),
        enter = slideInHorizontally(Motion.move()) { it } + fadeIn(Motion.enter()),
        exit = slideOutHorizontally(Motion.exit()) { it } + fadeOut(Motion.exit()),
    ) {
        val first = remember { FocusRequester() }
        val selected = options.indexOfFirst { it.selected }.coerceAtLeast(0)
        Column(
            Modifier
                .width(PANEL_WIDTH)
                .fillMaxHeight()
                .background(Palette.Raised)
                // D-pad moves stay in here until a pick or Back closes it; the page's own requests still pass.
                .focusProperties { onExit = { if (requestedFocusDirection in TRAPPED) cancelFocusChange() } }
                .focusGroup()
                .padding(top = Overscan.Vertical + 8.dp, bottom = Overscan.Vertical),
        ) {
            Text(
                title,
                style = TvType.Headline,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 32.dp, end = Overscan.Horizontal, bottom = 16.dp),
            )
            if (loading) {
                Box(Modifier.fillMaxWidth().padding(top = 32.dp), contentAlignment = Alignment.TopCenter) {
                    CircularProgressIndicator(color = Palette.Muted, strokeWidth = 3.dp, modifier = Modifier.size(28.dp))
                }
            } else {
                LazyColumn(
                    state = rememberLazyListState((selected - 3).coerceAtLeast(0)),
                    contentPadding = PaddingValues(start = 16.dp, end = Overscan.Horizontal - 8.dp, top = 4.dp, bottom = 16.dp),
                ) {
                    itemsIndexed(options, key = { _, option -> option.key }) { index, option ->
                        OptionRow(option, if (index == selected) Modifier.focusRequester(first) else Modifier) { onPick(option) }
                    }
                }
                val window = androidx.compose.ui.platform.LocalWindowInfo.current
                LaunchedEffect(Unit) {
                    androidx.compose.runtime.snapshotFlow { window.isWindowFocused }.first { it }
                    androidx.compose.runtime.withFrameNanos { }
                    runCatching { first.requestFocus() }
                }
            }
        }
    }
}

@Composable
private fun OptionRow(option: TvOption, modifier: Modifier, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val shape = RoundedCornerShape(12.dp)
    val fill by animateColorAsState(if (focused) Palette.Foreground else Palette.Foreground.copy(alpha = 0f), Motion.color(), label = "optionFill")
    val text = if (focused) Palette.Background else Palette.Foreground
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(shape)
            .background(fill)
            .clickable(interaction, indication = null, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(28.dp), contentAlignment = Alignment.CenterStart) {
            if (option.selected) LucideIcon(Lucide.Check, null, size = 20.dp, tint = if (focused) Palette.Background else Palette.Accent)
        }
        Text(
            option.label,
            style = TvType.Facts,
            color = text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (option.detail != null) {
            Text(option.detail, style = TvType.Caption, color = if (focused) Palette.Background.copy(alpha = 0.7f) else Palette.Muted)
        }
    }
}
