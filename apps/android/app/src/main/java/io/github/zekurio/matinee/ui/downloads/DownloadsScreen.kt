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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.DownloadPlan
import io.github.zekurio.matinee.api.DownloadSpec
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.PlaybackOptions
import io.github.zekurio.matinee.api.PlaybackPreferences
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.downloads.DEFAULT_ORIGINAL
import io.github.zekurio.matinee.downloads.DownloadSource
import io.github.zekurio.matinee.downloads.DownloadState
import io.github.zekurio.matinee.downloads.Downloads
import io.github.zekurio.matinee.downloads.OfflineItem
import io.github.zekurio.matinee.downloads.VIDEO_PRESETS
import io.github.zekurio.matinee.downloads.VideoPreset
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
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.components.SheetItem
import io.github.zekurio.matinee.ui.components.tone
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.episodeNumber
import io.github.zekurio.matinee.ui.formatBytes
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.videoCodecName
import java.io.File
import java.io.IOException
import java.util.Locale

/** A downloaded show: its finished episodes by season. [newest] puts what came last at the top. */
private data class ShowDownloads(val title: TitleSummary, val seasons: List<SeasonDownloads>) {
    val entries get() = seasons.flatMap { it.entries }
    val newest get() = entries.maxOf { it.addedAt }
}

/** A season's episodes in order; [number] null for files without a season. */
private data class SeasonDownloads(val number: Int?, val entries: List<OfflineItem>)

/** Seasons in order, then the specials, then the files without a season, as on a show's page. */
private fun seasonOrder(number: Int?) = when (number) {
    null -> Int.MAX_VALUE
    0 -> Int.MAX_VALUE - 1
    else -> number
}

private fun seasonsOf(entries: List<OfflineItem>): List<SeasonDownloads> =
    entries.groupBy { it.item.seasonNumber }
        .map { (number, files) -> SeasonDownloads(number, files.sortedBy { it.item.episodeNumber ?: Int.MAX_VALUE }) }
        .sortedBy { seasonOrder(it.number) }

private fun isShow(entry: OfflineItem) = entry.item.title?.kind == TitleKind.SHOW

/** Files to remove at once, with what to call them in the question. */
private data class Removal(val name: String, val entries: List<OfflineItem>)

/**
 * The downloads, in two lists: what's still coming, file by file, with
 * how far each is and a button to pause or go on; then what's on the
 * phone, movies and shows, newest first. A movie plays with a tap; a show
 * opens its own page of episodes.
 */
@Composable
fun DownloadsScreen() {
    val context = LocalContext.current
    val nav = LocalNavigator.current
    val downloads = context.app.downloads
    val items by downloads.store.items.collectAsState()
    var acting by remember { mutableStateOf<OfflineItem?>(null) }
    val coming = items.values.filter { it.state != DownloadState.DONE }.sortedBy { it.addedAt }
    val done = items.values.filter { it.state == DownloadState.DONE }
    val shows = done.filter(::isShow).groupBy { it.item.title!!.id }
        .map { (_, episodes) -> ShowDownloads(episodes.first().item.title!!, seasonsOf(episodes)) }
    // Movies and shows together, what came last first.
    val finished: List<Pair<Long, Any>> = (done.filterNot(::isShow).map { it.addedAt to it } + shows.map { it.newest to it })
        .sortedByDescending { it.first }
    Column(Modifier.fillMaxSize()) {
        TopBar(stringResource(R.string.downloads_title), back = false) {
            if (LocalOffline.current) {
                LucideIcon(Lucide.CloudOff, stringResource(R.string.downloads_offline), size = 20.dp, tint = Palette.Muted)
                Gap(Gutter - 4.dp)
            }
        }
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Gutter, end = Gutter, bottom = tabBarPadding() + 24.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (items.isEmpty()) {
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
            if (coming.isNotEmpty()) {
                item(key = "coming") {
                    val moving = coming.filter { it.state == DownloadState.RUNNING || it.state == DownloadState.QUEUED }
                    ListHeading(stringResource(R.string.downloads_coming)) {
                        if (moving.isNotEmpty()) {
                            TextButton(onClick = { moving.forEach { downloads.pause(it.id) } }) {
                                Text(stringResource(R.string.downloads_pause_all), color = Palette.Accent)
                            }
                        } else {
                            TextButton(onClick = { coming.forEach { downloads.resume(it.id) } }) {
                                Text(stringResource(R.string.downloads_resume_all), color = Palette.Accent)
                            }
                        }
                    }
                }
                items(coming, key = { "coming-${it.id}" }) { entry ->
                    val (primary, secondary) = names(entry.item)
                    ComingRow(entry, primary, secondary, Modifier.animateItem()) { acting = entry }
                }
            }
            if (finished.isNotEmpty()) {
                if (coming.isNotEmpty()) item(key = "done") { ListHeading(stringResource(R.string.downloads_done)) }
                items(finished, key = { (_, group) -> if (group is ShowDownloads) "show-${group.title.id}" else (group as OfflineItem).id }) { (_, group) ->
                    when (group) {
                        is ShowDownloads -> ShowRow(group, Modifier.animateItem()) { nav.downloadsShow(group.title.id) }
                        is OfflineItem -> {
                            val (primary, secondary) = names(group.item)
                            DoneRow(group, primary, secondary, Modifier.animateItem()) { acting = group }
                        }
                    }
                }
            }
        }
    }
    acting?.let { entry -> DownloadActions(entry) { acting = null } }
}

