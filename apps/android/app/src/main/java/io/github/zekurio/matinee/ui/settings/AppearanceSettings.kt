package io.github.zekurio.matinee.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.LocalOffline
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.theme.Appearance
import io.github.zekurio.matinee.ui.theme.DefaultThemes
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.theme.ThemeColors
import io.github.zekurio.matinee.ui.theme.ThemeFamily
import io.github.zekurio.matinee.ui.theme.ThemeMode
import io.github.zekurio.matinee.ui.theme.ThemeState
import io.github.zekurio.matinee.ui.theme.ThemeStore
import io.github.zekurio.matinee.ui.theme.ThemeVariant

/*
 * Appearance, as the web's: the color scheme as three miniatures of the
 * app, whether the theme follows the account, and the themes as cards with
 * a swatch per variant. Themes are made and edited on the web; the
 * account's show up here to pick, with Material You besides on Android 12
 * and later.
 */

@Composable
internal fun AppearancePage() {
    val store = LocalContext.current.app.theme
    val api = LocalApi.current
    val user = LocalUser.current
    val state = store.state
    val offline = LocalOffline.current
    // Themes made on the web since the app started come in when the page opens.
    LaunchedEffect(offline) { if (!offline) store.pull(api, user) }
    SettingsScaffold(stringResource(R.string.settings_page_appearance)) {
        item(key = "scheme") {
            Section(stringResource(R.string.web_appearance_colorScheme)) {
                SchemePicker(state, store::setMode)
                Gap(14.dp)
                Panel { SwitchRow(stringResource(R.string.web_appearance_sync_title), state.sync, onChange = store::setSync) }
            }
        }
        item(key = "themes") {
            Section(stringResource(R.string.web_appearance_themes)) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    state.families.forEach { family -> ThemeCard(family, state, store) }
                }
            }
        }
    }
}

/** System, Light, and Dark, each a miniature of the app in the theme that mode shows. */
@Composable
private fun SchemePicker(state: ThemeState, onPick: (ThemeMode) -> Unit) {
    val light = state.colorsOf(state.light)
    val dark = state.colorsOf(state.dark)
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        ThemeMode.entries.forEach { mode ->
            val selected = state.mode == mode
            val shape = RoundedCornerShape(12.dp)
            Column(
                Modifier
                    .weight(1f)
                    .clip(shape)
                    .background(if (selected) Palette.AccentSoft else Palette.Foreground.copy(alpha = 0.02f))
                    .border(1.dp, if (selected) Palette.Accent else Palette.Border, shape)
                    .clickable(role = Role.RadioButton) { onPick(mode) }
                    .padding(6.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                when (mode) {
                    ThemeMode.System -> Box {
                        Miniature(light)
                        // Dark takes the right half.
                        Miniature(dark, Modifier.drawWithContent { clipRect(left = size.width / 2) { this@drawWithContent.drawContent() } })
                    }
                    ThemeMode.Light -> Miniature(light)
                    ThemeMode.Dark -> Miniature(dark)
                }
                Text(
                    stringResource(
                        when (mode) {
                            ThemeMode.System -> R.string.web_appearance_colorScheme_system
                            ThemeMode.Light -> R.string.web_appearance_colorScheme_light
                            ThemeMode.Dark -> R.string.web_appearance_colorScheme_dark
                        },
                    ),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (selected) Palette.Foreground else Palette.Muted,
                    maxLines = 1,
                    modifier = Modifier.padding(horizontal = 2.dp),
                )
            }
        }
    }
}

/** The home page in [colors]: the floating bar over the banner, its button, and a row of posters. */
@Composable
private fun Miniature(colors: ThemeColors, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(8.dp)
    Box(
        modifier
            .fillMaxWidth()
            .aspectRatio(16 / 10f)
            .clip(shape)
            .background(colors.background)
            .border(1.dp, colors.border, shape),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.6f)
                .background(Brush.verticalGradient(listOf(colors.borderStrong, colors.background))),
        )
        Box(
            Modifier
                .align(Alignment.TopCenter)
                .padding(top = 4.dp)
                .fillMaxWidth(0.42f)
                .height(6.dp)
                .clip(CircleShape)
                .background(colors.background.copy(alpha = 0.6f))
                .border(0.5.dp, colors.text.copy(alpha = 0.12f), CircleShape),
        )
        Column(Modifier.align(Alignment.CenterStart).padding(start = 6.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Box(Modifier.width(22.dp).height(3.dp).clip(CircleShape).background(colors.text))
            Box(Modifier.width(14.dp).height(5.dp).clip(CircleShape).background(colors.accent))
        }
        Row(
            Modifier.align(Alignment.BottomStart).padding(5.dp),
            horizontalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            repeat(5) { Box(Modifier.size(9.dp, 13.dp).clip(RoundedCornerShape(2.dp)).background(colors.surfaceRaised)) }
        }
    }
}

