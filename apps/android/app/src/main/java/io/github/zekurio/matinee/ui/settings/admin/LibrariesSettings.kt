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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.SavedStateHandle
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.DirectoryListing
import io.github.zekurio.matinee.api.Library
import io.github.zekurio.matinee.api.LibraryInput
import io.github.zekurio.matinee.api.MetadataProvider
import io.github.zekurio.matinee.api.name
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.RefreshOnResume
import io.github.zekurio.matinee.ui.Reveal
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.kit.ConfirmDialog
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.MatineeButton
import io.github.zekurio.matinee.ui.kit.MatineeTextField
import io.github.zekurio.matinee.ui.kit.RoundIconButton
import io.github.zekurio.matinee.ui.kit.Sheet
import io.github.zekurio.matinee.ui.kit.SheetHeader
import io.github.zekurio.matinee.ui.kit.SheetItem
import io.github.zekurio.matinee.ui.kit.Spinner
import io.github.zekurio.matinee.ui.kit.rememberSheetState
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.settings.Panel
import io.github.zekurio.matinee.ui.settings.PickerRow
import io.github.zekurio.matinee.ui.settings.RowDivider
import io.github.zekurio.matinee.ui.settings.Section
import io.github.zekurio.matinee.ui.settings.SettingsScaffold
import io.github.zekurio.matinee.ui.settings.languageName
import io.github.zekurio.matinee.ui.theme.Palette
import java.util.Locale
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

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
    var removing by remember { mutableStateOf<Library?>(null) }
    val libraries = (loader.state as? Load.Ready)?.value.orEmpty()
    val nav = LocalNavigator.current
    // Back from the editor, the list shows what it saved.
    RefreshOnResume(loader, maxAgeMs = 0)
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
                    MatineeButton(onClick = { nav.libraryEditor() }, modifier = Modifier.fillMaxWidth()) {
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
            onEdit = { nav.libraryEditor(library.id) },
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
            Spinner(size = 18.dp, color = Palette.Accent)
        }
    }
}