/**
 * A downloaded show's episodes by season, each playing with a tap, and
 * the ones still coming with how far they are. Its menu, and each
 * season's, removes them.
 */
@Composable
fun DownloadsShowScreen(titleId: String) {
    val context = LocalContext.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val downloads = context.app.downloads
    val items by downloads.store.items.collectAsState()
    val entries = items.values.filter { it.item.title?.id == titleId }
    val title = entries.firstOrNull()?.item?.title
    var acting by remember { mutableStateOf<OfflineItem?>(null) }
    var showMenu by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf<Removal?>(null) }
    // Everything removed: back to the list.
    LaunchedEffect(entries.isEmpty()) { if (entries.isEmpty()) nav.back() }
    if (title == null) return
    Column(Modifier.fillMaxSize()) {
        TopBar(title.name) {
            RoundIconButton(Lucide.Ellipsis, stringResource(R.string.title_more_actions), { showMenu = true }, size = 40.dp, iconSize = 18.dp, background = Color.Transparent)
            Gap(Gutter - 8.dp)
        }
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Gutter, end = Gutter, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            item(key = "space") {
                Text(
                    listOf(
                        res.getQuantityString(R.plurals.media_episode_count, entries.size, entries.size),
                        formatBytes(entries.sumOf { it.bytes }),
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Palette.Muted,
                )
            }
            for (season in seasonsOf(entries)) {
                val name = seasonName(season.number, res)
                item(key = "season-${season.number}") {
                    ListHeading(name) {
                        RoundIconButton(
                            Lucide.Trash,
                            stringResource(R.string.downloads_remove_named, name),
                            { removing = Removal(res.getString(R.string.title_season_of, title.name, name), season.entries) },
                            size = 40.dp,
                            iconSize = 18.dp,
                            tint = Palette.Muted,
                            background = Color.Transparent,
                        )
                    }
                }
                items(season.entries, key = { it.id }) { entry ->
                    val label = itemLabel(entry.item, res)
                    val number = episodeNumber(entry.item, res)
                    val name = if (number != null) stringResource(R.string.title_episodes_coded_name, number, label.title) else label.title
                    if (entry.state == DownloadState.DONE) {
                        DoneRow(entry, name, null, Modifier.animateItem()) { acting = entry }
                    } else {
                        ComingRow(entry, name, null, Modifier.animateItem()) { acting = entry }
                    }
                }
            }
        }
    }
    acting?.let { entry -> DownloadActions(entry) { acting = null } }
    if (showMenu) {
        ShowActions(title, entries, onRemove = { removing = Removal(title.name, entries) }) { showMenu = false }
    }
    removing?.let { removal -> RemoveDialog(removal) { removing = null } }
}

/** Asks before removing several files at once, saying how much space it frees. */
@Composable
private fun RemoveDialog(removal: Removal, onDone: () -> Unit) {
    val context = LocalContext.current
    val downloads = context.app.downloads
    val api = context.app.session.api
    AlertDialog(
        onDismissRequest = onDone,
        containerColor = Palette.Raised,
        title = { Text(stringResource(R.string.downloads_remove_named_confirm, removal.name)) },
        text = {
            Text(stringResource(R.string.downloads_remove_all_body, formatBytes(removal.entries.sumOf { it.bytes })), color = Palette.Muted)
        },
        confirmButton = {
            TextButton(onClick = {
                onDone()
                removal.entries.forEach { downloads.remove(it.id, api) }
            }) { Text(stringResource(R.string.common_remove), color = Palette.Danger) }
        },
        dismissButton = {
            TextButton(onClick = onDone) { Text(stringResource(R.string.common_cancel), color = Palette.Foreground) }
        },
    )
}

