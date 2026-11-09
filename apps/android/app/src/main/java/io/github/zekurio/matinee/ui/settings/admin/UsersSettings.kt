package io.github.zekurio.matinee.ui.settings.admin

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.settings.SettingsScaffold
import io.github.zekurio.matinee.ui.theme.Palette

/** Everyone's accounts: roles, signing them out, and deleting them, as the web's users panel. */
@Composable
fun UsersSettings() {
    SettingsScaffold(stringResource(R.string.settings_admin_users)) {
        // Not built yet.
        item(key = "todo") { Text("…", color = Palette.Muted) }
    }
}
