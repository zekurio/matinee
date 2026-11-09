package io.github.zekurio.matinee.ui.settings

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.theme.Palette

/* The rows Settings is built from, as the web's setting-controls. */

val PanelShape = RoundedCornerShape(12.dp)

@Composable
fun Section(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column {
        Text(title, style = MaterialTheme.typography.titleLarge)
        Gap(14.dp)
        content()
    }
}

/** A card of rows, with lines between them. */
@Composable
fun Panel(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(PanelShape).background(Palette.Card).border(1.dp, Palette.Border, PanelShape),
        content = content,
    )
}

@Composable
fun RowDivider() = HorizontalDivider(color = Palette.Border)

/** A row's title, taking the room its control leaves. */
@Composable
private fun androidx.compose.foundation.layout.RowScope.RowText(title: String, color: Color = Palette.Foreground) {
    Text(title, style = MaterialTheme.typography.bodyLarge, color = color, modifier = Modifier.weight(1f))
}

/** A choice among [options], shown at the row's end and picked from a menu that opens there. */
@Composable
fun <T> PickerRow(title: String, options: List<Pair<T, String>>, current: T, onPick: (T) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.fillMaxWidth().clickable { open = true }.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RowText(title)
            Gap(12.dp)
            Text(
                options.firstOrNull { it.first == current }?.second ?: current.toString(),
                style = MaterialTheme.typography.bodyMedium,
                color = Palette.Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(max = 160.dp),
            )
            LucideIcon(Lucide.ChevronDown, null, size = 16.dp, tint = Palette.Muted, modifier = Modifier.padding(start = 4.dp))
        }
        // Anchored to a point under the chevron: the menu never fits to the right of it, so it
        // lines its right edge up with the chevron's instead of opening at the row's left.
        Box(Modifier.align(Alignment.BottomEnd).offset(x = (-16).dp)) {
            DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = Palette.Raised) {
                options.forEach { (value, label) ->
                    DropdownMenuItem(
                        text = { Text(label) },
                        trailingIcon = if (value == current) ({ LucideIcon(Lucide.Check, null, size = 16.dp) }) else null,
                        onClick = {
                            open = false
                            if (value != current) onPick(value)
                        },
                    )
                }
            }
        }
    }
}

@Composable
fun SwitchRow(title: String, checked: Boolean, @DrawableRes icon: Int? = null, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            LucideIcon(icon, null, size = 20.dp, tint = Palette.Muted)
            Gap(14.dp)
        }
        RowText(title)
        Gap(12.dp)
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(checkedTrackColor = Palette.Accent, checkedThumbColor = Palette.AccentForeground),
        )
    }
}

/** A row that only tells something, its value at its end. */
@Composable
fun ValueRow(title: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        RowText(title)
        Gap(12.dp)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
    }
}

/** A row that goes somewhere else, like the system's settings, with what's set there at its end. */
@Composable
fun LinkRow(title: String, value: String? = null, destructive: Boolean = false, @DrawableRes icon: Int? = null, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            LucideIcon(icon, null, size = 20.dp, tint = if (destructive) Palette.Danger else Palette.Muted)
            Gap(14.dp)
        }
        RowText(title, if (destructive) Palette.Danger else Palette.Foreground)
        if (value != null) {
            Gap(12.dp)
            Text(
                value,
                style = MaterialTheme.typography.bodyMedium,
                color = Palette.Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.widthIn(max = 160.dp),
            )
        }
        if (!destructive) LucideIcon(Lucide.ChevronRight, null, size = 16.dp, tint = Palette.Muted, modifier = Modifier.padding(start = 4.dp))
    }
}
