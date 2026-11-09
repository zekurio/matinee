package io.github.zekurio.matinee.ui.settings.admin

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.settings.SettingsScaffold
import io.github.zekurio.matinee.ui.theme.Palette

/** How people sign in: passkeys, open registration, and the OIDC provider, as the web's authentication panel. */
@Composable
fun AuthenticationSettings() {
    SettingsScaffold(stringResource(R.string.settings_admin_authentication)) {
        // Not built yet.
        item(key = "todo") { Text("…", color = Palette.Muted) }
    }
}