@Composable
private fun LibrarySheet(
    library: Library,
    onScan: () -> Unit,
    onRefresh: () -> Unit,
    onEdit: () -> Unit,
    onRemove: () -> Unit,
    onDismiss: () -> Unit,
) {
    val sheet = rememberSheetState(skipPartiallyExpanded = false)
    val scope = rememberCoroutineScope()
    // The sheet slides away first, then the action runs, so what it opens
    // doesn't cut the sheet off halfway.
    val pick = { action: () -> Unit ->
        scope.launch { sheet.hide() }.invokeOnCompletion {
            onDismiss()
            action()
        }
    }
    Sheet(onDismissRequest = onDismiss, state = sheet) {
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
 * Languages every provider has a fair amount of data in, as the web's
 * library dialog offers them, with the tag their name comes from: the
 * region only where it matters.
 */
private val MetadataLanguages = listOf(
    "en-US" to "en",
    "de-DE" to "de",
    "fr-FR" to "fr",
    "es-ES" to "es",
    "it-IT" to "it",
    "pt-BR" to "pt-BR",
    "nl-NL" to "nl",
    "pl-PL" to "pl",
    "sv-SE" to "sv",
    "ja-JP" to "ja",
    "ko-KR" to "ko",
    "zh-CN" to "zh",
)

/** The offered language in the device's language, else English. */
private fun defaultMetadataLanguage(): String {
    val device = Locale.getDefault().language
    return MetadataLanguages.firstOrNull { (value, _) -> value.substringBefore('-') == device }?.first ?: "en-US"
}

/**
 * The library's name, kind, metadata, and folders, as a page of its own:
 * a new library, or with [id], one to change. Folders are picked on the
 * next page, which hands the folder back through [results]. The draft is
 * saveable, so it's still there when that page closes again.
 */
@Composable
fun LibraryEditorScreen(id: String?, results: SavedStateHandle) {
    val libraries = rememberLoader("admin-libraries") { libraries.list() }
    val providers = rememberLoader("admin-providers") { metadata.providers() }
    val list = (libraries.state as? Load.Ready)?.value
    val existing = id?.let { list?.firstOrNull { library -> library.id == it } }
    val title = stringResource(if (id == null) R.string.web_libraries_dialog_addTitle else R.string.web_libraries_dialog_editTitle)
    // The draft starts from the library and the providers, so it waits for both.
    val ready = providers.state !is Load.Loading && (id == null || existing != null || libraries.state is Load.Failed)
    if (!ready) {
        Column(Modifier.fillMaxSize()) {
            TopBar(title)
            Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                Spinner(size = 32.dp, color = Palette.Accent)
            }
        }
        return
    }
    LibraryEditor(
        title = title,
        existing = existing,
        providers = (providers.state as? Load.Ready)?.value.orEmpty(),
        knownPath = list?.firstOrNull()?.paths?.firstOrNull(),
        results = results,
    )
}

@Composable
private fun LibraryEditor(title: String, existing: Library?, providers: List<MetadataProvider>, knownPath: String?, results: SavedStateHandle) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val saver = rememberSaver()
    var name by rememberSaveable { mutableStateOf(existing?.name.orEmpty()) }
    var kind by rememberSaveable { mutableStateOf(existing?.kind ?: "movies") }
    var provider by rememberSaveable { mutableStateOf(existing?.metadataProvider ?: providers.firstOrNull { it.configured }?.id) }
    var language by rememberSaveable { mutableStateOf(existing?.metadataLanguage ?: defaultMetadataLanguage()) }
    var paths by rememberSaveable(stateSaver = PathsSaver) { mutableStateOf(existing?.paths.orEmpty()) }
    // The folder the picker handed back, added once.
    val picked by results.getStateFlow<String?>(PICKED_FOLDER, null).collectAsState()
    LaunchedEffect(picked) {
        picked?.let { if (it !in paths) paths = paths + it }
        results[PICKED_FOLDER] = null
    }
    val valid = name.isNotBlank() && paths.isNotEmpty()
    val save = {
        val input = LibraryInput(name.trim(), kind, paths, provider, language)
        saver {
            if (existing == null) {
                api.libraries.create(input)
            } else {
                api.libraries.update(
                    existing.id,
                    name = input.name,
                    kind = input.kind,
                    paths = input.paths,
                    metadataProvider = input.metadataProvider,
                    metadataLanguage = input.metadataLanguage,
                )
            }
            nav.back()
        }
    }
    Column(Modifier.fillMaxSize().imePadding()) {
        TopBar(title) {
            MatineeButton(onClick = save, enabled = valid && !saver.saving, height = 36.dp, modifier = Modifier.padding(end = Gutter - 4.dp)) {
                Text(stringResource(if (existing == null) R.string.web_libraries_browser_add else R.string.web_libraries_dialog_save))
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
                    ) { choice ->
                        // A provider without its key can't fetch anything.
                        if (choice == null || providers.firstOrNull { it.id == choice }?.configured == true) provider = choice
                    }
                    Reveal(provider != null) {
                        Column {
                            RowDivider()
                            // A library saved with a language the list lacks keeps it as a choice.
                            val offered = if (MetadataLanguages.any { it.first == language }) MetadataLanguages else MetadataLanguages + (language to language)
                            PickerRow(
                                stringResource(R.string.web_libraries_dialog_language),
                                offered.map { (value, tag) -> value to languageName(tag) },
                                language,
                            ) { language = it }
                        }
                    }
                }
                Reveal(provider == null) {
                    Column {
                        Gap(8.dp)
                        Note(stringResource(R.string.web_libraries_dialog_noProviderHint))
                    }
                }
            }
            item(key = "folders") {
                Section(stringResource(R.string.web_libraries_dialog_folders)) {
                    Panel {
                        paths.forEach { path ->
                            Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 2.dp, bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                                LucideIcon(Lucide.Server, null, size = 18.dp, tint = Palette.Muted)
                                Gap(12.dp)
                                Text(path, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                                RoundIconButton(Lucide.X, stringResource(R.string.web_libraries_dialog_removeFolder, path), { paths = paths - path }, background = Color.Transparent)
                            }
                            RowDivider()
                        }
                        Row(
                            Modifier.fillMaxWidth().clickable {
                                // Media usually sits beside the folder added last, or the ones other libraries use.
                                val beside = paths.lastOrNull() ?: existing?.paths?.firstOrNull() ?: knownPath
                                nav.folderPicker(beside?.let(::parentFolder), paths)
                            }.padding(horizontal = 16.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            LucideIcon(Lucide.FolderPlus, null, size = 18.dp, tint = Palette.Accent)
                            Gap(12.dp)
                            Text(stringResource(R.string.web_libraries_dialog_addFolder), style = MaterialTheme.typography.bodyLarge, color = Palette.Accent)
                        }
                    }
                }
            }
            item(key = "bottom") { Box(Modifier.navigationBarsPadding()) }
        }
    }
}

/** Where the folder picker leaves the folder it picked, for the editor under it. */
const val PICKED_FOLDER = "picked-folder"

private val PathsSaver = listSaver<List<String>, String>({ it }, { it })

private fun parentFolder(path: String): String = path.trimEnd('/').substringBeforeLast('/').ifEmpty { "/" }

/**
 * The server's folders, one level at a time, as a page over the editor,
 * opening at [start], with the folders in [added] marked. A row opens its
 * folder or adds it straight away; the bar at the bottom adds the one
 * that's open. Adding goes back to the editor with the folder.
 */
