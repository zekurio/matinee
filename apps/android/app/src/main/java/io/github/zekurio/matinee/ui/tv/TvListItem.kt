package io.github.zekurio.matinee.ui.tv

import androidx.annotation.DrawableRes
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.theme.Palette

/** How list rows on TV pages and panels look: rounded, a quiet fill or none, and the text color filling them on focus. */
object TvListItems {
    val Shape = RoundedCornerShape(14.dp)
    val Height: Dp = 60.dp

    /** Between a row's edge and its content; text beside a list lines up with its rows' text by it. */
    val Inset: Dp = 20.dp
}

/**
 * A row of a TV list, like a server to connect to or a setting: an icon,
 * a title and a line under it, and [trailing] at its end, such as a value
 * or a switch. Focused, it fills with the text color and its content
 * inverts, as the drawer's entries and the player's menu do. [quiet] rows
 * have no fill until focused, for long lists like Settings; the rest have
 * a faint one, so a few large targets read as such. A [selected] row,
 * like the category whose rows show beside it, keeps a fill and the accent
 * while focus is elsewhere. A [checked] row, the choice in force in a
 * panel, has a check at its end. Content inside it reads
 * [LocalContentColor] to follow the inversion.
 */
@Composable
fun TvListItem(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    @DrawableRes icon: Int? = null,
    quiet: Boolean = false,
    selected: Boolean = false,
    destructive: Boolean = false,
    enabled: Boolean = true,
    checked: Boolean = false,
    minHeight: Dp = TvListItems.Height,
    subtitleStyle: TextStyle = TvType.Caption,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val rest = when {
        selected -> Palette.Foreground.copy(alpha = 0.1f)
        quiet -> Color.Transparent
        else -> Palette.Foreground.copy(alpha = 0.07f)
    }
    val content = tvContent(
        focused,
        when {
            !enabled -> Palette.Muted
            destructive -> Palette.Danger
            selected -> Palette.Accent
            else -> Palette.Foreground
        },
    )
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = minHeight)
            .tvControl(focused, TvListItems.Shape, rest = rest, scale = TvFocus.ROW_SCALE)
            .tvClickable(interaction, enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(horizontal = TvListItems.Inset, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        CompositionLocalProvider(LocalContentColor provides content) {
            if (leading != null) {
                leading()
            } else if (icon != null) {
                LucideIcon(icon, null, size = 24.dp, tint = if (focused || destructive || selected) content else Palette.Foreground.copy(alpha = 0.7f))
            }
            Column(Modifier.weight(1f)) {
                Text(title, style = TvType.Facts, color = content, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (subtitle != null) {
                    Text(
                        subtitle,
                        style = subtitleStyle,
                        color = if (focused) Palette.Background.copy(alpha = 0.7f) else Palette.Muted,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (trailing != null) trailing()
            if (checked) LucideIcon(Lucide.Check, null, size = 22.dp, tint = if (focused) content else Palette.Accent)
        }
    }
}

/** A setting's value at the end of its row, with the chevron of a row that opens a choice. */
@Composable
fun RowScope.TvListValue(value: String, chevron: Boolean = true) {
    val color = LocalContentColor.current
    Text(
        value,
        style = TvType.Label,
        color = color.copy(alpha = 0.7f),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.widthIn(max = 240.dp),
    )
    if (chevron) LucideIcon(Lucide.ChevronRight, null, size = 20.dp, tint = color.copy(alpha = 0.6f))
}

/** An on and off switch at the end of a row, drawn in the row's content color so it reads focused or not. */
@Composable
fun TvListSwitch(checked: Boolean) {
    val color = LocalContentColor.current
    val knob by animateFloatAsState(if (checked) 1f else 0f, Motion.move(), label = "switchKnob")
    val track = if (checked) Palette.Accent else color.copy(alpha = 0.25f)
    Box(
        Modifier
            .size(width = 48.dp, height = 28.dp)
            .clip(CircleShape)
            .background(track),
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(
            Modifier
                .offset(x = 4.dp + 20.dp * knob)
                .size(20.dp)
                .clip(CircleShape)
                .background(if (checked) Palette.AccentForeground else color.copy(alpha = 0.9f)),
        )
    }
}

/** A heading over a group of rows in a TV list. */
@Composable
fun TvListHeading(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = TvType.Label,
        color = Palette.Muted,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier.padding(start = TvListItems.Inset, top = 12.dp, bottom = 4.dp),
    )
}
