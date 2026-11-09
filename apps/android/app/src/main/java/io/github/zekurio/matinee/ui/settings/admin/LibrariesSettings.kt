package io.github.zekurio.matinee.ui.settings.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.DirectoryListing
import io.github.zekurio.matinee.api.Library
import io.github.zekurio.matinee.api.LibraryInput
import io.github.zekurio.matinee.api.MetadataProvider
import io.github.zekurio.matinee.api.name
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.components.SheetHeader
import io.github.zekurio.matinee.ui.components.SheetItem
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.settings.Panel
import io.github.zekurio.matinee.ui.settings.PickerRow
import io.github.zekurio.matinee.ui.settings.RowDivider
import io.github.zekurio.matinee.ui.settings.Section
import io.github.zekurio.matinee.ui.settings.SettingsScaffold
import io.github.zekurio.matinee.ui.theme.Palette
import java.util.Locale
import kotlinx.coroutines.delay

/** Which library the editor is open for: a new one, or one to change. */
private sealed interface Editing {
    data object New : Editing

    data class Existing(val library: Library) : Editing
}

/**
 * The libraries, as the web's libraries panel: each with its titles and
 * what the server is doing to it. A tap scans it, fetches its metadata
 * again, edits it, or removes it; Add library opens the same editor empty.
 * While a scan or a fetch runs, the page asks again every few seconds.
 */
