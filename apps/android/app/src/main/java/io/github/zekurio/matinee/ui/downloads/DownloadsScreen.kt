package io.github.zekurio.matinee.ui.downloads

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
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
import io.github.zekurio.matinee.ui.episodeNumber
import io.github.zekurio.matinee.ui.formatBytes
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.videoCodecName
import java.io.File
import java.io.IOException
import java.util.Locale

/**
 * What the Downloads page lists: a movie, or a show with its downloaded
 * episodes by season. [newest] is when its latest file was added, which
 * puts what was downloaded last at the top.
 */
private sealed interface DownloadGroup {
    val key: String
    val newest: Long

    data class Single(val entry: OfflineItem) : DownloadGroup {
        override val key get() = entry.id
        override val newest get() = entry.addedAt
    }

    data class Show(val title: TitleSummary, val seasons: List<SeasonDownloads>) : DownloadGroup {
        val entries get() = seasons.flatMap { it.entries }
        override val key get() = "show-${title.id}"
        override val newest get() = entries.maxOf { it.addedAt }
    }
}

/** A season's downloaded episodes in order; [number] null for files without a season. */
private data class SeasonDownloads(val number: Int?, val entries: List<OfflineItem>)

/** Seasons in order, then the specials, then the files without a season, as on a show's page. */
private fun seasonOrder(number: Int?) = when (number) {
    null -> Int.MAX_VALUE
    0 -> Int.MAX_VALUE - 1
    else -> number
}

private fun groupDownloads(entries: Collection<OfflineItem>): List<DownloadGroup> {
    val groups = mutableListOf<DownloadGroup>()
    val shows = LinkedHashMap<String, Pair<TitleSummary, MutableList<OfflineItem>>>()
    for (entry in entries) {
        val title = entry.item.title
        if (title != null && title.kind == TitleKind.SHOW) shows.getOrPut(title.id) { title to mutableListOf() }.second += entry
        else groups += DownloadGroup.Single(entry)
    }
    for ((title, episodes) in shows.values) {
        val seasons = episodes.groupBy { it.item.seasonNumber }
            .map { (number, files) -> SeasonDownloads(number, files.sortedBy { it.item.episodeNumber ?: Int.MAX_VALUE }) }
            .sortedBy { seasonOrder(it.number) }
        groups += DownloadGroup.Show(title, seasons)
    }
    return groups.sortedByDescending { it.newest }
}

/** Files to remove at once, with what to call them in the question. */
private data class Removal(val name: String, val entries: List<OfflineItem>)

/**
 * The downloads, playing from the phone without the server: movies, and
 * shows that open into their seasons and episodes. A whole show or season
 * goes at once, after a question that says how much space it frees.
 */
