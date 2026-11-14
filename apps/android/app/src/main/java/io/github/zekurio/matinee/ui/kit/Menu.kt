package io.github.zekurio.matinee.ui.kit

import androidx.annotation.DrawableRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * A menu that opens from what was pressed, as the web's DropdownMenu: the
 * popover's color, `rounded-xl`, a hairline ring and a deep shadow, at
 * least `min-w-40` wide. Material's menu underneath places it.
 */
@Composable
fun Menu(expanded: Boolean, onDismissRequest: () -> Unit, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    DropdownMenu(
        expanded = expanded,
        onDismissRequest = onDismissRequest,
        modifier = modifier.widthIn(min = 160.dp).padding(horizontal = 4.dp),
        shape = Shapes.Xl,
        containerColor = Palette.Raised,
        tonalElevation = 0.dp,
        shadowElevation = 12.dp,
        border = BorderStroke(1.dp, Palette.Ring),
        content = content,
    )
}

/**
 * A row in a [Menu], as the web's DropdownMenuItem: `rounded-md`, `text-sm`,
 * an optional icon before it and a check after it when it's [selected].
 */
@Composable
fun MenuItem(
    label: String,
    onClick: () -> Unit,
    @DrawableRes icon: Int? = null,
    selected: Boolean = false,
    destructive: Boolean = false,
) {
    val color = if (destructive) Palette.Danger else Palette.Foreground
    Row(
        Modifier
            .fillMaxWidth()
            .clip(Shapes.Md)
            .clickable(role = Role.Button, onClick = onClick)
            // px-2, and py-2.5 for a finger.
            .padding(horizontal = 8.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) LucideIcon(icon, null, size = 16.dp, tint = color)
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = color,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (selected) LucideIcon(Lucide.Check, null, size = 16.dp, tint = color, modifier = Modifier.padding(start = 16.dp))
    }
}