@Composable
fun FolderPickerScreen(start: String?, added: List<String>) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    var path by rememberSaveable { mutableStateOf(start) }
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
    val add = { folder: String -> nav.backWith(PICKED_FOLDER, folder) }
    val current = listing
    Column(Modifier.fillMaxSize()) {
        TopBar(stringResource(R.string.web_libraries_dialog_browse))
        // Keyed by the folder, so opening another one shows its path.
        key(current?.path ?: path) {
            PathField(current?.path ?: path ?: "/", Modifier.padding(horizontal = Gutter).padding(bottom = 8.dp)) { path = it }
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            when {
                current != null -> LazyColumn(Modifier.fillMaxSize()) {
                    current.parent?.let { parent ->
                        item(key = "..") { FolderRow("..", onOpen = { path = parent }, up = true, label = stringResource(R.string.web_libraries_browser_parent)) }
                    }
                    if (current.directories.isEmpty()) {
                        item(key = "empty") { Box(Modifier.padding(horizontal = Gutter, vertical = 16.dp)) { Note(stringResource(R.string.web_libraries_browser_empty)) } }
                    }
                    items(current.directories, key = { it.path }) { directory ->
                        FolderRow(
                            directory.name,
                            onOpen = { path = directory.path },
                            onAdd = if (directory.path in added) null else ({ add(directory.path) }),
                        )
                    }
                }
                error != null -> Text(error.orEmpty(), color = Palette.Danger, style = MaterialTheme.typography.bodySmall, modifier = Modifier.align(Alignment.Center).padding(Gutter))
                else -> Spinner(Modifier.align(Alignment.Center), size = 32.dp, color = Palette.Accent)
            }
        }
        // Always there, so the list above doesn't jump when the first folder loads.
        val root = current?.parent == null
        val already = current != null && current.path in added
        Column(Modifier.fillMaxWidth().background(Palette.Card).navigationBarsPadding().padding(horizontal = Gutter, vertical = 12.dp)) {
            Note(
                when {
                    current == null || root -> stringResource(R.string.web_libraries_browser_openRoot)
                    already -> stringResource(R.string.web_libraries_browser_alreadyAdded, current.path)
                    else -> stringResource(R.string.web_libraries_browser_adds, current.path)
                },
            )
            Gap(10.dp)
            MatineeButton(onClick = { current?.let { add(it.path) } }, enabled = current != null && !root && !already, modifier = Modifier.fillMaxWidth()) {
                Text(
                    when {
                        already -> stringResource(R.string.web_libraries_browser_added)
                        current == null || root -> stringResource(R.string.web_libraries_browser_add)
                        else -> stringResource(R.string.web_libraries_browser_addCurrent, current.path.trimEnd('/').substringAfterLast('/').ifEmpty { current.path })
                    },
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

/** The open folder's path, which a path typed in and Go replace. */
@Composable
private fun PathField(path: String, modifier: Modifier = Modifier, onOpen: (String) -> Unit) {
    var draft by remember { mutableStateOf(path) }
    val typed = draft.trim()
    val open = { if (typed.isNotEmpty() && typed != path) onOpen(typed) }
    MatineeTextField(
        value = draft,
        onValueChange = { draft = it },
        modifier = modifier,
        placeholder = stringResource(R.string.web_libraries_browser_path),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false, imeAction = ImeAction.Go),
        keyboardActions = KeyboardActions(onGo = { open() }),
        trailing = {
            RoundIconButton(
                Lucide.ChevronRight,
                stringResource(R.string.web_libraries_browser_go),
                open,
                background = Color.Transparent,
                tint = Palette.Muted,
                enabled = typed.isNotEmpty() && typed != path,
            )
        },
    )
}

@Composable
private fun FolderRow(name: String, onOpen: () -> Unit, onAdd: (() -> Unit)? = null, up: Boolean = false, label: String = stringResource(R.string.web_libraries_browser_open, name)) {
    Row(
        Modifier.fillMaxWidth().clickable(onClickLabel = label, onClick = onOpen)
            .padding(start = Gutter, end = Gutter, top = 2.dp, bottom = 2.dp).heightIn(min = 52.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (up) {
            LucideIcon(Lucide.ArrowLeft, null, size = 16.dp, tint = Palette.Muted)
            Gap(14.dp)
        }
        Text(name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (onAdd != null) {
            RoundIconButton(Lucide.FolderPlus, stringResource(R.string.web_libraries_browser_addNamed, name), onAdd, background = Color.Transparent, tint = Palette.Muted)
            Gap(4.dp)
        }
        if (!up) LucideIcon(Lucide.ChevronRight, null, size = 16.dp, tint = Palette.Muted)
    }
}
