package io.github.zekurio.matinee.ui.settings.admin

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.AdminTrickplaySettings
import io.github.zekurio.matinee.api.TrickplayInterval
import io.github.zekurio.matinee.api.TrickplaySettings
import io.github.zekurio.matinee.api.TrickplayWidth
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.settings.Panel
import io.github.zekurio.matinee.ui.settings.PickerRow
import io.github.zekurio.matinee.ui.settings.RowDivider
import io.github.zekurio.matinee.ui.settings.Section
import io.github.zekurio.matinee.ui.settings.SwitchRow
import java.text.NumberFormat

/**
 * The seek bar's preview images, as the web's trickplay panel: whether the
 * server makes them, how often and how wide, and how it decodes. The
 * fields save together, from the save bar; new settings make new images
 * in the background.
 */
@Composable
fun TrickplaySettings() {
    val api = LocalApi.current
    val loader = rememberLoader("admin-trickplay") { admin.trickplay.get() }
    val data = (loader.state as? Load.Ready)?.value
    var draft by remember(data) { mutableStateOf(data?.settings) }
    SaveBarScaffold(
        stringResource(R.string.settings_admin_trickplay),
        dirty = draft != data?.settings,
        onReset = { draft = data?.settings },
        onSave = { draft?.let { loader.show(api.admin.trickplay.update(it)) } },
    ) {
        loaded(loader, { stringResource(R.string.web_trickplay_loadFailed, it) }) { data ->
            item(key = "settings") { TrickplayForm(data, draft ?: data.settings) { draft = it } }
        }
    }
}

@Composable
private fun TrickplayForm(data: AdminTrickplaySettings, settings: TrickplaySettings, edit: (TrickplaySettings) -> Unit) {
    val res = LocalResources.current
    val count = NumberFormat.getIntegerInstance()
    Section(stringResource(R.string.web_trickplay_title)) {
        Note(res.getQuantityString(R.plurals.web_trickplay_descriptionCount, data.videos, data.videos, count.format(data.ready)))
        Gap(12.dp)
        Panel {
            SwitchRow(stringResource(R.string.web_trickplay_enabled), settings.enabled) { edit(settings.copy(enabled = it)) }
            RowDivider()
            PickerRow(
                stringResource(R.string.web_trickplay_interval),
                TrickplayInterval.all.map { it to pluralStringResource(R.plurals.web_trickplay_interval_option, it, it) },
                settings.intervalSeconds,
            ) { edit(settings.copy(intervalSeconds = it)) }
            RowDivider()
            PickerRow(
                stringResource(R.string.web_trickplay_width),
                TrickplayWidth.all.map { it to stringResource(R.string.web_trickplay_width_option, it.toString()) },
                settings.width,
            ) { edit(settings.copy(width = it)) }
            RowDivider()
            SwitchRow(stringResource(R.string.web_trickplay_keyframesOnly), settings.keyframesOnly) { edit(settings.copy(keyframesOnly = it)) }
            // Decoding on the GPU needs one set up for transcoding.
            if (data.hardwareAcceleration != null) {
                RowDivider()
                SwitchRow(stringResource(R.string.web_trickplay_hardwareDecoding), settings.hardwareDecoding) {
                    edit(settings.copy(hardwareDecoding = it))
                }
            }
        }
    }
}
