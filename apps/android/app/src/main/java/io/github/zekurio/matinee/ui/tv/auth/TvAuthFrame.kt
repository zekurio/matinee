package io.github.zekurio.matinee.ui.tv.auth

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.components.LogoMark
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.Overscan
import io.github.zekurio.matinee.ui.tv.TvListItems
import io.github.zekurio.matinee.ui.tv.TvFocus
import io.github.zekurio.matinee.ui.tv.TvType
import io.github.zekurio.matinee.ui.tv.tvContent
import io.github.zekurio.matinee.ui.tv.tvControl
import kotlinx.coroutines.flow.first

/**
 * A TV screen before signing in, laid out as Google TV's setup: the mark
 * and name at the top left, what this step is about on the left, and the
 * things to pick on the right, both centred down the screen. [side] takes
 * the left's room under the heading, like a code to type; [split] is
 * how much of the width the left gets.
 */
@Composable
internal fun TvAuthFrame(
    title: String,
    description: String?,
    modifier: Modifier = Modifier,
    split: Float = 0.42f,
    side: @Composable ColumnScope.() -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    Box(modifier.fillMaxSize().background(Palette.Background)) {
        Brand(Modifier.padding(start = Overscan.Horizontal, top = Overscan.Vertical + 16.dp))
        Row(
            Modifier
                .fillMaxSize()
                .padding(start = Overscan.Horizontal, end = Overscan.Horizontal, top = Overscan.Vertical, bottom = Overscan.Vertical),
            horizontalArrangement = Arrangement.spacedBy(64.dp),
        ) {
            // Clear of the mark and name above it; the right side has the whole height.
            Column(Modifier.weight(split).fillMaxHeight().padding(top = 72.dp, bottom = 24.dp), verticalArrangement = Arrangement.Center) {
                Text(title, style = TvType.Display)
                if (description != null) {
                    Text(description, style = TvType.Body, color = Palette.Muted, modifier = Modifier.padding(top = 12.dp))
                }
                side()
            }
            Column(Modifier.weight(1f - split).fillMaxHeight(), verticalArrangement = Arrangement.Center, content = content)
        }
    }
}

/** The sunset mark and the name. */
@Composable
internal fun Brand(modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        LogoMark(Modifier.size(32.dp))
        Text(stringResource(R.string.app_name), style = TvType.Title)
    }
}

/**
 * A field for an address, typed with the TV's keyboard: Select opens it,
 * Go on the keyboard runs [onGo]. Focused, it fills with the text color
 * as a list row does; [isError] rings it in red.
 */
@Composable
internal fun TvTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    onGo: () -> Unit,
    modifier: Modifier = Modifier,
    isError: Boolean = false,
    enabled: Boolean = true,
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val content = tvContent(focused)
    val focus = LocalFocusManager.current
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        // A single line takes Up and Down for its cursor; on a TV they move on, to the buttons.
        modifier = modifier.fillMaxWidth().onPreviewKeyEvent { event ->
            val direction = when (event.key) {
                Key.DirectionDown -> FocusDirection.Down
                Key.DirectionUp -> FocusDirection.Up
                else -> return@onPreviewKeyEvent false
            }
            if (event.type == KeyEventType.KeyDown) focus.moveFocus(direction)
            true
        },
        enabled = enabled,
        singleLine = true,
        textStyle = TvType.Title.copy(color = content),
        cursorBrush = SolidColor(Palette.Accent),
        interactionSource = interaction,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go, autoCorrectEnabled = false),
        keyboardActions = KeyboardActions(onGo = { onGo() }),
        decorationBox = { inner ->
            Box(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = TvListItems.Height + 4.dp)
                    .then(if (isError) Modifier.border(BorderStroke(2.dp, Palette.Danger), TvListItems.Shape) else Modifier)
                    .tvControl(focused, TvListItems.Shape, rest = Palette.Foreground.copy(alpha = 0.07f), scale = TvFocus.ROW_SCALE)
                    .padding(horizontal = TvListItems.Inset),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (value.isEmpty()) Text(placeholder, style = TvType.Title, color = if (focused) content.copy(alpha = 0.55f) else Palette.Muted)
                inner()
            }
        },
    )
}

/**
 * Focus [requester] once the window has focus and it's placed, and again
 * whenever [key] changes. Focus asked for before the window has it, as
 * the app starts, doesn't stick.
 */
@Composable
internal fun FocusOnShow(requester: FocusRequester, key: Any? = Unit) {
    val window = LocalWindowInfo.current
    LaunchedEffect(requester, key) {
        snapshotFlow { window.isWindowFocused }.first { it }
        withFrameNanos {}
        runCatching { requester.requestFocus() }
    }
}

/** A short message under a list, such as what went wrong. */
@Composable
internal fun AuthNote(text: String, modifier: Modifier = Modifier, danger: Boolean = false) {
    Text(
        text,
        style = TvType.Body,
        color = if (danger) Palette.Danger else Palette.Muted,
        modifier = modifier.widthIn(max = 560.dp).padding(start = TvListItems.Inset, top = 12.dp),
    )
}

/** Room between a heading on the left and what follows it. */
internal val SIDE_GAP = 36.dp
