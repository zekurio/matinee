package io.github.zekurio.matinee.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.RoundIconButton
import io.github.zekurio.matinee.ui.kit.SearchPill
import io.github.zekurio.matinee.ui.kit.SearchPillDefaults
import io.github.zekurio.matinee.ui.kit.SearchPillIcon
import io.github.zekurio.matinee.ui.kit.SearchPillOpenness
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * Media's search field, as Findroid's: the magnifier, the text, and a
 * button to clear it, in the kit's [SearchPill], 40 tall. While search is
 * [open] Back takes the magnifier's place, as Findroid's does, and
 * [onBack] goes back. Clearing the text keeps search open and the
 * keyboard up. Taking focus calls [onFocus], which opens search. The
 * keyboard's Search key only puts the keyboard away, since search follows
 * the typing.
 *
 * Its look follows its own width ([SearchPillOpenness]), so while Home's
 * search button grows into it or it shrinks back into the button
 * (SearchMorph.kt), it's the button at the button's size and itself at its
 * own, and what's in it comes in over the last 60% of the widening and
 * goes over the first 60% of the shrinking. At rest it's itself.
 */
@Composable
fun SearchField(
    query: String,
    onQuery: (String) -> Unit,
    open: Boolean,
    onBack: () -> Unit,
    onFocus: () -> Unit,
    focus: FocusRequester,
    modifier: Modifier = Modifier,
) {
    val keyboard = LocalSoftwareKeyboardController.current
    // Opening and closing on Media crossfade the magnifier and the arrow in their square.
    val backShown by animateFloatAsState(if (open) 1f else 0f, Motion.color(), label = "searchBack")
    val openness = remember { SearchPillOpenness() }
    val shape = { openness.value }
    val reveal = { ((openness.value - 0.4f) / 0.6f).coerceIn(0f, 1f) }
    SearchPill(shape, with(openness) { modifier.measureOpenness() }) {
        SearchPillIcon(
            open = shape,
            back = { backShown * reveal() },
            onBack = if (open) onBack else null,
            backLabel = stringResource(R.string.common_back),
        )
        Gap(SearchPillDefaults.TextGap)
        BasicTextField(
            value = query,
            onValueChange = onQuery,
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyLarge.copy(color = Palette.Foreground),
            cursorBrush = SolidColor(Palette.Accent),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { keyboard?.hide() }),
            modifier = Modifier
                .weight(1f)
                .graphicsLayer { alpha = reveal() }
                .focusRequester(focus)
                .onFocusChanged { if (it.isFocused) onFocus() },
            decorationBox = { field ->
                Box(Modifier.clipToBounds(), contentAlignment = Alignment.CenterStart) {
                    if (query.isEmpty()) {
                        Text(
                            stringResource(R.string.search_field),
                            style = MaterialTheme.typography.bodyLarge,
                            color = Palette.Faint,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.atRestWidth(),
                        )
                    }
                    field()
                }
            },
        )
        if (query.isNotEmpty()) {
            Box(Modifier.graphicsLayer { alpha = reveal() }) {
                RoundIconButton(Lucide.X, stringResource(R.string.search_clear), { onQuery("") }, Modifier.size(SearchPillDefaults.Height), size = SearchPillDefaults.Height, iconSize = 18.dp, background = Color.Transparent)
            }
        } else {
            Gap(12.dp)
        }
    }
}

/**
 * Lays the placeholder out as wide as the field leaves it at rest, which
 * the shared transition's lookahead measures, while the pill around it is
 * narrower on its way there, and lets the pill cut it off. So it ends in
 * the same place all along, rather than shortening its ellipsis with every
 * frame the pill widens.
 */
@Composable
private fun Modifier.atRestWidth(): Modifier {
    val rest = remember { IntArray(1) }
    return layout { measurable, constraints ->
        if (isLookingAhead) rest[0] = constraints.maxWidth
        val width = if (constraints.hasBoundedWidth) maxOf(constraints.maxWidth, rest[0]) else constraints.maxWidth
        val placeable = measurable.measure(constraints.copy(maxWidth = width))
        layout(minOf(placeable.width, constraints.maxWidth), placeable.height) { placeable.place(0, 0) }
    }
}
