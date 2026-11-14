package io.github.zekurio.matinee.ui.kit

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * A square box that ticks, as the web's Checkbox: 18dp, `rounded-[5px]`,
 * an `--input-hover` border, and the accent with a check in it once
 * checked, like the [Switch]. With no [onCheckedChange] it only shows,
 * for a row that toggles it itself; otherwise it takes a finger's room.
 */
@Composable
fun Checkbox(checked: Boolean, onCheckedChange: ((Boolean) -> Unit)?, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val fill by animateColorAsState(if (checked) Palette.Accent else Color.Transparent, Motion.color(), label = "fill")
    val border by animateColorAsState(if (checked) Palette.Accent else Palette.InputHover, Motion.color(), label = "border")
    Box(
        modifier
            .then(
                if (onCheckedChange != null) {
                    Modifier
                        .minimumInteractiveComponentSize()
                        .toggleable(checked, interactionSource = null, indication = null, enabled = enabled, role = Role.Checkbox, onValueChange = onCheckedChange)
                } else {
                    Modifier
                },
            )
            .alpha(if (enabled) 1f else 0.5f),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(18.dp).clip(BoxShape).background(fill).border(1.dp, border, BoxShape),
            contentAlignment = Alignment.Center,
        ) {
            if (checked) LucideIcon(Lucide.Check, null, size = 14.dp, tint = Palette.AccentForeground)
        }
    }
}

private val BoxShape = RoundedCornerShape(5.dp)
