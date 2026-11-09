package io.github.zekurio.matinee.ui.downloads

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.DownloadPlan
import io.github.zekurio.matinee.api.DownloadSpec
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.PlaybackOptions
import io.github.zekurio.matinee.api.PlaybackPreferences
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.downloads.DEFAULT_ORIGINAL
import io.github.zekurio.matinee.downloads.DownloadSource
import io.github.zekurio.matinee.downloads.DownloadState
import io.github.zekurio.matinee.downloads.OfflineItem
import io.github.zekurio.matinee.downloads.VIDEO_PRESETS
import io.github.zekurio.matinee.downloads.VideoPreset
import io.github.zekurio.matinee.ui.AccountButton
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalOffline
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.tabBarPadding
import io.github.zekurio.matinee.ui.components.CardShape
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.ProgressBar
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.components.SheetItem
import io.github.zekurio.matinee.ui.components.tone
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.formatBytes
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.videoCodecName
import java.io.File
import java.io.IOException
import java.util.Locale

/** The downloads, newest first, playing from the phone without the server. */
@Composable
fun DownloadsScreen() {
    val downloads = LocalContext.current.app.downloads
    val items by downloads.store.items.collectAsState()
    var acting by remember { mutableStateOf<OfflineItem?>(null) }
    val list = items.values.sortedByDescending { it.addedAt }
    val total = list.filter { it.state == DownloadState.DONE }.sumOf { it.bytes }
    Column(Modifier.fillMaxSize()) {
        TopBar(stringResource(R.string.downloads_title), back = false) {
            if (LocalOffline.current) {
                LucideIcon(Lucide.CloudOff, stringResource(R.string.downloads_offline), size = 20.dp, tint = Palette.Muted)
                Gap(8.dp)
            }
            AccountButton(Modifier.padding(end = Gutter - 8.dp))
        }
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Gutter, end = Gutter, bottom = tabBarPadding() + 24.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (total > 0) {
                item(key = "total") {
                    Text(
                        stringResource(R.string.downloads_total, formatBytes(total)),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Palette.Muted,
                        modifier = Modifier.padding(bottom = 12.dp),
                    )
                }
            }
            if (list.isEmpty()) {
                item(key = "empty") {
                    Column(
                        Modifier.fillMaxWidth().padding(vertical = 48.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        LucideIcon(Lucide.Download, null, size = 28.dp, tint = Palette.Muted)
                        Gap(12.dp)
                        Text(stringResource(R.string.downloads_empty), style = MaterialTheme.typography.titleMedium)
                        Gap(4.dp)
                        Text(stringResource(R.string.downloads_empty_hint), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                    }
                }
            }
            items(list, key = { it.id }) { entry -> DownloadRow(entry) { acting = entry } }
        }
    }
    acting?.let { entry -> DownloadActions(entry) { acting = null } }
}

/** The show and episode, or the movie, of a file. */
@Composable
private fun names(item: MediaItem): Pair<String, String?> {
    val res = LocalResources.current
    val label = itemLabel(item, res)
    val code = episodeCode(item, res)
    return if (code != null) label.showName to stringResource(R.string.media_code_title, code, label.title)
    else label.title to label.year
}

@Composable
private fun DownloadRow(entry: OfflineItem, onMore: () -> Unit) {
    val nav = LocalNavigator.current
    val downloads = LocalContext.current.app.downloads
    val (primary, secondary) = names(entry.item)
    val done = entry.state == DownloadState.DONE
    Row(
        Modifier
            .fillMaxWidth()
            .clip(CardShape)
            .clickable { if (done) nav.play(entry.id) else onMore() }
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.width(128.dp).aspectRatio(16f / 9f).clip(CardShape).tone(primary).border(1.dp, Palette.Border, CardShape),
            contentAlignment = Alignment.Center,
        ) {
            val image = entry.image?.let { File(downloads.store.root, it) }
            if (image != null && image.exists()) {
                AsyncImage(model = image, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } else {
                LucideIcon(Lucide.Film, null, size = 18.dp, tint = Palette.Muted.copy(alpha = 0.5f))
            }
            val progress = entry.progress
            if (!done && progress != null) ProgressBar(progress, Modifier.align(Alignment.BottomCenter), 3.dp)
        }
        Column(Modifier.weight(1f)) {
            Text(primary, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (secondary != null) {
                Text(secondary, style = MaterialTheme.typography.bodySmall, color = Palette.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text(status(entry), style = MaterialTheme.typography.bodySmall, color = if (entry.state == DownloadState.FAILED) Palette.Danger else Palette.Faint, maxLines = 2)
        }
        when (entry.state) {
            DownloadState.RUNNING, DownloadState.QUEUED ->
                RoundIconButton(Lucide.Pause, stringResource(R.string.downloads_pause), { downloads.pause(entry.id) }, size = 40.dp, iconSize = 16.dp, background = Color.Transparent)
            DownloadState.PAUSED, DownloadState.FAILED ->
                RoundIconButton(Lucide.RefreshCw, stringResource(R.string.downloads_resume), { downloads.resume(entry.id) }, size = 40.dp, iconSize = 16.dp, background = Color.Transparent)
            else -> RoundIconButton(Lucide.Ellipsis, stringResource(R.string.title_more_actions), onMore, size = 40.dp, iconSize = 18.dp, background = Color.Transparent)
        }
    }
}

@Composable
private fun status(entry: OfflineItem): String {
    val size = entry.totalBytes?.let(::formatBytes)
    return when (entry.state) {
        DownloadState.DONE -> listOfNotNull(stringResource(R.string.downloads_state_done), formatBytes(entry.bytes)).joinToString(" · ")
        DownloadState.RUNNING -> listOfNotNull(
            stringResource(R.string.downloads_state_running),
            if (size != null) stringResource(R.string.downloads_of, formatBytes(entry.bytes), size) else formatBytes(entry.bytes),
        ).joinToString(" · ")
        DownloadState.PAUSED -> stringResource(R.string.downloads_state_paused)
        DownloadState.FAILED -> stringResource(R.string.downloads_state_failed, entry.error.orEmpty())
        else -> {
            val unmetered = LocalContext.current.app.downloads.unmeteredOnly
            entry.error?.let { stringResource(R.string.downloads_state_retrying, it) }
                ?: stringResource(if (unmetered) R.string.downloads_state_waiting_unmetered else R.string.downloads_state_waiting)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DownloadActions(entry: OfflineItem, onDismiss: () -> Unit) {
    val nav = LocalNavigator.current
    val offline = LocalOffline.current
    val context = LocalContext.current
    val downloads = context.app.downloads
    val api = context.app.session.api
    val (primary, secondary) = names(entry.item)
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Palette.Raised, dragHandle = null) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 12.dp)) {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                Text(primary, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (secondary != null) Text(secondary, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted, maxLines = 1)
            }
            HorizontalDivider(Modifier.padding(vertical = 6.dp), color = Palette.Border)
            if (entry.state == DownloadState.DONE) {
                SheetItem(Lucide.PlayOutline, stringResource(R.string.title_play)) {
                    onDismiss()
                    nav.play(entry.id)
                }
            }
            if (!offline) {
                SheetItem(Lucide.Info, stringResource(R.string.media_hero_details)) {
                    onDismiss()
                    nav.item(entry.item)
                }
            }
            SheetItem(Lucide.Trash, stringResource(R.string.downloads_remove), destructive = true) {
                onDismiss()
                downloads.remove(entry.id, api)
            }
        }
    }
}

/** One choice in the download sheet: a version for this device, or the file as it is. */
private sealed interface Choice {
    data class Device(val preset: VideoPreset?) : Choice

    data object Original : Choice
}

/**
 * What to download: a version the server makes for this device, at the
 * size the person picks, or the file as it is. Shows how big each is
 * before anything starts.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DownloadSheet(item: MediaItem, onDismiss: () -> Unit) {
    val api = LocalApi.current
    val user = LocalUser.current
    val context = LocalContext.current
    val downloads = context.app.downloads
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var source by remember { mutableStateOf<DownloadSource?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val plans = remember { mutableStateMapOf<Choice, DownloadPlan>() }
    val specs = remember { mutableStateMapOf<Choice, DownloadSpec>() }
    val choices = listOf<Choice>(Choice.Device(null)) + VIDEO_PRESETS.map { Choice.Device(it) } + Choice.Original
    // Starts on the version Settings names.
    var picked by remember {
        mutableStateOf<Choice>(
            when (val wanted = downloads.defaultVersion) {
                DEFAULT_ORIGINAL -> Choice.Original
                else -> VIDEO_PRESETS.firstOrNull { it.height.toString() == wanted }?.let { Choice.Device(it) } ?: Choice.Device(null)
            },
        )
    }
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    val failure = stringResource(R.string.downloads_failed)

    LaunchedEffect(item.id) {
        try {
            val loaded = DownloadSource(
                item = item,
                audio = api.audio(item.id),
                subtitles = api.subtitles(item.id).tracks,
                options = runCatching { api.playbackOptions() }.getOrDefault(PlaybackOptions()),
                preferences = user.playback ?: PlaybackPreferences(),
            )
            source = loaded
            for (choice in choices) {
                if (choice !is Choice.Device) continue
                val spec = downloads.deviceSpec(loaded, choice.preset)
                specs[choice] = spec
                // A size this device can't have the server make just doesn't show one.
                runCatching { api.downloadPlan(item.id, spec) }.getOrNull()?.let { plans[choice] = it }
            }
            // A preset the server can't make for this file falls back to the version for this device.
            if ((picked as? Choice.Device)?.preset != null && plans[picked] == null) picked = Choice.Device(null)
        } catch (e: IOException) {
            error = e.message ?: failure
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet, containerColor = Palette.Raised, dragHandle = null) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 16.dp)) {
            val (primary, secondary) = names(item)
            Column(Modifier.padding(horizontal = 20.dp)) {
                Text(stringResource(R.string.downloads_sheet_title), style = MaterialTheme.typography.titleLarge)
                Text(
                    listOfNotNull(primary, secondary).joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Palette.Muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Gap(12.dp)
            val loaded = source
            when {
                error != null -> Text(error.orEmpty(), color = Palette.Danger, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 20.dp))
                loaded == null -> Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Palette.Accent)
                }
                else -> {
                    // A size the server can't make for this file doesn't show.
                    val shown = choices.filter { it !is Choice.Device || it.preset == null || plans[it] != null }
                    shown.forEach { choice ->
                        ChoiceRow(choice, plans[choice], loaded, selected = picked == choice) { picked = choice }
                    }
                    Gap(8.dp)
                    Text(
                        stringResource(if (downloads.unmeteredOnly) R.string.downloads_note_unmetered else R.string.downloads_note_any),
                        style = MaterialTheme.typography.bodySmall,
                        color = Palette.Muted,
                        modifier = Modifier.padding(horizontal = 20.dp),
                    )
                    Gap(16.dp)
                    MatineeButton(
                        onClick = {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                            }
                            when (val choice = picked) {
                                Choice.Original -> downloads.downloadOriginal(loaded)
                                is Choice.Device -> {
                                    val spec = specs[choice]
                                    val plan = plans[choice]
                                    if (spec != null && plan != null) downloads.downloadForDevice(loaded, spec, plan)
                                }
                            }
                            onDismiss()
                        },
                        enabled = picked == Choice.Original || plans[picked] != null,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                    ) {
                        LucideIcon(Lucide.Download, null, size = 18.dp)
                        Text(stringResource(R.string.downloads_start))
                    }
                }
            }
        }
    }
}

/** "6" or "2.5", for a bit rate in Mbps. */
fun mbps(bitrate: Int): String {
    val value = bitrate / 1_000_000.0
    return if (value % 1.0 == 0.0) value.toInt().toString() else "%.1f".format(Locale.getDefault(), value)
}

@Composable
private fun ChoiceRow(choice: Choice, plan: DownloadPlan?, source: DownloadSource, selected: Boolean, onClick: () -> Unit) {
    val downloads = LocalContext.current.app.downloads
    val title = when (choice) {
        Choice.Original -> stringResource(R.string.downloads_choice_original)
        is Choice.Device -> choice.preset?.let { stringResource(R.string.downloads_choice_preset, it.height, mbps(it.bitrate)) }
            ?: stringResource(R.string.downloads_choice_device)
    }
    val detail = when (choice) {
        Choice.Original -> listOfNotNull(
            formatBytes(source.item.sizeBytes),
            source.item.container.uppercase(),
            if (!downloads.originalPlays(source)) stringResource(R.string.downloads_original_may_not_play) else null,
        ).joinToString(" · ")
        is Choice.Device -> plan?.let {
            listOfNotNull(
                "~" + formatBytes(it.estimatedBytes),
                "${it.video.height}p ${videoCodecName(it.video.codec)}",
                it.audio.firstOrNull()?.codec?.uppercase(),
            ).joinToString(" · ")
        } ?: stringResource(R.string.downloads_choice_unavailable)
    }
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            Modifier.size(20.dp).clip(CircleShape)
                .border(2.dp, if (selected) Palette.Accent else Palette.Input, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (selected) Box(Modifier.size(10.dp).clip(CircleShape).background(Palette.Accent))
        }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
        }
    }
}
