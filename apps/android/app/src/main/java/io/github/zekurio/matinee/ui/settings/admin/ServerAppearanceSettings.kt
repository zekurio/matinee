package io.github.zekurio.matinee.ui.settings.admin

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.admin.ThemeAccents
import io.github.zekurio.matinee.api.admin.setThemeAccents
import io.github.zekurio.matinee.api.admin.themeAccents
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.settings.Panel
import io.github.zekurio.matinee.ui.settings.RowDivider
import io.github.zekurio.matinee.ui.settings.Section
import io.github.zekurio.matinee.ui.settings.SettingsScaffold
import io.github.zekurio.matinee.ui.theme.Palette

/** The Matinee theme's own accents, as packages/ui's theme-colors has them. */
private const val DEFAULT_LIGHT = "#3b5bdb"
private const val DEFAULT_DARK = "#6d8cf5"

/** Starting points, Matinee's own first, a shade per appearance, as the web offers them. */
private val PRESETS = listOf(
    DEFAULT_LIGHT to DEFAULT_DARK,
    "#0369a1" to "#38bdf8",
    "#0f766e" to "#2dd4bf",
    "#13793a" to "#4ade80",
    "#975c06" to "#facc15",
    "#bb3e0b" to "#fb923c",
    "#be123c" to "#f43f5e",
    "#be185d" to "#ec4899",
)

private val HEX = Regex("^#[0-9a-f]{6}$")

/** "#ABC" or "abcdef" as `#rrggbb`, or null when it isn't a color. */
private fun normalize(text: String): String? {
    val digits = text.trim().removePrefix("#").lowercase()
    val full = if (digits.length == 3) digits.map { "$it$it" }.joinToString("") else digits
    return "#$full".takeIf { HEX.matches(it) }
}

/** What the server stores for [color]: null for the theme's own accent. */
private fun stored(color: String, default: String): String? = normalize(color)?.takeIf { it != default }

private fun color(hex: String): Color = Color(android.graphics.Color.parseColor(hex))

/**
 * The accent the Matinee theme uses for everyone on the server, as the
 * web's server appearance panel: a preset, or a color per appearance.
 */
@Composable
fun ServerAppearanceSettings() {
    val api = LocalApi.current
    val loader = rememberLoader("admin-appearance") { themeAccents() }
    val saver = rememberSaver()
    SettingsScaffold(stringResource(R.string.settings_admin_appearance)) {
        loaded(loader, { stringResource(R.string.web_serverAppearance_loadFailed, it) }) { saved ->
            item(key = "accents") {
                AccentForm(saved, saver) { next -> saver { loader.show(api.setThemeAccents(next)) } }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AccentForm(saved: ThemeAccents, saver: Saver, save: (ThemeAccents) -> Unit) {
    var light by remember(saved) { mutableStateOf(saved.light ?: DEFAULT_LIGHT) }
    var dark by remember(saved) { mutableStateOf(saved.dark ?: DEFAULT_DARK) }
    val draft = ThemeAccents(stored(light, DEFAULT_LIGHT), stored(dark, DEFAULT_DARK))
    val valid = normalize(light) != null && normalize(dark) != null
    Column {
        Section(stringResource(R.string.web_serverAppearance_title)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                PRESETS.forEachIndexed { index, (presetLight, presetDark) ->
                    val name = if (index == 0) stringResource(R.string.web_serverAppearance_default) else "$presetLight / $presetDark"
                    Swatch(presetLight, presetDark, normalize(light) == presetLight && normalize(dark) == presetDark, name) {
                        light = presetLight
                        dark = presetDark
                    }
                }
            }
            Gap(16.dp)
            Panel {
                ColorRow(stringResource(R.string.web_serverAppearance_mode_light), light) { light = it }
                RowDivider()
                ColorRow(stringResource(R.string.web_serverAppearance_mode_dark), dark) { dark = it }
            }
        }
        Gap(16.dp)
        SaveButtons(
            dirty = valid && draft != saved,
            saver = saver,
            onReset = {
                light = saved.light ?: DEFAULT_LIGHT
                dark = saved.dark ?: DEFAULT_DARK
            },
        ) { save(draft) }
    }
}

/** A preset: the light accent and the dark one, split on a diagonal, ringed when picked. */
@Composable
private fun Swatch(light: String, dark: String, selected: Boolean, name: String, onClick: () -> Unit) {
    Box(
        Modifier
            .size(40.dp)
            .then(if (selected) Modifier.border(2.dp, Palette.Foreground, CircleShape) else Modifier)
            .padding(4.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .semantics { contentDescription = name },
    ) {
        Canvas(Modifier.size(32.dp)) {
            drawRect(color(dark))
            drawPath(
                Path().apply {
                    moveTo(0f, 0f)
                    lineTo(size.width, 0f)
                    lineTo(0f, size.height)
                    close()
                },
                color(light),
            )
        }
    }
}

/** A hex field with the color it names beside it. */
@Composable
private fun ColorRow(label: String, value: String, onChange: (String) -> Unit) {
    val parsed = normalize(value)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(end = 16.dp),
    ) {
        Box(Modifier.weight(1f)) {
            TextRow(label, value, onChange, placeholder = "#rrggbb", error = if (parsed == null) "#rrggbb" else null)
        }
        Box(
            Modifier
                .size(32.dp)
                .clip(CircleShape)
                .border(1.dp, Palette.Border, CircleShape)
                .then(if (parsed != null) Modifier.background(color(parsed), CircleShape) else Modifier),
        )
    }
}
