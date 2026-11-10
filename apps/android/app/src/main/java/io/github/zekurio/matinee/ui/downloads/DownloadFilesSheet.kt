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
import io.github.zekurio.matinee.api.DownloadResolution
import io.github.zekurio.matinee.api.DownloadVideoPreset
import io.github.zekurio.matinee.api.DownloadWishes
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.Season
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.LocalActions
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.formatBytes
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.settings.Panel
import io.github.zekurio.matinee.ui.settings.SwitchRow
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

/** Resolve a season in batches, then queue the returned plans without more requests. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DownloadFilesSheet(files: FileSet, onDismiss: () -> Unit) {
    val api = LocalApi.current
    val res = LocalResources.current
    val actions = LocalActions.current
    val snackbar = LocalSnackbar.current
    val downloads = LocalContext.current.app.downloads
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val stored by downloads.store.items.collectAsState()
    var items by remember { mutableStateOf<List<MediaItem>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var picked by remember { mutableStateOf<Choice>(Choice.Device(null)) }
    var presets by remember { mutableStateOf<List<DownloadVideoPreset>>(emptyList()) }
    var codecs by remember { mutableStateOf<List<String>>(emptyList()) }
    var results by remember { mutableStateOf<List<DownloadResolution>?>(null) }
    var resolvedWishes by remember { mutableStateOf<DownloadWishes?>(null) }
    var codec by remember { mutableStateOf<String?>(null) }
    var unmetered by remember { mutableStateOf(downloads.unmeteredOnly) }
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}

    LaunchedEffect(files) {
        try {
            val loaded = files.load(api)
            val wishes = downloads.wishes()
            val initial = downloads.resolve(api, loaded.filter { stored[it.id] == null }, wishes)
            val ready = initial.filterIsInstance<DownloadResolution.Ready>()
            presets = ready.flatMap { it.choices.presets }.distinct().sortedByDescending { it.height }
            codecs = ready.flatMap { it.choices.codecs }.distinct()
            codec = downloads.videoCodec.takeIf { it in codecs }
            picked = startingChoice(downloads, presets)
            resolvedWishes = wishes
            results = initial
            items = loaded
        } catch (e: IOException) {
            error = res.getString(R.string.downloads_all_load_failed, e.message.orEmpty())
        }
    }

    LaunchedEffect(items, picked, codec) {
        val loaded = items ?: return@LaunchedEffect
        val wishes = downloads.wishes((picked as? Choice.Device)?.preset, codec)
        if (wishes == resolvedWishes) return@LaunchedEffect
        results = null
        try {
            results = downloads.resolve(api, loaded.filter { stored[it.id] == null }, wishes)
            resolvedWishes = wishes
        } catch (e: IOException) {
            error = e.message
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet, containerColor = Palette.Raised, dragHandle = null) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 16.dp)) {
            val resolved = results
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
                list == null || resolved == null -> Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
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
                        Gap(12.dp)
                        val ready = resolved.filterIsInstance<DownloadResolution.Ready>()
                        val size = if (picked == Choice.Original) missing.sumOf { it.sizeBytes } else ready.sumOf { it.plan.estimatedBytes }
                        // Files that get encoded come in the codec picked; a preset encodes every file.
                        VersionPanel(
                            choices = downloadChoices(presets),
                            picked = picked,
                            onPick = { picked = it },
                            codecs = codecs,
                            codec = codec ?: codecs.firstOrNull(),
                            onCodec = { codec = it },
                            plan = null,
                            detail = stringResource(R.string.downloads_about, formatBytes(size)),
                        )
                        resolved.filterIsInstance<DownloadResolution.Unavailable>().forEach {
                            Text(it.message, color = Palette.Danger, modifier = Modifier.padding(horizontal = 20.dp))
                        }
                        Gap(8.dp)
                        // This download's own pick; the setting is where it starts.
                        Column(Modifier.padding(horizontal = 20.dp)) {
                            Panel {
                                SwitchRow(stringResource(R.string.downloads_unmetered), unmetered) { unmetered = it }
                            }
                        }
                        Gap(16.dp)
                        MatineeButton(
                            onClick = {
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                    askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
                                }
                                val choice = picked
                                val wifi = unmetered
                                val started = res.getQuantityString(R.plurals.downloads_all_started, missing.size, missing.size)
                                // The app's scope, so the files keep queueing after the sheet goes.
                                actions.scope.launch {
                                    launch { snackbar.showSnackbar(started) }
                                    val failed = downloads.downloadAll(missing, resolved, original = choice == Choice.Original, unmetered = wifi)
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
