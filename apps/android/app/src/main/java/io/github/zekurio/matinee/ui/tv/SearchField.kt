package io.github.zekurio.matinee.ui.tv

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * A search field for TV pages. Focus rests on it like on a button, so
 * moving past it with the D-pad doesn't pop the keyboard up; Select opens
 * the system's keyboard into it. The keyboard's search key closes it and
 * hands focus back to the field; Back closes it too, and the next Back
 * leaves the page. With text in it, a clear button sits at its end, to the right.
 * [field] goes on what takes focus, for a [TvFocusMemory] or a
 * [FocusRequester]; [height] is the pill's.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TvSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    clearLabel: String,
    modifier: Modifier = Modifier,
    field: Modifier = Modifier,
    height: Dp = TvButtons.Height,
    textStyle: androidx.compose.ui.text.TextStyle = TvType.Facts,
) {
    var editing by remember { mutableStateOf(false) }
    val outer = remember { FocusRequester() }
    val inner = remember { FocusRequester() }
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    var innerFocused by remember { mutableStateOf(false) }
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val stop = {
        keyboard?.hide()
        editing = false
        runCatching { outer.requestFocus() }
    }
    LaunchedEffect(editing) {
        if (editing) {
            runCatching { inner.requestFocus() }
            keyboard?.show()
        }
    }
    // The keyboard takes Back itself while it's up, and closes. A TV's keyboard floats over the
    // page and reports no insets, so the app can't tell it went: the text keeps focus, drawn as
    // the field's, and the next Back leaves the page.
    val lit = focused || innerFocused
    val content = tvContent(lit)
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
        Row(
            field
                .weight(1f)
                .height(height)
                .focusRequester(outer)
                .tvControl(lit, CircleShape, scale = TvFocus.ROW_SCALE)
                .tvClickable(interaction, role = Role.Button, onClickLabel = placeholder) { editing = true }
                .padding(start = 18.dp, end = 22.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LucideIcon(Lucide.Search, null, size = 22.dp, tint = if (lit) content else Palette.Muted)
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle = textStyle.copy(color = content),
                cursorBrush = SolidColor(Palette.Accent),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { stop() }, onDone = { stop() }),
                modifier = Modifier
                    .weight(1f)
                    .focusRequester(inner)
                    .focusProperties { canFocus = editing }
                    // With the keyboard closed by Back, Up and Down leave the text as they'd leave
                    // the field. The text field only does this itself for keys from a D-pad source.
                    .onPreviewKeyEvent { event ->
                        val direction = when (event.key) {
                            Key.DirectionDown -> FocusDirection.Down
                            Key.DirectionUp -> FocusDirection.Up
                            else -> return@onPreviewKeyEvent false
                        }
                        if (event.type == KeyEventType.KeyDown) {
                            stop()
                            focusManager.moveFocus(direction)
                        }
                        true
                    }
                    .onFocusChanged {
                        innerFocused = it.isFocused
                        if (!it.isFocused && editing) editing = false
                    },
                decorationBox = { text ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (value.isEmpty()) {
                            Text(placeholder, style = textStyle, color = if (lit) content.copy(alpha = 0.55f) else Palette.Faint, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        text()
                    }
                },
            )
        }
        if (value.isNotEmpty()) {
            // It goes with the text, so focus goes back to the field.
            TvRoundButton(Lucide.X, clearLabel, onClick = {
                onValueChange("")
                runCatching { outer.requestFocus() }
            }, size = height)
        }
    }
}
