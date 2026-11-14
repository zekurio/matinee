package io.github.zekurio.matinee.ui.requests

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.settings.LinkRow
import io.github.zekurio.matinee.ui.settings.Panel
import io.github.zekurio.matinee.ui.settings.RowDivider
import io.github.zekurio.matinee.ui.settings.Section
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * Account settings' notifications: whether this phone looks for them
 * while Matinee is closed, and, when Android blocks them, the way to its
 * settings. Turning it on asks for the permission if it's missing.
 */
@Composable
fun NotificationsSection() {
    val context = LocalContext.current
    val app = context.app
    var on by remember { mutableStateOf(app.notices.background) }
    var allowed by remember { mutableStateOf(notificationsAllowed(context)) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { allowed = notificationsAllowed(context) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        allowed = notificationsAllowed(context)
        app.scheduleNotices()
    }
    val set = { value: Boolean ->
        on = value
        app.notices.background = value
        app.scheduleNotices()
        if (value && !allowed && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            app.notices.askedPermission = true
            ask.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    Section(stringResource(R.string.requests_notify_section)) {
        Panel {
            Row(
                Modifier.fillMaxWidth().clickable(role = Role.Switch) { set(!on) }.padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.requests_notify_title), style = MaterialTheme.typography.bodyLarge)
                    Text(stringResource(R.string.requests_notify_description), style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
                }
                Gap(12.dp)
                Switch(
                    checked = on,
                    onCheckedChange = set,
                    colors = SwitchDefaults.colors(checkedTrackColor = Palette.Accent, checkedThumbColor = Palette.AccentForeground),
                )
            }
            if (on && !allowed) {
                RowDivider()
                LinkRow(
                    stringResource(R.string.requests_notify_open_settings),
                    description = stringResource(R.string.requests_notify_blocked),
                ) {
                    context.startActivity(
                        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName),
                    )
                }
            }
        }
    }
}