/** A list's name, with room for an action at its end. */
@Composable
private fun ListHeading(text: String, action: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
        action()
    }
}

/** The show and episode, or the movie, of a file. */
@Composable
internal fun names(item: MediaItem): Pair<String, String?> {
    val res = LocalResources.current
    val label = itemLabel(item, res)
    val code = episodeCode(item, res)
    return if (code != null) label.showName to stringResource(R.string.media_code_title, code, label.title)
    else label.title to label.year
}

/** A file's saved picture, or the title's tone without one. */
@Composable
private fun DownloadThumb(entry: OfflineItem?, toneKey: String, width: Dp) {
    val downloads = LocalContext.current.app.downloads
    Box(
        Modifier.width(width).aspectRatio(16f / 9f).clip(CardShape).tone(toneKey).border(1.dp, Palette.Border, CardShape),
        contentAlignment = Alignment.Center,
    ) {
        val image = entry?.image?.let { File(downloads.store.root, it) }
        if (image != null && image.exists()) {
            AsyncImage(model = image, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            LucideIcon(Lucide.Film, null, size = 18.dp, tint = Palette.Muted.copy(alpha = 0.5f))
        }
    }
}

/** A downloaded show: its name, how many episodes and how much space; a tap opens its episodes. */
@Composable
private fun ShowRow(show: ShowDownloads, modifier: Modifier, onClick: () -> Unit) {
    val res = LocalResources.current
    val entries = show.entries
    Row(
        modifier.fillMaxWidth().clip(CardShape).clickable(onClick = onClick).padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DownloadThumb(entries.maxByOrNull { it.addedAt }, show.title.name, 128.dp)
        Column(Modifier.weight(1f)) {
            Text(show.title.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOf(res.getQuantityString(R.plurals.media_episode_count, entries.size, entries.size), formatBytes(entries.sumOf { it.bytes }))
                    .joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = Palette.Muted,
                maxLines = 1,
            )
        }
        LucideIcon(Lucide.ChevronRight, null, size = 18.dp, tint = Palette.Muted)
    }
}

/** A file on the phone: a tap plays it, the menu removes it. */
@Composable
private fun DoneRow(entry: OfflineItem, primary: String, secondary: String?, modifier: Modifier, onMore: () -> Unit) {
    val nav = LocalNavigator.current
    Row(
        modifier.fillMaxWidth().clip(CardShape).clickable { nav.play(entry.id) }.padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DownloadThumb(entry, entry.item.title?.name ?: primary, 128.dp)
        Column(Modifier.weight(1f)) {
            Text(primary, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (secondary != null) {
                Text(secondary, style = MaterialTheme.typography.bodySmall, color = Palette.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text(formatBytes(entry.bytes), style = MaterialTheme.typography.bodySmall, color = Palette.Faint, maxLines = 1)
        }
        RoundIconButton(Lucide.Ellipsis, stringResource(R.string.title_more_actions), onMore, size = 40.dp, iconSize = 18.dp, background = Color.Transparent)
    }
}

/**
 * A file still coming: how far it is, as a bar and in words, and a button
 * to pause it or go on. A tap opens its menu.
 */
@Composable
private fun ComingRow(entry: OfflineItem, primary: String, secondary: String?, modifier: Modifier, onMore: () -> Unit) {
    val downloads = LocalContext.current.app.downloads
    val moving = entry.state == DownloadState.RUNNING || entry.state == DownloadState.QUEUED
    Row(
        modifier.fillMaxWidth().clip(CardShape).clickable(onClick = onMore).padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DownloadThumb(entry, entry.item.title?.name ?: primary, 96.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(primary, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (secondary != null) {
                Text(secondary, style = MaterialTheme.typography.bodySmall, color = Palette.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            val progress = entry.progress
            if (progress != null) {
                Box(Modifier.padding(vertical = 3.dp).fillMaxWidth().height(3.dp).clip(CircleShape).background(Palette.Secondary)) {
                    Box(
                        Modifier.fillMaxWidth(progress).fillMaxHeight().clip(CircleShape)
                            .background(if (moving) Palette.Accent else Palette.Muted),
                    )
                }
            }
            Text(
                status(entry),
                style = MaterialTheme.typography.bodySmall,
                color = if (entry.state == DownloadState.FAILED) Palette.Danger else Palette.Faint,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (moving) {
            RoundIconButton(Lucide.Pause, stringResource(R.string.downloads_pause), { downloads.pause(entry.id) }, size = 40.dp, iconSize = 16.dp, background = Color.Transparent)
        } else {
            RoundIconButton(Lucide.RefreshCw, stringResource(R.string.downloads_resume), { downloads.resume(entry.id) }, size = 40.dp, iconSize = 16.dp, background = Color.Transparent)
        }
    }
}

/** A show's menu: pause or resume what's still coming, its page, and removing every episode. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShowActions(title: TitleSummary, entries: List<OfflineItem>, onRemove: () -> Unit, onDismiss: () -> Unit) {
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val offline = LocalOffline.current
    val downloads = LocalContext.current.app.downloads
    val active = entries.filter { it.state == DownloadState.RUNNING || it.state == DownloadState.QUEUED }
    val stopped = entries.filter { it.state == DownloadState.PAUSED || it.state == DownloadState.FAILED }
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Palette.Raised, dragHandle = null) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 12.dp)) {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                Text(title.name, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(
                    listOf(
                        res.getQuantityString(R.plurals.media_episode_count, entries.size, entries.size),
                        formatBytes(entries.sumOf { it.bytes }),
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Palette.Muted,
                )
            }
            HorizontalDivider(Modifier.padding(vertical = 6.dp), color = Palette.Border)
            if (active.isNotEmpty()) {
                SheetItem(Lucide.Pause, stringResource(R.string.downloads_pause_all)) {
                    onDismiss()
                    active.forEach { downloads.pause(it.id) }
                }
            }
            if (stopped.isNotEmpty()) {
                SheetItem(Lucide.RefreshCw, stringResource(R.string.downloads_resume_all)) {
                    onDismiss()
                    stopped.forEach { downloads.resume(it.id) }
                }
            }
            if (!offline) {
                SheetItem(Lucide.Info, stringResource(R.string.media_hero_episodes)) {
                    onDismiss()
                    nav.title(title)
                }
            }
            SheetItem(Lucide.Trash, stringResource(R.string.downloads_remove_named, title.name), destructive = true) {
                onDismiss()
                onRemove()
            }
        }
    }
}

@Composable
private fun status(entry: OfflineItem): String {
    val size = entry.totalBytes?.let(::formatBytes)
    return when (entry.state) {
        DownloadState.DONE -> formatBytes(entry.bytes)
        DownloadState.RUNNING -> if (size != null) stringResource(R.string.downloads_of, formatBytes(entry.bytes), size) else formatBytes(entry.bytes)
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
internal sealed interface Choice {
    data class Device(val preset: VideoPreset?) : Choice

    data object Original : Choice
}

/** What a download sheet offers, in order: for this device, at each preset's size, and as it is. */
internal val CHOICES: List<Choice> = listOf<Choice>(Choice.Device(null)) + VIDEO_PRESETS.map { Choice.Device(it) } + Choice.Original

/** The version Settings names, which a download sheet starts on. */
internal fun startingChoice(downloads: Downloads): Choice = when (val wanted = downloads.defaultVersion) {
    DEFAULT_ORIGINAL -> Choice.Original
    else -> VIDEO_PRESETS.firstOrNull { it.height.toString() == wanted }?.let { Choice.Device(it) } ?: Choice.Device(null)
}

@Composable
internal fun choiceName(choice: Choice): String = when (choice) {
    Choice.Original -> stringResource(R.string.downloads_choice_original)
    is Choice.Device -> choice.preset?.let { stringResource(R.string.downloads_choice_preset, it.height, mbps(it.bitrate)) }
        ?: stringResource(R.string.downloads_choice_device)
}

/** "6" or "2.5", for a bit rate in Mbps. */
fun mbps(bitrate: Int): String {
    val value = bitrate / 1_000_000.0
    return if (value % 1.0 == 0.0) value.toInt().toString() else "%.1f".format(Locale.getDefault(), value)
}

/** A choice in a sheet: a round mark, its name, and what it comes to. */
@Composable
internal fun RadioRow(title: String, detail: String?, selected: Boolean, onClick: () -> Unit) {
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
            if (detail != null) Text(detail, style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
        }
    }
}