/**
 * A theme as a paint chip: a striped swatch per variant across the top,
 * then its name and the variants it lends to light and dark mode now.
 * The card picks the whole theme; a swatch, just its variant.
 */
@Composable
private fun ThemeCard(family: ThemeFamily, state: ThemeState, store: ThemeStore) {
    val shape = RoundedCornerShape(12.dp)
    val used = Appearance.entries.mapNotNull { appearance ->
        state.variant(appearance).takeIf { it in family.variants }?.let { appearance to it }
    }
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Palette.Foreground.copy(alpha = 0.02f))
            .border(1.dp, if (used.isNotEmpty()) Palette.Accent.copy(alpha = 0.55f) else Palette.Border, shape)
            .clickable { store.selectFamily(family) },
    ) {
        Row(
            Modifier.fillMaxWidth().height(64.dp).background(Palette.Border),
            horizontalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            family.variants.forEach { variant ->
                Swatch(
                    family = family,
                    variant = variant,
                    colors = state.colorsOf(variant),
                    slot = variant.appearance.takeIf { state.variant(it).id == variant.id },
                    shown = state.variant(state.appearance).id == variant.id,
                    modifier = Modifier.weight(1f),
                ) { store.selectVariant(variant) }
            }
        }
        Row(Modifier.padding(horizontal = 12.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(family.label, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (used.isEmpty()) {
                    Text(
                        pluralStringResource(R.plurals.web_themes_card_variants, family.variants.size, family.variants.size),
                        style = MaterialTheme.typography.bodySmall,
                        color = Palette.Muted,
                    )
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        used.forEach { (appearance, variant) ->
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                                LucideIcon(if (appearance == Appearance.Light) Lucide.Sun else Lucide.Moon, null, size = 12.dp, tint = Palette.Muted)
                                Text(
                                    variantName(family, variant),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Palette.Muted,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * One variant as diagonal bands of its background, accent, and text, with
 * its status colors as dots in the corner. The chip marks the mode it's
 * used for, filled with the accent while it's the one on screen.
 */
@Composable
private fun Swatch(
    family: ThemeFamily,
    variant: ThemeVariant,
    colors: ThemeColors,
    slot: Appearance?,
    shown: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val name = variantName(family, variant)
    val description = when (slot) {
        Appearance.Light -> stringResource(R.string.web_themes_card_usedLight, name)
        Appearance.Dark -> stringResource(R.string.web_themes_card_usedDark, name)
        null -> name
    }
    Box(
        modifier
            .fillMaxHeight()
            .background(
                Brush.linearGradient(
                    0f to colors.background, 0.5f to colors.background,
                    0.5f to colors.accent, 0.75f to colors.accent,
                    0.75f to colors.text, 1f to colors.text,
                ),
            )
            .clickable(role = Role.RadioButton, onClick = onClick)
            .semantics { contentDescription = description },
    ) {
        Row(Modifier.align(Alignment.TopEnd).padding(6.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            listOf(colors.success, colors.warning, colors.danger).forEach { dot ->
                Box(Modifier.size(7.dp).clip(CircleShape).background(colors.background).padding(1.dp).clip(CircleShape).background(dot))
            }
        }
        if (slot != null) {
            Box(
                Modifier
                    .align(Alignment.BottomStart)
                    .padding(6.dp)
                    .size(20.dp)
                    .clip(CircleShape)
                    .background(if (shown) Palette.Accent else Palette.Background.copy(alpha = 0.85f)),
                contentAlignment = Alignment.Center,
            ) {
                LucideIcon(
                    if (slot == Appearance.Light) Lucide.Sun else Lucide.Moon,
                    null,
                    size = 12.dp,
                    tint = if (shown) Palette.AccentForeground else Palette.Foreground,
                )
            }
        }
    }
}

/**
 * A variant's name in its theme: Matinee's, Material You's, and unnamed
 * ones go by their appearance, numbered when a theme has several; the
 * rest drop the theme's name, as "Frappé" for Catppuccin Frappé.
 */
@Composable
private fun variantName(family: ThemeFamily, variant: ThemeVariant): String {
    val res = LocalResources.current
    val byAppearance = variant.label.isBlank() || DefaultThemes.isMatinee(variant.id) ||
        family.id == ThemeStore.MATERIAL_YOU
    if (!byAppearance) return variant.label.removePrefix(family.label).trim().ifEmpty { variant.label }
    val name = res.getString(if (variant.appearance == Appearance.Light) R.string.web_themes_editor_light else R.string.web_themes_editor_dark)
    val siblings = family.variants.filter { it.appearance == variant.appearance && (it.label.isBlank() || !family.custom) }
    return if (siblings.size > 1) "$name ${siblings.indexOf(variant) + 1}" else name
}
