package io.github.zekurio.matinee.ui.kit

import androidx.annotation.DrawableRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * The web's button variants, with Frosted for buttons over a picture and
 * Glass, white over a dark shade on a picture whatever the theme.
 */
enum class ButtonLook { Primary, Secondary, Frosted, Glass, Outline, Ghost, Destructive }

/**
 * A ring for the D-pad on TVs, where focus moves instead of a finger. Phones
 * rarely see it.
 */
@Composable
fun Modifier.focusRing(interaction: MutableInteractionSource, shape: Shape): Modifier {
    val focused by interaction.collectIsFocusedAsState()
    return if (focused) border(2.dp, Palette.Accent, shape) else this
}

@Composable
fun MatineeButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    look: ButtonLook = ButtonLook.Primary,
    enabled: Boolean = true,
    height: Dp = 44.dp,
    contentPadding: PaddingValues = PaddingValues(horizontal = 16.dp),
    /** Rounded all round, or on one side for half of a split button. */
    shape: Shape = ControlShape,
    /** Drawn as disabled while still taking a tap, for a button whose tap says why it can't do its job. */
    dimmed: Boolean = !enabled,
    content: @Composable RowScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val (background, foreground) = when (look) {
        ButtonLook.Primary -> Palette.Accent to Palette.AccentForeground
        ButtonLook.Secondary -> Palette.Secondary to Palette.Foreground
        ButtonLook.Frosted -> Palette.Foreground.copy(alpha = 0.15f) to Palette.Foreground
        ButtonLook.Glass -> Color.White.copy(alpha = 0.18f) to Color.White
        ButtonLook.Outline -> Color.Transparent to Palette.Foreground
        ButtonLook.Ghost -> Color.Transparent to Palette.Foreground
        // bg-destructive/10, and /20 on dark themes.
        ButtonLook.Destructive -> Palette.Danger.copy(alpha = if (Palette.isDark) 0.2f else 0.1f) to Palette.Danger
    }
    Row(
        modifier
            .heightIn(min = height)
            .clip(shape)
            .background(if (dimmed) background.copy(alpha = background.alpha * 0.5f) else background)
            .then(if (look == ButtonLook.Outline) Modifier.border(1.dp, Palette.Border, shape) else Modifier)
            .then(if (look == ButtonLook.Frosted) Modifier.border(1.dp, Palette.Foreground.copy(alpha = 0.1f), shape) else Modifier)
            .then(if (look == ButtonLook.Glass) Modifier.border(1.dp, Color.White.copy(alpha = 0.15f), shape) else Modifier)
            .focusRing(interaction, shape)
            .clickable(interaction, indication = LocalIndication.current, enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(contentPadding),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OnColor(if (dimmed) foreground.copy(alpha = 0.5f) else foreground) {
            ProvideTextStyle(MaterialTheme.typography.labelLarge) { content() }
        }
    }
}

/**
 * A round button with one icon, like the watched and favorite buttons on a
 * title. A circle smaller than 48dp still takes 48dp of layout, as
 * Material's icon buttons do, so its touch target never overlaps a
 * neighbour's.
 */
@Composable
fun RoundIconButton(
    @DrawableRes icon: Int,
    contentDescription: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 44.dp,
    iconSize: Dp = 20.dp,
    tint: Color = Palette.Foreground,
    background: Color = Palette.Secondary,
    enabled: Boolean = true,
) {
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier
            .minimumInteractiveComponentSize()
            .size(size)
            .clip(CircleShape)
            .background(background)
            .focusRing(interaction, CircleShape)
            .clickable(interaction, indication = LocalIndication.current, enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        LucideIcon(icon, contentDescription, size = iconSize, tint = tint)
    }
}

/**
 * A filter or library chip: filled when it's the current one, which screen
 * readers hear as selected. One with a [trailingIcon] acts, as removing a
 * filter does, so it's a plain button.
 */
@Composable
fun Chip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    frosted: Boolean = false,
    @DrawableRes trailingIcon: Int? = null,
) {
    val interaction = remember { MutableInteractionSource() }
    val shape = CircleShape
    Row(
        modifier
            .heightIn(min = 36.dp)
            .clip(shape)
            .background(
                when {
                    selected -> Palette.Foreground
                    frosted -> Palette.Background.copy(alpha = 0.4f)
                    else -> Color.Transparent
                },
            )
            .then(if (selected) Modifier else Modifier.border(BorderStroke(1.dp, Palette.Foreground.copy(alpha = 0.1f)), shape))
            .focusRing(interaction, shape)
            .then(
                if (trailingIcon == null) {
                    Modifier.selectable(selected, interaction, LocalIndication.current, role = Role.Tab, onClick = onClick)
                } else {
                    Modifier.clickable(interaction, indication = LocalIndication.current, role = Role.Button, onClick = onClick)
                },
            )
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        val color = if (selected) Palette.Background else Palette.Foreground.copy(alpha = 0.75f)
        Text(label, style = MaterialTheme.typography.labelLarge, color = color, maxLines = 1)
        if (trailingIcon != null) LucideIcon(trailingIcon, null, size = 14.dp, tint = color)
    }
}

/** A small rounded box with a short fact, like an age rating or "1080p". */
@Composable
fun Badge(text: String, modifier: Modifier = Modifier, outlined: Boolean = false) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = Palette.Foreground.copy(alpha = 0.85f),
        maxLines = 1,
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .then(
                if (outlined) Modifier.border(1.dp, Palette.Foreground.copy(alpha = 0.3f), RoundedCornerShape(4.dp))
                else Modifier.background(Palette.Foreground.copy(alpha = 0.12f)),
            )
            .padding(horizontal = 6.dp, vertical = 1.dp),
    )
}
