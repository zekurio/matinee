package io.github.zekurio.matinee.ui.kit

import androidx.annotation.DrawableRes
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.theme.Palette

/** The web's `ring-3`: the halo around a focused field. */
private val RING = 3.dp

/**
 * A text field as the web's Input: a quiet border that turns the accent with
 * a soft ring around it when focused, `rounded-lg`, and as tall as a finger
 * needs. No floating label: the [placeholder] says what goes in, and a
 * label, where there is one, sits above it.
 */
@Composable
fun MatineeTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    @DrawableRes leadingIcon: Int? = null,
    trailing: (@Composable () -> Unit)? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    isError: Boolean = false,
    enabled: Boolean = true,
    visualTransformation: VisualTransformation = VisualTransformation.None,
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val tint = if (isError) Palette.Danger else Palette.Accent
    val border by animateColorAsState(
        when {
            isError -> Palette.Danger.copy(alpha = 0.6f)
            focused -> Palette.Accent
            else -> Palette.Input
        },
        Motion.color(),
        label = "border",
    )
    val ring by animateColorAsState(if (focused || isError) tint.copy(alpha = 0.2f) else Color.Transparent, Motion.color(), label = "ring")
    val style = MaterialTheme.typography.bodyLarge.copy(color = Palette.Foreground)
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth().alpha(if (enabled) 1f else 0.5f),
        enabled = enabled,
        singleLine = true,
        textStyle = style,
        cursorBrush = SolidColor(Palette.Accent),
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        visualTransformation = visualTransformation,
        interactionSource = interaction,
        decorationBox = { field ->
            Row(
                Modifier
                    .heightIn(min = TouchHeight)
                    .drawBehind {
                        val spread = RING.toPx()
                        val corner = Radius.Lg.toPx() + spread
                        drawRoundRect(
                            ring,
                            topLeft = Offset(-spread, -spread),
                            size = Size(size.width + spread * 2, size.height + spread * 2),
                            cornerRadius = CornerRadius(corner),
                        )
                    }
                    // Lighter than the card it sits on, not sunk into it: the web's sunken
                    // fill reads as a black hole on a phone's card.
                    .background(Palette.Secondary, ControlShape)
                    .border(1.dp, border, ControlShape)
                    .padding(start = if (leadingIcon != null) 10.dp else 12.dp, end = if (trailing != null) 4.dp else 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (leadingIcon != null) {
                    LucideIcon(leadingIcon, null, size = 18.dp, tint = Palette.Muted)
                    Gap(8.dp)
                }
                Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty() && placeholder != null) {
                        Text(placeholder, style = style, color = Palette.Muted, maxLines = 1)
                    }
                    field()
                }
                if (trailing != null) trailing()
            }
        },
    )
}