@Composable
fun LibrariesSettings() {
    val api = LocalApi.current
    val snackbar = LocalSnackbar.current
    val res = LocalResources.current
    val loader = rememberLoader("admin-libraries") { libraries.list() }
    val providers = rememberLoader("admin-providers") { metadata.providers() }
    val saver = rememberSaver()
    var acting by remember { mutableStateOf<Library?>(null) }
    var editing by remember { mutableStateOf<Editing?>(null) }
    var removing by remember { mutableStateOf<Library?>(null) }
    val libraries = (loader.state as? Load.Ready)?.value.orEmpty()
    val busy = libraries.any { it.scanning || it.refreshing }
    LaunchedEffect(busy) {
        while (busy) {
            delay(2_000)
            loader.reload()
        }
    }
    SettingsScaffold(stringResource(R.string.settings_admin_libraries)) {
        loaded(loader, { stringResource(R.string.web_libraries_loadFailed, it) }) { list ->
            item(key = "list") {
                Column {
                    if (list.isEmpty()) {
                        Text(stringResource(R.string.web_libraries_empty_title), style = MaterialTheme.typography.titleMedium)
                        Gap(4.dp)
                        Text(stringResource(R.string.web_libraries_empty_description), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                    } else {
                        Panel {
                            list.forEachIndexed { index, library ->
                                if (index > 0) RowDivider()
                                LibraryRow(library, providers.state) { acting = library }
                            }
                        }
                    }
                    Gap(16.dp)
                    MatineeButton(onClick = { editing = Editing.New }, modifier = Modifier.fillMaxWidth()) {
                        LucideIcon(Lucide.FolderPlus, null, size = 18.dp)
                        Text(stringResource(R.string.web_libraries_add))
                    }
                }
            }
        }
    }
    acting?.let { library ->
        LibrarySheet(
            library,
            onScan = { saver { api.libraries.scan(library.id); loader.reload() } },
            onRefresh = {
                saver {
                    api.libraries.refreshMetadata(library.id)
                    snackbar.showSnackbar(res.getString(R.string.web_libraries_fetching))
                    loader.reload()
                }
            },
            onEdit = { editing = Editing.Existing(library) },
            onRemove = { removing = library },
        ) { acting = null }
    }
    removing?.let { library ->
        ConfirmDialog(
            title = stringResource(R.string.web_libraries_remove_title, library.name),
            body = stringResource(R.string.web_libraries_remove_description),
            confirm = stringResource(R.string.web_libraries_remove_confirm),
            onConfirm = {
                saver {
                    api.libraries.remove(library.id)
                    snackbar.showSnackbar(res.getString(R.string.web_libraries_removed, library.name))
                    loader.reload()
                }
            },
        ) { removing = null }
    }
    editing?.let { target ->
        LibraryEditor(
            target,
            (providers.state as? Load.Ready)?.value.orEmpty(),
            saver,
            onSave = { input ->
                saver {
                    when (target) {
                        Editing.New -> api.libraries.create(input)
                        is Editing.Existing -> api.libraries.update(
                            target.library.id,
                            name = input.name,
                            kind = input.kind,
                            paths = input.paths,
                            metadataProvider = input.metadataProvider,
                            metadataLanguage = input.metadataLanguage,
                        )
                    }
                    editing = null
                    loader.reload()
                }
            },
        ) { editing = null }
    }
}

@Composable
private fun LibraryRow(library: Library, providers: Load<List<MetadataProvider>>, onClick: () -> Unit) {
    val provider = (providers as? Load.Ready)?.value?.firstOrNull { it.id == library.metadataProvider }?.name
    val status = when {
        library.scanning -> stringResource(R.string.web_libraries_scanning)
        library.refreshing -> provider?.let { stringResource(R.string.web_libraries_fetchingFrom, it) }
            ?: stringResource(R.string.web_libraries_fetchingFromProvider)
        else -> listOfNotNull(
            pluralStringResource(R.plurals.browse_title_count, library.titleCount, library.titleCount),
            provider,
        ).joinToString(" · ")
    }
    Row(
        Modifier.fillMaxWidth().clickable(onClickLabel = stringResource(R.string.web_libraries_actions, library.name), onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        LucideIcon(if (library.kind == "shows") Lucide.Tv else Lucide.Film, null, size = 20.dp, tint = Palette.Muted)
        Column(Modifier.weight(1f)) {
            Text(library.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(status, style = MaterialTheme.typography.bodySmall, color = Palette.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (library.scanning || library.refreshing) {
            CircularProgressIndicator(Modifier.size(18.dp), color = Palette.Accent, strokeWidth = 2.dp)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LibrarySheet(
    library: Library,
    onScan: () -> Unit,
    onRefresh: () -> Unit,
    onEdit: () -> Unit,
    onRemove: () -> Unit,
    onDismiss: () -> Unit,
) {
    val pick = { action: () -> Unit ->
        onDismiss()
        action()
    }
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Palette.Raised, dragHandle = null) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 12.dp)) {
            SheetHeader(library.name, library.paths.joinToString(", "))
            SheetItem(Lucide.RefreshCw, stringResource(R.string.web_libraries_scanNow)) { pick(onScan) }
            if (library.metadataProvider != null) {
                SheetItem(Lucide.Image, stringResource(R.string.web_libraries_refreshMetadata)) { pick(onRefresh) }
            }
            SheetItem(Lucide.Settings, stringResource(R.string.web_libraries_edit)) { pick(onEdit) }
            SheetItem(Lucide.Trash, stringResource(R.string.web_libraries_remove), destructive = true) { pick(onRemove) }
        }
    }
}

/**
 * The library's name, kind, metadata, and folders, over the whole screen:
 * the folders are picked by walking the server's, below the ones picked.
 */
@Composable
private fun LibraryEditor(target: Editing, providers: List<MetadataProvider>, saver: Saver, onSave: (LibraryInput) -> Unit, onDismiss: () -> Unit) {
    val existing = (target as? Editing.Existing)?.library
    var name by remember { mutableStateOf(existing?.name.orEmpty()) }
    var kind by remember { mutableStateOf(existing?.kind ?: "movies") }
    var provider by remember { mutableStateOf(existing?.metadataProvider ?: providers.firstOrNull { it.configured }?.id) }
    var language by remember { mutableStateOf(existing?.metadataLanguage ?: Locale.getDefault().language) }
    var paths by remember { mutableStateOf(existing?.paths.orEmpty()) }
    val valid = name.isNotBlank() && paths.isNotEmpty() && Regex("^[a-z]{2}(-[A-Z]{2})?$").matches(language.trim())
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Column(Modifier.fillMaxSize().background(Palette.Background).statusBarsPadding().navigationBarsPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                RoundIconButton(Lucide.X, stringResource(R.string.web_libraries_dialog_cancel), onDismiss, background = Color.Transparent, size = 48.dp)
                Text(
                    stringResource(if (existing == null) R.string.web_libraries_dialog_addTitle else R.string.web_libraries_dialog_editTitle),
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.weight(1f).padding(start = 4.dp),
                )
                MatineeButton(
                    onClick = { onSave(LibraryInput(name.trim(), kind, paths, provider, language.trim())) },
                    enabled = valid && !saver.saving,
                    modifier = Modifier.padding(end = 12.dp),
                ) {
                    Text(stringResource(if (existing == null) R.string.web_libraries_dialog_add else R.string.web_libraries_dialog_save))
                }
            }
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = Gutter, end = Gutter, top = 8.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp),
            ) {
                item(key = "details") {
                    Panel {
                        TextRow(stringResource(R.string.web_libraries_dialog_name), name, { name = it }, placeholder = stringResource(R.string.web_libraries_dialog_namePlaceholder))
                        RowDivider()
                        PickerRow(
                            stringResource(R.string.web_libraries_dialog_type),
                            listOf("movies" to stringResource(R.string.web_libraries_dialog_kind_movies), "shows" to stringResource(R.string.web_libraries_dialog_kind_shows)),
                            kind,
                        ) { kind = it }
                        RowDivider()
                        val needsKey = stringResource(R.string.web_libraries_dialog_needsKey)
                        PickerRow(
                            stringResource(R.string.web_libraries_dialog_metadata),
                            listOf<Pair<String?, String>>(null to stringResource(R.string.web_libraries_dialog_noProvider)) +
                                providers.map { it.id to if (it.configured) it.name else "${it.name} · $needsKey" },
                            provider,
                        ) { picked ->
                            // A provider without its key can't fetch anything.
                            if (picked == null || providers.firstOrNull { it.id == picked }?.configured == true) provider = picked
                        }
                        if (provider != null) {
                            RowDivider()
                            TextRow(stringResource(R.string.web_libraries_dialog_language), language, { language = it }, placeholder = "en")
                        }
                    }
                }
                item(key = "folders") {
                    Section(stringResource(R.string.web_libraries_dialog_folders)) {
                        if (paths.isEmpty()) {
                            Note(stringResource(R.string.web_libraries_dialog_noFolders))
                        } else {
                            Panel {
                                paths.forEachIndexed { index, path ->
                                    if (index > 0) RowDivider()
                                    Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                        LucideIcon(Lucide.FolderPlus, null, size = 18.dp, tint = Palette.Muted)
                                        Gap(12.dp)
                                        Text(path, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                                        RoundIconButton(Lucide.X, stringResource(R.string.web_libraries_dialog_removeFolder, path), { paths = paths - path }, background = Color.Transparent)
                                    }
                                }
                            }
                        }
                    }
                }
                item(key = "browser") {
                    Section(stringResource(R.string.web_libraries_dialog_browse)) {
                        FolderBrowser(paths) { paths = paths + it }
                    }
                }
            }
        }
    }
}

