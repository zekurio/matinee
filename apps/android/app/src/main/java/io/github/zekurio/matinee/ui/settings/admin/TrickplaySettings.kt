package io.github.zekurio.matinee.ui.settings.admin

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.settings.SettingsScaffold
import io.github.zekurio.matinee.ui.theme.Palette

/** The seek bar's preview images, as the web's trickplay panel. */
@Composable
fun TrickplaySettings() {
    SettingsScaffold(stringResource(R.string.settings_admin_trickplay)) {
        // Not built yet.
        item(key = "todo") { Text("…", color = Palette.Muted) }
    }
}
