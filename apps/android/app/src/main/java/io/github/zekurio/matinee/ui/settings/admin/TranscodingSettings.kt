package io.github.zekurio.matinee.ui.settings.admin

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.settings.SettingsScaffold
import io.github.zekurio.matinee.ui.theme.Palette

/** How the server encodes video, as the web's transcoding panel. */
@Composable
fun TranscodingSettings() {
    SettingsScaffold(stringResource(R.string.settings_admin_transcoding)) {
        // Not built yet.
        item(key = "todo") { Text("…", color = Palette.Muted) }
    }
}
