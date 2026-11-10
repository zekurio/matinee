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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.DownloadResolution
import io.github.zekurio.matinee.api.DownloadPlan
import io.github.zekurio.matinee.api.DownloadSpec
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.downloads.DownloadSource
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.formatBytes
import io.github.zekurio.matinee.ui.player.audioLabel
import io.github.zekurio.matinee.ui.player.subtitleDetail
import io.github.zekurio.matinee.ui.player.subtitleLabel
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.videoCodecName
import java.io.IOException

/**
 * What to download: a version the server makes for this device, at the
 * size the person picks, or the file as it is; with the audio tracks and
 * subtitles they pick. The tracks start as the playback and download
 * settings pick them. Shows how big each version is before anything
 * starts, for the audio picked.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DownloadSheet(item: MediaItem, onDismiss: () -> Unit) {
    val api = LocalApi.current
    val context = LocalContext.current
    val downloads = context.app.downloads
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var source by remember { mutableStateOf<DownloadSource?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val plans = remember { mutableStateMapOf<Choice, DownloadPlan>() }
    val specs = remember { mutableStateMapOf<Choice, DownloadSpec>() }
    // The plans are for the audio picked; while new ones come, the old sizes stay.
    var planning by remember { mutableStateOf(true) }
    var picked by remember { mutableStateOf<Choice>(Choice.Device(null)) }
    // Audio by stream index, in the file's order; subtitles by id.
    var audio by remember { mutableStateOf<List<Int>>(emptyList()) }
    var subtitles by remember { mutableStateOf<Set<String>>(emptySet()) }
    var codec by remember { mutableStateOf("h264") }
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    val failure = stringResource(R.string.downloads_failed)

    LaunchedEffect(item.id) {
        try {
            val result = downloads.resolve(api, listOf(item), downloads.wishes()).single()
            if (result is DownloadResolution.Unavailable) {
                error = result.message
                return@LaunchedEffect
            }
            val ready = result as DownloadResolution.Ready
            val loaded = DownloadSource(item, ready)
            audio = downloads.defaultAudio(loaded).map { it.index }
            codec = ready.choices.codecs.firstOrNull() ?: "h264"
            subtitles = downloads.defaultSubtitles(loaded).map { it.id }.toSet()
            picked = startingChoice(downloads, ready.choices.presets)
            source = loaded
        } catch (e: IOException) {
            error = e.message ?: failure
        }
    }

    val loaded = source
    // The primary track first, as the file plays it; the rest as the file has them.
    val chosenAudio = loaded?.audio?.filter { it.index in audio }?.sortedByDescending { it.primary }.orEmpty()
    LaunchedEffect(loaded, audio, codec) {
        loaded ?: return@LaunchedEffect
        if (loaded.audio.isNotEmpty() && chosenAudio.isEmpty()) {
            planning = false
            return@LaunchedEffect
        }
        planning = true
        for (choice in downloadChoices(loaded.resolved.choices.presets)) {
            if (choice !is Choice.Device) continue
            try {
                when (val result = downloads.resolve(api, listOf(item), downloads.wishes(choice.preset, codec, chosenAudio.map { it.index })).single()) {
                    is DownloadResolution.Ready -> {
                        specs[choice] = result.spec
                        plans[choice] = result.plan
                    }
                    is DownloadResolution.Unavailable -> {
                        specs.remove(choice)
                        plans.remove(choice)
                        if (choice == picked) error = result.message
                    }
                }
            } catch (e: IOException) {
                error = e.message ?: failure
            }
        }
        planning = false
        // A preset the server can't make for this file falls back to the version for this device.
        if ((picked as? Choice.Device)?.preset != null && plans[picked] == null) picked = Choice.Device(null)
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet, containerColor = Palette.Raised, dragHandle = null) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 16.dp)) {
            val (primary, secondary) = names(item)
            Column(Modifier.padding(horizontal = 20.dp)) {
                Text(
                    stringResource(R.string.downloads_sheet_title_named, primary),
                    style = MaterialTheme.typography.titleLarge,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (secondary != null) {
                    Text(secondary, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Gap(12.dp)
            when {
                error != null -> Text(error.orEmpty(), color = Palette.Danger, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 20.dp))
                loaded == null -> Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Palette.Accent)
                }
                else -> {
                    val device = picked is Choice.Device
                    val noAudio = device && loaded.audio.isNotEmpty() && chosenAudio.isEmpty()
                    val texts = downloads.textSubtitles(loaded)
                    Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
                        // A size the server can't make for this file doesn't show.
                        val shown = downloadChoices(loaded.resolved.choices.presets).filter { it !is Choice.Device || it.preset == null || plans[it] != null }
                        shown.forEach { choice ->
                            ChoiceRow(choice, plans[choice], loaded, selected = picked == choice) { picked = choice }
                        }
                        // Only an encode has a codec to pick; Automatic may keep the video as it is.
                        val encodes = (picked as? Choice.Device)?.let { it.preset != null || plans[it]?.video?.mode == "encode" } == true
                        val codecs = loaded.resolved.choices.codecs
                        if (encodes && codecs.size > 1) {
                            SheetHeading(stringResource(R.string.downloads_codec))
                            CodecPicker(codecs, codec) { codec = it }
                        }
                        // The file as it is keeps every track.
                        if (device && loaded.audio.isNotEmpty()) {
                            SheetHeading(stringResource(R.string.downloads_audio_title))
                            loaded.audio.forEach { track ->
                                CheckRow(
                                    audioLabel(track),
                                    listOfNotNull(track.format, track.layout).joinToString(" · ").ifEmpty { null },
                                    checked = track.index in audio,
                                ) {
                                    audio = if (track.index in audio) audio - track.index else audio + track.index
                                }
                            }
                            if (noAudio) {
                                Text(
                                    stringResource(R.string.downloads_audio_none),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Palette.Danger,
                                    modifier = Modifier.padding(horizontal = 20.dp),
                                )
                            }
                        }
                        if (texts.isNotEmpty()) {
                            SheetHeading(stringResource(R.string.downloads_subtitles_title))
                            texts.forEach { track ->
                                CheckRow(subtitleLabel(track, loaded.subtitles), subtitleDetail(track), checked = track.id in subtitles) {
                                    subtitles = if (track.id in subtitles) subtitles - track.id else subtitles + track.id
                                }
                            }
                        }
                        Gap(8.dp)
                        Text(
                            stringResource(if (downloads.unmeteredOnly) R.string.downloads_note_unmetered else R.string.downloads_note_any),
                            style = MaterialTheme.typography.bodySmall,
                            color = Palette.Muted,
                            modifier = Modifier.padding(horizontal = 20.dp),
                        )
                    }
                    Gap(16.dp)
                    MatineeButton(
                        onClick = {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                            }
                            val saved = texts.filter { it.id in subtitles }
                            when (val choice = picked) {
                                Choice.Original -> downloads.downloadOriginal(loaded, saved)
                                is Choice.Device -> {
                                    val spec = specs[choice]
                                    val plan = plans[choice]
                                    if (spec != null && plan != null) downloads.downloadForDevice(loaded, spec, plan, saved)
                                }
                            }
                            onDismiss()
                        },
                        enabled = picked == Choice.Original || (!planning && !noAudio && plans[picked] != null),
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
                stringResource(R.string.downloads_about, formatBytes(it.estimatedBytes)),
                "${it.video.height}p ${videoCodecName(it.video.codec)}",
            ).joinToString(" · ")
        } ?: stringResource(R.string.downloads_choice_unavailable)
    }
    RadioRow(choiceName(choice), detail, selected, onClick)
}

/** The codecs a download can be encoded in, as pills, the picked one filled. */
@Composable
internal fun CodecPicker(codecs: List<String>, selected: String, onPick: (String) -> Unit) {
    Row(Modifier.padding(horizontal = 20.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        codecs.forEach { codec ->
            val on = codec == selected
            Text(
                videoCodecName(codec),
                style = MaterialTheme.typography.labelLarge,
                color = if (on) Palette.AccentForeground else Palette.Foreground,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(if (on) Palette.Accent else Palette.Secondary)
                    .clickable { onPick(codec) }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }
    }
}

/** A group's name in a sheet, like the audio tracks'. */
@Composable
internal fun SheetHeading(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 4.dp),
    )
}

/** A choice of several in a sheet: a square mark, its name, and what it is. */
@Composable
private fun CheckRow(title: String, detail: String?, checked: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        val shape = RoundedCornerShape(5.dp)
        Box(
            Modifier.size(20.dp).clip(shape)
                .then(if (checked) Modifier.background(Palette.Accent) else Modifier.border(2.dp, Palette.Input, shape)),
            contentAlignment = Alignment.Center,
        ) {
            if (checked) LucideIcon(Lucide.Check, null, size = 14.dp, tint = Palette.Background)
        }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (!detail.isNullOrEmpty()) Text(detail, style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
        }
    }
}
