package io.github.zekurio.matinee.ui.settings.admin

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.settings.SettingsScaffold
import io.github.zekurio.matinee.ui.theme.Palette

/** The libraries: their folders, kind, and metadata provider, with scanning and refreshing, as the web's libraries panel. */
@Composable
fun LibrariesSettings() {
    SettingsScaffold(stringResource(R.string.settings_admin_libraries)) {
        // Not built yet.
        item(key = "todo") { Text("…", color = Palette.Muted) }
    }
}
