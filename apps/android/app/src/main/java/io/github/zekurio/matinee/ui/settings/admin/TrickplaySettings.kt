package io.github.zekurio.matinee.ui.settings.admin

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.AdminTrickplaySettings
import io.github.zekurio.matinee.api.TrickplayInterval
import io.github.zekurio.matinee.api.TrickplaySettings
import io.github.zekurio.matinee.api.TrickplayWidth
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.settings.Panel
import io.github.zekurio.matinee.ui.settings.PickerRow
import io.github.zekurio.matinee.ui.settings.RowDivider
import io.github.zekurio.matinee.ui.settings.Section
import io.github.zekurio.matinee.ui.settings.SettingsScaffold
import io.github.zekurio.matinee.ui.settings.SwitchRow
import java.text.NumberFormat

/**
 * The seek bar's preview images, as the web's trickplay panel: whether the
 * server makes them, how often and how wide, and how it decodes. Each
 * change saves at once; new settings make new images in the background.
 */
@Composable
fun TrickplaySettings() {
    val api = LocalApi.current
    val loader = rememberLoader("admin-trickplay") { admin.trickplay.get() }
    val saver = rememberSaver()
    val save = { settings: TrickplaySettings -> saver { loader.show(api.admin.trickplay.update(settings)) } }
    SettingsScaffold(stringResource(R.string.settings_admin_trickplay)) {
        loaded(loader, { stringResource(R.string.web_trickplay_loadFailed, it) }) { data ->
            item(key = "settings") { TrickplayForm(data, save) }
        }
    }
}

@Composable
private fun TrickplayForm(data: AdminTrickplaySettings, save: (TrickplaySettings) -> Unit) {
    val res = LocalResources.current
    val settings = data.settings
    val count = NumberFormat.getIntegerInstance()
    Section(stringResource(R.string.web_trickplay_title)) {
        Note(res.getQuantityString(R.plurals.web_trickplay_descriptionCount, data.videos, data.videos, count.format(data.ready)))
        Gap(12.dp)
        Panel {
            SwitchRow(stringResource(R.string.web_trickplay_enabled), settings.enabled) { save(settings.copy(enabled = it)) }
            RowDivider()
            PickerRow(
                stringResource(R.string.web_trickplay_interval),
                TrickplayInterval.all.map { it to pluralStringResource(R.plurals.web_trickplay_interval_option, it, it) },
                settings.intervalSeconds,
            ) { save(settings.copy(intervalSeconds = it)) }
            RowDivider()
            PickerRow(
                stringResource(R.string.web_trickplay_width),
                TrickplayWidth.all.map { it to stringResource(R.string.web_trickplay_width_option, it.toString()) },
                settings.width,
            ) { save(settings.copy(width = it)) }
            RowDivider()
            SwitchRow(stringResource(R.string.web_trickplay_keyframesOnly), settings.keyframesOnly) { save(settings.copy(keyframesOnly = it)) }
            // Decoding on the GPU needs one set up for transcoding.
            if (data.hardwareAcceleration != null) {
                RowDivider()
                SwitchRow(stringResource(R.string.web_trickplay_hardwareDecoding), settings.hardwareDecoding) {
                    save(settings.copy(hardwareDecoding = it))
                }
            }
        }
    }
}
