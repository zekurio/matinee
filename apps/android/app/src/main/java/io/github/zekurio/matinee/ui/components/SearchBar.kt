package io.github.zekurio.matinee.ui.components

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.RoundIconButton
import io.github.zekurio.matinee.ui.theme.Palette

/** The search field's pill: full width, 48 tall, with room for a button at each end. */
@Composable
fun SearchBarFrame(modifier: Modifier = Modifier, content: @Composable RowScope.() -> Unit) {
    Row(
        modifier
            .fillMaxWidth()
            .height(48.dp)
            .clip(CircleShape)
            .background(Palette.Foreground.copy(alpha = 0.06f))
            .border(1.dp, Palette.Foreground.copy(alpha = 0.12f), CircleShape)
            .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

/**
 * Media's search field, as Findroid's: the magnifier, the text, and a
 * button to clear it. While search is [open] Back takes the magnifier's
 * place, as Findroid's does, and [onBack] closes search. Clearing the text
 * keeps search open and the keyboard up. Taking focus calls [onFocus],
 * which opens search. The keyboard's Search key only puts the keyboard
 * away, since search follows the typing.
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
    SearchBarFrame(modifier) {
        Crossfade(open, Modifier.size(44.dp), animationSpec = Motion.color(), label = "searchLeading") { back ->
            Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) {
                if (back) {
                    RoundIconButton(Lucide.ArrowLeft, stringResource(R.string.common_back), onBack, size = 36.dp, iconSize = 20.dp, background = Color.Transparent)
                } else {
                    LucideIcon(Lucide.Search, null, size = 20.dp, tint = Palette.Muted)
                }
            }
        }
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
                .focusRequester(focus)
                .onFocusChanged { if (it.isFocused) onFocus() },
            decorationBox = { field ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (query.isEmpty()) {
                        Text(
                            stringResource(R.string.search_field),
                            style = MaterialTheme.typography.bodyLarge,
                            color = Palette.Faint,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    field()
                }
            },
        )
        if (query.isNotEmpty()) {
            RoundIconButton(Lucide.X, stringResource(R.string.search_clear), { onQuery("") }, size = 44.dp, iconSize = 18.dp, background = Color.Transparent)
        } else {
            Box(Modifier.size(12.dp))
        }
    }
}
