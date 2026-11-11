package io.github.zekurio.matinee.ui.tv

import androidx.annotation.DrawableRes
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.theme.Palette

/** The size TV buttons share, so a row of them lines up. */
object TvButtons {
    val Height: Dp = 48.dp
    val IconSize: Dp = 20.dp
}

/**
 * A pill button for TV pages and the player: its [icon], if any, and
 * [label], with [detail] after it, dimmer, like the time left, and a
 * [trailingIcon] at its end, like the chevron of one that opens a choice.
 * [active] marks one whose choice is in force, like a filter that narrows
 * a grid, in the accent. Focused it fills with the text color.
 */
@Composable
fun TvButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    @DrawableRes icon: Int? = null,
    detail: String? = null,
    @DrawableRes trailingIcon: Int? = null,
    active: Boolean = false,
    enabled: Boolean = true,
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val content = tvContent(focused, if (active) Palette.Accent else Palette.Foreground)
    Row(
        modifier
            .height(TvButtons.Height)
            .tvControl(focused, CircleShape, rest = if (active) Palette.AccentSoft else TvFocus.Rest)
            .tvClickable(interaction, enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(start = if (icon != null) 20.dp else 24.dp, end = if (trailingIcon != null) 16.dp else 24.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) LucideIcon(icon, null, size = TvButtons.IconSize, tint = content)
        Text(label, style = TvType.Facts, color = content, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (detail != null) {
            Text(detail, style = TvType.Facts, color = content.copy(alpha = 0.65f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (trailingIcon != null) LucideIcon(trailingIcon, null, size = 16.dp, tint = content.copy(alpha = 0.7f))
    }
}

/**
 * A round button beside a [TvButton], its icon alone until it takes
 * focus, when it opens to say [label]. [tint] colors the icon, like the
 * accent on a watched mark, while it's not focused.
 */
@Composable
fun TvIconButton(
    @DrawableRes icon: Int,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = Palette.Foreground,
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val content = tvContent(focused, tint)
    Row(
        modifier
            .height(TvButtons.Height)
            .widthIn(min = TvButtons.Height)
            .tvControl(focused, CircleShape)
            .tvClickable(interaction, role = Role.Button, onClickLabel = label, onClick = onClick)
            .padding(horizontal = 14.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LucideIcon(icon, label, size = TvButtons.IconSize, tint = content)
        AnimatedVisibility(
            focused,
            enter = expandHorizontally(Motion.enter()) + fadeIn(Motion.enter()),
            exit = shrinkHorizontally(Motion.exit()) + fadeOut(Motion.exit()),
        ) {
            Text(label, style = TvType.Facts, color = content, maxLines = 1, modifier = Modifier.padding(start = 10.dp, end = 4.dp))
        }
    }
}

/**
 * A round button that stays an icon, like the search field's clear or the
 * player's play and pause, [size] across. [label] names it for a screen
 * reader; [content] draws in [LocalContentColor]. Pass [interaction] to
 * know when it has focus.
 */
@Composable
fun TvRoundButton(
    label: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = TvButtons.Height,
    interaction: MutableInteractionSource = remember { MutableInteractionSource() },
    content: @Composable () -> Unit,
) {
    val focused by interaction.collectIsFocusedAsState()
    Box(
        modifier
            .size(size)
            .tvControl(focused, CircleShape)
            .tvClickable(interaction, role = Role.Button, onClickLabel = label, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        CompositionLocalProvider(LocalContentColor provides tvContent(focused), content = content)
    }
}

/** A [TvRoundButton] with an [icon]. */
@Composable
fun TvRoundButton(@DrawableRes icon: Int, label: String, onClick: () -> Unit, modifier: Modifier = Modifier, size: Dp = TvButtons.Height) {
    TvRoundButton(label, onClick, modifier, size) {
        LucideIcon(icon, label, size = size * 0.42f)
    }
}

/**
 * A small pill, like a genre or a studio that leads to its titles, or a
 * season's tab. [selected] marks the one in force, in the accent, as an
 * active [TvButton] is. Focused it fills with the text color.
 */
@Composable
fun TvChip(label: String, onClick: () -> Unit, modifier: Modifier = Modifier, selected: Boolean = false, role: Role = Role.Button) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    Text(
        label,
        style = TvType.Label,
        color = tvContent(focused, if (selected) Palette.Accent else Palette.Foreground),
        maxLines = 1,
        modifier = modifier
            .tvControl(focused, CircleShape, rest = if (selected) Palette.AccentSoft else TvFocus.Rest)
            .tvClickable(interaction, role = role, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 10.dp),
    )
}