/** The server's folders, one level at a time, with a way to add the one that's open. */
@Composable
private fun FolderBrowser(added: List<String>, onAdd: (String) -> Unit) {
    val api = LocalApi.current
    var path by remember { mutableStateOf<String?>(null) }
    var listing by remember { mutableStateOf<DirectoryListing?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(path) {
        error = null
        listing = try {
            api.admin.browse(path)
        } catch (e: java.io.IOException) {
            error = e.message
            null
        }
    }
    val current = listing
    Panel {
        if (current == null) {
            Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) {
                if (error != null) Text(error.orEmpty(), color = Palette.Danger, style = MaterialTheme.typography.bodySmall)
                else CircularProgressIndicator(color = Palette.Accent, strokeWidth = 2.dp)
            }
            return@Panel
        }
        // Where the browser is, and adding it.
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 12.dp, top = 12.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.web_libraries_browser_current), style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
                Text(current.path, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            val already = current.path in added
            MatineeButton(onClick = { onAdd(current.path) }, enabled = !already && current.parent != null, height = 36.dp) {
                Text(stringResource(if (already) R.string.web_libraries_browser_added else R.string.web_libraries_browser_add))
            }
        }
        current.parent?.let { parent ->
            RowDivider()
            FolderRow("..", Lucide.ArrowLeft) { path = parent }
        }
        if (current.directories.isEmpty()) {
            RowDivider()
            Text(
                stringResource(R.string.web_libraries_browser_empty),
                style = MaterialTheme.typography.bodySmall,
                color = Palette.Muted,
                modifier = Modifier.padding(16.dp),
            )
        }
        current.directories.forEach { directory ->
            RowDivider()
            FolderRow(directory.name, Lucide.ChevronRight) { path = directory.path }
        }
    }
}

@Composable
private fun FolderRow(name: String, icon: Int, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClickLabel = stringResource(R.string.web_libraries_browser_open, name), onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        LucideIcon(icon, null, size = 16.dp, tint = Palette.Muted)
    }
}
