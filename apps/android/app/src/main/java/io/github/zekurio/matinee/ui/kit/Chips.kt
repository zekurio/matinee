package io.github.zekurio.matinee.ui.kit

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.zekurio.matinee.ui.theme.Palette

/*
 * The filter panel's chips (apps/web's filter-panel, `smallChip`): smaller
 * than a page's [Chip], 40dp tall for a finger as the web's are on a touch
 * screen, filled with the foreground when on. A [ChoiceChip] is one of a
 * radio group, put the group in `Modifier.selectableGroup()`; a
 * [ToggleChip] turns on and off by itself, as the web's `aria-pressed`
 * buttons. Either can say how many titles it stands for after its label.
 */

/** One of a few, of which one is picked: a radio button to screen readers. */
@Composable
fun ChoiceChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, count: String? = null) {
    val interaction = remember { MutableInteractionSource() }
    SmallChip(
        label,
        count,
        selected,
        interaction,
        modifier.selectable(selected, interaction, LocalIndication.current, role = Role.RadioButton, onClick = onClick),
    )
}

/** A choice that turns on and off by itself, among others that do too. */
@Composable
fun ToggleChip(label: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit, modifier: Modifier = Modifier, count: String? = null) {
    val interaction = remember { MutableInteractionSource() }
    SmallChip(
        label,
        count,
        checked,
        interaction,
        modifier.toggleable(checked, interaction, LocalIndication.current, role = Role.Checkbox, onValueChange = onCheckedChange),
    )
}

@Composable
private fun SmallChip(label: String, count: String?, on: Boolean, interaction: MutableInteractionSource, pressable: Modifier) {
    val shape = CircleShape
    Row(
        Modifier
            .heightIn(min = 40.dp)
            .clip(shape)
            .background(if (on) Palette.Foreground else Color.Transparent)
            .border(1.dp, if (on) Color.Transparent else Palette.Foreground.copy(alpha = 0.15f), shape)
            .focusRing(interaction, shape)
            .then(pressable)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        val style = MaterialTheme.typography.labelLarge.copy(fontSize = 13.sp, fontWeight = FontWeight.Medium)
        Text(label, style = style, color = if (on) Palette.Background else Palette.Foreground.copy(alpha = 0.8f), maxLines = 1)
        if (count != null) {
            Text(count, style = style, color = if (on) Palette.Background.copy(alpha = 0.7f) else Palette.Muted, maxLines = 1)
        }
    }
}
