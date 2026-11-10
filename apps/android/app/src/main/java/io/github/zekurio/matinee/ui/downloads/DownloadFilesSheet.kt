package io.github.zekurio.matinee.ui.downloads

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.DEFAULT_PLAYBACK_PREFERENCES
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.PlaybackOptions
import io.github.zekurio.matinee.api.Season
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.downloads.Downloads
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.LocalActions
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.formatBytes
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.theme.Palette
import java.io.IOException
import kotlinx.coroutines.launch

/** Every file of a show, or of one of its seasons when [season] is set. */
data class FileSet(val title: TitleSummary, val season: Season? = null) {
    suspend fun load(api: MatineeApi): List<MediaItem> = when {
        season == null -> api.titleItems(title.id)
        season.number == null -> api.looseItems(title.id)
        else -> api.titleItems(title.id, season.number)
    }
}

/**
 * Download every file of a show or season at once, all the same way: made
 * for this device at the size picked, or as they are. Files already on
 * the device stay as they are. The sizes are estimates: a plan for each
 * file would be a request for each before anything starts, so each file
 * is planned as it's queued instead.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DownloadFilesSheet(files: FileSet, onDismiss: () -> Unit) {
    val api = LocalApi.current
    val user = LocalUser.current
    val res = LocalResources.current
    val actions = LocalActions.current
    val snackbar = LocalSnackbar.current
    val downloads = LocalContext.current.app.downloads
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val stored by downloads.store.items.collectAsState()
    var items by remember { mutableStateOf<List<MediaItem>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var picked by remember { mutableStateOf<Choice>(Choice.Device(null)) }
    var options by remember { mutableStateOf<PlaybackOptions?>(null) }
    var codec by remember { mutableStateOf<String?>(null) }
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}

    LaunchedEffect(files) {
        try {
            options = api.playback.options().also {
                codec = downloads.defaultCodec(it)
                picked = startingChoice(downloads, it)
            }
            items = files.load(api)
        } catch (e: IOException) {
            error = res.getString(R.string.downloads_all_load_failed, e.message.orEmpty())
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet, containerColor = Palette.Raised, dragHandle = null) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 16.dp)) {
            val loadedOptions = options
            val name = files.season?.let { stringResource(R.string.title_season_of, files.title.name, seasonName(it.number, res)) }
                ?: files.title.name
            Column(Modifier.padding(horizontal = 20.dp)) {
                Text(
                    stringResource(R.string.downloads_sheet_title_named, name),
                    style = MaterialTheme.typography.titleLarge,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Gap(12.dp)
            val list = items
            when {
                error != null -> Text(
                    error.orEmpty(),
                    color = Palette.Danger,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(horizontal = 20.dp),
                )
                list == null || loadedOptions == null -> Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Palette.Accent)
                }
                else -> {
                    val missing = list.filter { stored[it.id] == null }
                    val have = list.size - missing.size
                    val summary = listOfNotNull(
                        if (missing.isNotEmpty()) res.getQuantityString(R.plurals.downloads_all_files, missing.size, missing.size) else null,
                        if (have > 0) res.getQuantityString(R.plurals.downloads_all_have, have, have) else null,
                    ).joinToString(" · ").ifEmpty { stringResource(R.string.downloads_all_empty) }
                    Text(summary, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted, modifier = Modifier.padding(horizontal = 20.dp))
                    if (missing.isNotEmpty()) {
                        Gap(4.dp)
                        downloadChoices(loadedOptions).forEach { choice ->
                            RadioRow(choiceName(choice), batchSize(downloads, choice, missing, loadedOptions), selected = picked == choice) { picked = choice }
                        }
                        // Files that get encoded come in the codec picked.
                        val codecs = options?.let(downloads::codecChoices).orEmpty()
                        val current = codec
                        if (picked is Choice.Device && codecs.size > 1 && current != null) {
                            SheetHeading(stringResource(R.string.downloads_codec))
                            CodecPicker(codecs, current) { codec = it }
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
                                val choice = picked
                                val started = res.getQuantityString(R.plurals.downloads_all_started, missing.size, missing.size)
                                // The app's scope, so the files keep queueing after the sheet goes.
                                actions.scope.launch {
                                    launch { snackbar.showSnackbar(started) }
                                    val failed = downloads.downloadAll(
                                        api,
                                        missing,
                                        original = choice == Choice.Original,
                                        preset = (choice as? Choice.Device)?.preset,
                                        preferences = user.playback ?: DEFAULT_PLAYBACK_PREFERENCES,
                                        codec = codec,
                                    )
                                    if (failed > 0) snackbar.showSnackbar(res.getQuantityString(R.plurals.downloads_all_failed, failed, failed))
                                }
                                onDismiss()
                            },
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
}

/** About how much [choice] puts on the device for [items], or nothing when it can't tell. */
@Composable
private fun batchSize(downloads: Downloads, choice: Choice, items: List<MediaItem>, options: PlaybackOptions): String? = when (choice) {
    Choice.Original -> formatBytes(items.sumOf { it.sizeBytes })
    is Choice.Device -> items.mapNotNull { downloads.estimateBytes(it, choice.preset, options) }
        .takeIf { it.isNotEmpty() }
        ?.let { stringResource(R.string.downloads_about, formatBytes(it.sum())) }
}
