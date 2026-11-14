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
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.theme.Appearance
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.theme.ThemeColors
import io.github.zekurio.matinee.ui.theme.ThemeMode
import io.github.zekurio.matinee.ui.theme.ThemeState

/*
 * Appearance, as the web's: the color scheme as three miniatures of the
 * app, in Matinee's colors with the server's accent. Android 12 and later
 * can take the wallpaper's colors instead.
 */

@Composable
internal fun AppearancePage() {
    val store = LocalContext.current.app.theme
    val api = LocalApi.current
    val offline = LocalOffline.current
    val state = store.state
    // An accent an admin changed since the app started comes in when the page opens.
    LaunchedEffect(offline) { if (!offline) store.pull(api) }
    SettingsScaffold(stringResource(R.string.settings_page_appearance)) {
        item(key = "scheme") {
            Section(stringResource(R.string.web_appearance_colorScheme)) {
                SchemePicker(state, store::setMode)
                if (store.materialYouAvailable) {
                    Gap(14.dp)
                    Panel {
                        SwitchRow(stringResource(R.string.appearance_material_you), state.materialYou, onChange = store::setMaterialYou)
                    }
                }
            }
        }
    }
}

/** System, Light, and Dark, each a miniature of the app in the theme that mode shows. */
@Composable
private fun SchemePicker(state: ThemeState, onPick: (ThemeMode) -> Unit) {
    val light = state.light
    val dark = state.dark
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
