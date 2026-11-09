package io.github.zekurio.matinee.ui.settings.admin

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.settings.SettingsScaffold
import io.github.zekurio.matinee.ui.theme.Palette

/** The job queues and scheduled tasks, as the web's jobs panel. */
@Composable
fun JobsSettings() {
    SettingsScaffold(stringResource(R.string.settings_admin_jobs)) {
        // Not built yet.
        item(key = "todo") { Text("…", color = Palette.Muted) }
    }
}
