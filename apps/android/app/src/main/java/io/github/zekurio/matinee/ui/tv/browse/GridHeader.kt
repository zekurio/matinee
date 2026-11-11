package io.github.zekurio.matinee.ui.tv.browse

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.Overscan
import io.github.zekurio.matinee.ui.tv.TvFocusLine
import io.github.zekurio.matinee.ui.tv.TvPage
import io.github.zekurio.matinee.ui.tv.TvType
import io.github.zekurio.matinee.ui.tv.home.FocusedItem
import io.github.zekurio.matinee.ui.tv.tvFocus

/** Clear of the clock at the top right. */
private val CLOCK_ROOM = 140.dp

/** The key a grid page's controls have in its focus memory. */
internal const val CONTROLS = "controls"

/**
 * The top of a grid page: its [title] with [detail] after it, like a
 * count, a row of [controls] under them, and the focused card's name and
 * facts above the grid.
 */
@Composable
internal fun GridHeader(title: String, detail: String?, focused: FocusedItem?, controls: @Composable RowScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().padding(start = TvPage.Start, top = Overscan.Vertical + 6.dp)) {
        Row(Modifier.padding(end = TvPage.End + CLOCK_ROOM), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(
                title,
                style = TvType.Headline,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.alignByBaseline().weight(1f, fill = false),
            )
            if (detail != null) Text(detail, style = TvType.Facts, color = Palette.Muted, maxLines = 1, modifier = Modifier.alignByBaseline())
        }
        Row(
            Modifier.padding(top = 16.dp, end = TvPage.End).height(48.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            content = controls,
        )
        TvFocusLine(focused, Modifier.padding(top = 18.dp, end = TvPage.End))
    }
}

/**
 * A control in a grid page's row: an icon and what's in force, like the
 * sort's order. [active] marks a filter that narrows the grid, in the
 * accent, so it shows from across the room that not everything is there.
 */
@Composable
internal fun ControlButton(icon: Int, label: String, onClick: () -> Unit, modifier: Modifier = Modifier, active: Boolean = false, chevron: Boolean = true) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val fill by animateColorAsState(
        when {
            focused -> Palette.Foreground
            active -> Palette.AccentSoft
            else -> Palette.Foreground.copy(alpha = 0.1f)
        },
        Motion.color(),
        label = "controlFill",
    )
    val content = when {
        focused -> Palette.Background
        active -> Palette.Accent
        else -> Palette.Foreground
    }
    Row(
        modifier
            .height(44.dp)
            .tvFocus(interaction, CircleShape, scale = 1.05f)
            .clip(CircleShape)
            .background(fill)
            .clickable(interaction, indication = null, role = Role.Button, onClick = onClick)
            .padding(start = 18.dp, end = if (chevron) 14.dp else 20.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LucideIcon(icon, null, size = 18.dp, tint = content)
        Text(label, style = TvType.Label, color = content, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (chevron) LucideIcon(Lucide.ChevronDown, null, size = 16.dp, tint = content.copy(alpha = 0.7f))
    }
}