@Composable
fun DownloadsScreen() {
    val context = LocalContext.current
    val res = LocalResources.current
    val downloads = context.app.downloads
    val items by downloads.store.items.collectAsState()
    var acting by remember { mutableStateOf<OfflineItem?>(null) }
    var actingShow by remember { mutableStateOf<DownloadGroup.Show?>(null) }
    var removing by remember { mutableStateOf<Removal?>(null) }
    var expanded by rememberSaveable { mutableStateOf(listOf<String>()) }
    val groups = groupDownloads(items.values)
    val total = items.values.filter { it.state == DownloadState.DONE }.sumOf { it.bytes }
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
            if (groups.isEmpty()) {
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
            for (group in groups) {
                when (group) {
                    is DownloadGroup.Single -> item(key = group.key) {
                        val (primary, secondary) = names(group.entry.item)
                        DownloadRow(group.entry, primary, secondary, Modifier.animateItem()) { acting = group.entry }
                    }
                    is DownloadGroup.Show -> {
                        val open = group.key in expanded
                        item(key = group.key) {
                            ShowRow(
                                group,
                                open,
                                Modifier.animateItem(),
                                onToggle = { expanded = if (open) expanded - group.key else expanded + group.key },
                                onMore = { actingShow = group },
                            )
                        }
                        if (open) {
                            for (season in group.seasons) {
                                item(key = "${group.key}-season-${season.number}") {
                                    val name = seasonName(season.number, res)
                                    SeasonRow(season, name, Modifier.animateItem()) {
                                        removing = Removal(res.getString(R.string.title_season_of, group.title.name, name), season.entries)
                                    }
                                }
                                items(season.entries, key = { it.id }) { entry ->
                                    val label = itemLabel(entry.item, res)
                                    val number = episodeNumber(entry.item, res)
                                    DownloadRow(
                                        entry,
                                        if (number != null) stringResource(R.string.title_episodes_coded_name, number, label.title) else label.title,
                                        null,
                                        Modifier.animateItem().padding(start = NESTED),
                                        thumbWidth = 112.dp,
                                    ) { acting = entry }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    acting?.let { entry -> DownloadActions(entry) { acting = null } }
    actingShow?.let { group ->
        ShowActions(group, onRemove = { removing = Removal(group.title.name, group.entries) }) { actingShow = null }
    }
    removing?.let { removal ->
        val api = context.app.session.api
        AlertDialog(
            onDismissRequest = { removing = null },
            containerColor = Palette.Raised,
            title = { Text(stringResource(R.string.downloads_remove_named_confirm, removal.name)) },
            text = {
                Text(stringResource(R.string.downloads_remove_all_body, formatBytes(removal.entries.sumOf { it.bytes })), color = Palette.Muted)
            },
            confirmButton = {
                TextButton(onClick = {
                    removing = null
                    removal.entries.forEach { downloads.remove(it.id, api) }
                }) { Text(stringResource(R.string.common_remove), color = Palette.Danger) }
            },
            dismissButton = {
                TextButton(onClick = { removing = null }) { Text(stringResource(R.string.common_cancel), color = Palette.Foreground) }
            },
        )
    }
}

/** How far a show's seasons and episodes sit in from it. */
private val NESTED = 12.dp

/** The show and episode, or the movie, of a file. */
@Composable
private fun names(item: MediaItem): Pair<String, String?> {
    val res = LocalResources.current
    val label = itemLabel(item, res)
    val code = episodeCode(item, res)
    return if (code != null) label.showName to stringResource(R.string.media_code_title, code, label.title)
    else label.title to label.year
}

/** A file's saved picture, or the title's tone without one, and how far it is while it downloads. */
@Composable
private fun DownloadThumb(entry: OfflineItem?, toneKey: String, progress: Float?, width: Dp) {
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
        if (progress != null) ProgressBar(progress, Modifier.align(Alignment.BottomCenter), 3.dp)
    }
}

/**
 * A show: its name, how many episodes are here and how much space, and
 * whether it's paused or something failed. A tap opens its seasons; the
 * menu removes or pauses them all.
 */
@Composable
private fun ShowRow(group: DownloadGroup.Show, expanded: Boolean, modifier: Modifier, onToggle: () -> Unit, onMore: () -> Unit) {
    val res = LocalResources.current
    val entries = group.entries
    val done = entries.count { it.state == DownloadState.DONE }
    val coming = entries.filter { it.state != DownloadState.DONE }
    val failed = entries.count { it.state == DownloadState.FAILED }
    val moving = coming.any { it.state == DownloadState.RUNNING || it.state == DownloadState.QUEUED }
    // How far the files still coming are, together.
    val progress = coming.takeIf { it.isNotEmpty() }?.let { list ->
        val total = list.sumOf { it.totalBytes ?: 0L }
        if (total > 0) (list.sumOf { it.bytes }.toFloat() / total).coerceIn(0f, 1f) else null
    }
    val turn by animateFloatAsState(if (expanded) 180f else 0f, label = "chevron")
    Row(
        modifier
            .fillMaxWidth()
            .clip(CardShape)
            .clickable(onClickLabel = stringResource(if (expanded) R.string.downloads_collapse else R.string.downloads_expand), onClick = onToggle)
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DownloadThumb(entries.firstOrNull(), group.title.name, progress, 128.dp)
        Column(Modifier.weight(1f)) {
            Text(group.title.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOf(
                    // How many of them are here while some are still coming.
                    if (coming.isEmpty()) res.getQuantityString(R.plurals.media_episode_count, entries.size, entries.size)
                    else res.getQuantityString(R.plurals.downloads_episodes_of, entries.size, done, entries.size),
                    formatBytes(entries.sumOf { it.bytes }),
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = Palette.Muted,
                maxLines = 1,
            )
            when {
                failed > 0 -> Text(
                    res.getQuantityString(R.plurals.downloads_failed_count, failed, failed),
                    style = MaterialTheme.typography.bodySmall,
                    color = Palette.Danger,
                    maxLines = 1,
                )
                coming.isNotEmpty() && !moving -> Text(
                    stringResource(R.string.downloads_state_paused),
                    style = MaterialTheme.typography.bodySmall,
                    color = Palette.Faint,
                    maxLines = 1,
                )
            }
        }
        LucideIcon(Lucide.ChevronDown, null, size = 18.dp, tint = Palette.Muted, modifier = Modifier.graphicsLayer { rotationZ = turn })
        RoundIconButton(Lucide.Ellipsis, stringResource(R.string.title_more_actions), onMore, size = 40.dp, iconSize = 18.dp, background = Color.Transparent)
    }
}

/** A season of an open show: its name, its episodes and their space, and removing them all. */
@Composable
private fun SeasonRow(season: SeasonDownloads, name: String, modifier: Modifier, onRemove: () -> Unit) {
    val res = LocalResources.current
    Row(
        modifier.fillMaxWidth().padding(start = NESTED, top = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(name, style = MaterialTheme.typography.titleSmall)
            val total = season.entries.size
            val done = season.entries.count { it.state == DownloadState.DONE }
            Text(
                listOf(
                    if (done == total) res.getQuantityString(R.plurals.media_episode_count, total, total)
                    else res.getQuantityString(R.plurals.downloads_episodes_of, total, done, total),
                    formatBytes(season.entries.sumOf { it.bytes }),
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = Palette.Muted,
            )
        }
        RoundIconButton(
            Lucide.Trash,
            stringResource(R.string.downloads_remove_named, name),
            onRemove,
            size = 40.dp,
            iconSize = 18.dp,
            tint = Palette.Muted,
            background = Color.Transparent,
        )
    }
}

@Composable
private fun DownloadRow(
    entry: OfflineItem,
    primary: String,
    secondary: String?,
    modifier: Modifier = Modifier,
    thumbWidth: Dp = 128.dp,
    onMore: () -> Unit,
) {
    val nav = LocalNavigator.current
    val downloads = LocalContext.current.app.downloads
    val done = entry.state == DownloadState.DONE
    Row(
        modifier
            .fillMaxWidth()
            .clip(CardShape)
            .clickable { if (done) nav.play(entry.id) else onMore() }
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DownloadThumb(entry, entry.item.title?.name ?: primary, entry.progress.takeIf { !done }, thumbWidth)
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

/** A show's menu: pause or resume what's still coming, its page, and removing every episode. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShowActions(group: DownloadGroup.Show, onRemove: () -> Unit, onDismiss: () -> Unit) {
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val offline = LocalOffline.current
    val downloads = LocalContext.current.app.downloads
    val entries = group.entries
    val active = entries.filter { it.state == DownloadState.RUNNING || it.state == DownloadState.QUEUED }
    val stopped = entries.filter { it.state == DownloadState.PAUSED || it.state == DownloadState.FAILED }
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Palette.Raised, dragHandle = null) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 12.dp)) {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
                Text(group.title.name, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
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
                    nav.title(group.title)
                }
            }
            SheetItem(Lucide.Trash, stringResource(R.string.downloads_remove_named, group.title.name), destructive = true) {
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
    val choices = CHOICES
    var picked by remember { mutableStateOf(startingChoice(downloads)) }
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
    RadioRow(choiceName(choice), detail, selected, onClick)
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
