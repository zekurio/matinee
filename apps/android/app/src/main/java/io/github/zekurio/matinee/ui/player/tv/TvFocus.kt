package io.github.zekurio.matinee.ui.player.tv

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.theme.Palette

/*
 * The TV player's focus look. A remote has no pointer, so the focused
 * control has to read from across the room on any picture: it fills with
 * the foreground color, its content turns dark, and it grows a little.
 * Everything else stays a quiet glass shape. This is the player's own copy;
 * the shared TV package may want the same look for its buttons.
 */

/** What a TV control's focus does to it: grow by this much. */
internal const val TV_FOCUS_SCALE = 1.1f

/** The fill behind a control at rest, so its shape shows over video. */
internal val TvGlass = Color.White.copy(alpha = 0.12f)

/** The fill and content colors of a control, by whether it has focus. */
@Composable
internal fun tvColors(focused: Boolean): Pair<Color, Color> {
    val fill by animateColorAsState(if (focused) Palette.Foreground else TvGlass, tween(Motion.COLOR_MS), label = "tv fill")
    val content by animateColorAsState(if (focused) Palette.Background else Palette.Foreground, tween(Motion.COLOR_MS), label = "tv content")
    return fill to content
}

/** Grows a focused control from its center. */
internal fun Modifier.tvScale(scale: () -> Float): Modifier = graphicsLayer {
    val s = scale()
    scaleX = s
    scaleY = s
}

/**
 * A button on the TV player: a circle for an icon, or a pill with
 * [padding] for an icon and a word. [content] gets the color to draw in.
 */
@Composable
internal fun TvButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    shape: Shape = CircleShape,
    size: Dp = 56.dp,
    padding: PaddingValues = PaddingValues(0.dp),
    interaction: MutableInteractionSource = remember { MutableInteractionSource() },
    content: @Composable RowScope.(Color) -> Unit,
) {
    val focused by interaction.collectIsFocusedAsState()
    val scale by animateFloatAsState(if (focused) TV_FOCUS_SCALE else 1f, tween(Motion.COLOR_MS), label = "tv scale")
    val (fill, tint) = tvColors(focused)
    Row(
        modifier
            .tvScale { scale }
            .heightIn(min = size)
            .widthIn(min = size)
            .clip(shape)
            .background(fill)
            .clickable(interaction, indication = null, role = Role.Button, onClick = onClick)
            .padding(padding),
        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        content(tint)
    }
}
