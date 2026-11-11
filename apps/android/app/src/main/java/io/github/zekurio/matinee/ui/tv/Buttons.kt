package io.github.zekurio.matinee.ui.tv

import androidx.annotation.DrawableRes
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.theme.Palette

/** How tall the buttons under a TV page's heading are. */
private val BUTTON_HEIGHT = 52.dp

/**
 * The page's main button, like Play: its icon and [label] always shown,
 * with [detail] after it, dimmer, like the time left. Focused it fills
 * with the text color as [TvButton] does.
 */
@Composable
fun TvMainButton(
    @DrawableRes icon: Int,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    detail: String? = null,
    enabled: Boolean = true,
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val content = if (focused) Palette.Background else Palette.Foreground
    Row(
        modifier
            .height(BUTTON_HEIGHT)
            .widthIn(min = 180.dp)
            .tvFocus(interaction, CircleShape, scale = 1.05f)
            .clip(CircleShape)
            .background(if (focused) Palette.Foreground else Palette.Foreground.copy(alpha = 0.16f))
            .clickable(interaction, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(start = 24.dp, end = 28.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LucideIcon(icon, null, size = 20.dp, tint = content)
        Text(label, style = TvType.Facts, color = content, maxLines = 1)
        if (detail != null) {
            Text(detail, style = TvType.Facts, color = content.copy(alpha = 0.65f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/**
 * A round button beside [TvMainButton], its icon alone until it takes
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
    val content = if (focused) Palette.Background else tint
    Row(
        modifier
            .height(BUTTON_HEIGHT)
            .widthIn(min = BUTTON_HEIGHT)
            .tvFocus(interaction, CircleShape, scale = 1.05f)
            .clip(CircleShape)
            .background(if (focused) Palette.Foreground else Palette.Foreground.copy(alpha = 0.12f))
            .clickable(interaction, indication = null, role = Role.Button, onClickLabel = label, onClick = onClick)
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LucideIcon(icon, label, size = 20.dp, tint = content)
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
 * A small pill that leads somewhere, like a genre or a studio. Focused it
 * fills with the text color.
 */
@Composable
fun TvChip(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    Text(
        label,
        style = TvType.Label,
        color = if (focused) Palette.Background else Palette.Foreground,
        maxLines = 1,
        modifier = modifier
            .tvFocus(interaction, CircleShape, scale = 1.05f)
            .clip(CircleShape)
            .background(if (focused) Palette.Foreground else Palette.Foreground.copy(alpha = 0.10f))
            .clickable(interaction, indication = null, role = Role.Button, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 10.dp),
    )
}
