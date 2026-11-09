package io.github.zekurio.matinee.ui.metadata

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.IMAGE_TYPES
import io.github.zekurio.matinee.api.ImageSlot
import io.github.zekurio.matinee.api.ImageTarget
import io.github.zekurio.matinee.api.ItemImage
import io.github.zekurio.matinee.api.MAX_IMAGE_BYTES
import io.github.zekurio.matinee.api.MetadataMatch
import io.github.zekurio.matinee.api.MetadataProvider
import io.github.zekurio.matinee.api.RemoteImage
import io.github.zekurio.matinee.api.Title
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.components.Badge
import io.github.zekurio.matinee.ui.components.ButtonLook
import io.github.zekurio.matinee.ui.components.ControlShape
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.LoadingBox
import io.github.zekurio.matinee.ui.components.LocalActions
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.MatineeTextField
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.isWide
import io.github.zekurio.matinee.ui.components.tone
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.theme.Palette
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/*
 * An admin's metadata tools, as the web's: fix a title's match, and pick
 * or upload the images of a title, season, or episode. Pages here rather
 * than the web's dialogs, as a phone's keyboard and a grid of images need
 * the whole screen.
 */

/**
 * The metadata provider of a library, which fix match, refresh, and the
 * image editor ask: loading, then the provider, or null when the library
 * has none. For admins only; the server turns anyone else away.
 */
@Composable
fun rememberLibraryProvider(libraryId: String): Load<MetadataProvider?> =
    rememberLoader("provider-$libraryId") {
        val id = libraries().firstOrNull { it.id == libraryId }?.metadataProvider
        if (id == null) null else metadataProviders().firstOrNull { it.id == id }
    }.state

/** The page's title loaded, or its loading and failure under the top bar. */
@Composable
private fun TitlePage(titleId: String, heading: String, content: @Composable (Title) -> Unit) {
    val loader = rememberLoader("title-$titleId") { title(titleId) }
    Column(Modifier.fillMaxSize()) {
        TopBar(heading)
        when (val state = loader.state) {
            Load.Loading -> LoadingBox()
            is Load.Failed -> ErrorBox(stringResource(R.string.title_load_error), state.message, loader::reload)
            is Load.Ready -> content(state.value)
        }
    }
}

@Composable
private fun bottomPadding() = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + 24.dp

/**
 * Search the library's provider by hand and pick the right entry, for a
 * title the automatic match got wrong or missed. Opens on a search for
 * the title's name and year.
 */
@Composable
fun IdentifyScreen(titleId: String) {
    TitlePage(titleId, stringResource(R.string.title_identify_title)) { title -> IdentifyForm(title) }
}

@Composable
private fun IdentifyForm(title: Title) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val snackbar = LocalSnackbar.current
    val appScope = LocalActions.current.scope
    val viewer = LocalContext.current.app.viewer
    val keyboard = LocalSoftwareKeyboardController.current
    val scope = rememberCoroutineScope()
    val provider = (rememberLibraryProvider(title.libraryId) as? Load.Ready)?.value
    var name by rememberSaveable { mutableStateOf(title.name) }
    var year by rememberSaveable { mutableStateOf(title.year?.toString().orEmpty()) }
    var submitted by remember { mutableStateOf(title.name to title.year) }
    var results by remember { mutableStateOf<Load<List<MetadataMatch>>>(Load.Loading) }
    var matching by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(submitted) {
        results = Load.Loading
        results = try {
            Load.Ready(api.findMatches(title.id, submitted.first, submitted.second))
        } catch (e: IOException) {
            Load.Failed(e.message.orEmpty())
        }
    }
    val search = {
        keyboard?.hide()
        error = null
        submitted = name.trim().ifEmpty { title.name } to year.trim().toIntOrNull()
    }
    val pick = { match: MetadataMatch ->
        matching = match.id
        error = null
        // In the page's scope, so leaving the page drops the answer rather
        // than taking the person back from wherever they went.
        scope.launch {
            try {
                val updated = api.identify(title.id, match.id)
                viewer.changed()
                appScope.launch { snackbar.showSnackbar(res.getString(R.string.title_identify_matched, updated.name)) }
                nav.back()
            } catch (e: IOException) {
                error = e.message
                matching = null
            }
        }
        Unit
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = Gutter, end = Gutter, bottom = bottomPadding()),
    ) {
        if (provider != null) {
            item(key = "description") {
                Text(
                    stringResource(R.string.title_identify_description, provider.name, title.path),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Palette.Muted,
                )
                Gap(16.dp)
            }
        }
        item(key = "form") {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Column(Modifier.weight(1f)) {
                    FieldLabel(stringResource(R.string.title_identify_name))
                    MatineeTextField(
                        name,
                        { name = it },
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { search() }),
                    )
                }
                Column(Modifier.width(92.dp)) {
                    FieldLabel(stringResource(R.string.title_identify_year))
                    MatineeTextField(
                        year,
                        { typed -> year = typed.filter(Char::isDigit).take(4) },
                        placeholder = stringResource(R.string.title_identify_any_year),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { search() }),
                    )
                }
            }
            Gap(12.dp)
            MatineeButton(onClick = search, look = ButtonLook.Secondary, modifier = Modifier.fillMaxWidth()) {
                LucideIcon(Lucide.Search, null, size = 16.dp)
                Text(stringResource(R.string.title_identify_search))
            }
            Gap(12.dp)
        }
        error?.let { message ->
            item(key = "error") {
                Text(message, style = MaterialTheme.typography.bodyMedium, color = Palette.Danger)
                Gap(8.dp)
            }
        }
        when (val state = results) {
            Load.Loading -> item(key = "loading") { LoadingBox(Modifier.padding(32.dp)) }
            is Load.Failed -> item(key = "failed") {
                Text(state.message, style = MaterialTheme.typography.bodyMedium, color = Palette.Danger)
            }
            is Load.Ready -> if (state.value.isEmpty()) {
                item(key = "empty") {
                    Text(
                        stringResource(R.string.title_identify_empty, provider?.name.orEmpty(), submitted.first),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Palette.Muted,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                    )
                }
            } else {
                items(state.value, key = { it.id }) { match ->
                    MatchRow(
                        match,
                        current = match.id == title.providerId,
                        pending = matching == match.id,
                        enabled = matching == null,
                    ) { pick(match) }
                }
            }
        }
    }
}

@Composable
private fun FieldLabel(text: String) {
    Text(text, style = MaterialTheme.typography.labelMedium, color = Palette.Muted, modifier = Modifier.padding(bottom = 6.dp))
}

/** A provider's entry: its poster, name and year, whether it's the match now, and what it's about. */
@Composable
private fun MatchRow(match: MetadataMatch, current: Boolean, pending: Boolean, enabled: Boolean, onPick: () -> Unit) {
    val api = LocalApi.current
    Row(
        Modifier
            .fillMaxWidth()
            .clip(ControlShape)
            .clickable(enabled = enabled, onClick = onPick)
            .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.width(48.dp).aspectRatio(2f / 3f).clip(MaterialTheme.shapes.extraSmall).tone(match.id)) {
            Picture(listOfNotNull(api.art(match.poster)), Modifier.fillMaxSize())
        }
        Column(Modifier.weight(1f)) {
            @OptIn(ExperimentalLayoutApi::class)
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
                itemVerticalAlignment = Alignment.CenterVertically,
            ) {
                Text(match.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                match.year?.let { Text(it.toString(), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted) }
                if (current) Badge(stringResource(R.string.title_identify_current))
            }
            match.overview?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = Palette.Muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        if (pending) CircularProgressIndicator(Modifier.size(18.dp), color = Palette.Accent, strokeWidth = 2.dp)
    }
}

/** What a change to an image does, to show its spinner. */
private sealed interface Change {
    /** One of the provider's images, or none with null. */
    data class Pick(val imageId: String?) : Change

    class Upload(val bytes: ByteArray, val type: String) : Change

    data object Reset : Change
}

/**
 * Pick the images of a title, season, or episode from what the library's
 * provider has, or upload them. What an admin picks stays when the
 * metadata is fetched again.
 */
@Composable
fun ImagesScreen(target: ImageTarget) {
    TitlePage(target.titleId, stringResource(R.string.title_images_title)) { title -> ImageEditor(title, target) }
}

@Composable
private fun ImageEditor(title: Title, target: ImageTarget) {
    val api = LocalApi.current
    val res = LocalResources.current
    val context = LocalContext.current
    val snackbar = LocalSnackbar.current
    val viewer = context.app.viewer
    val scope = rememberCoroutineScope()
    val slots = target.slots
    var slot by rememberSaveable { mutableStateOf(slots.first()) }
    val images = rememberLoader("images-${target.titleId}-${target.season}-${target.episode}") { images(target) }
    // What the last change answered, over the load, which catches up after.
    var changed by remember { mutableStateOf<List<ItemImage>?>(null) }
    val current = changed ?: (images.state as? Load.Ready)?.value
    val providerState = rememberLibraryProvider(title.libraryId)
    // One without its API key has nothing to list either.
    val providerName = (providerState as? Load.Ready)?.value?.takeIf { it.configured }?.name
    // A provider lists images only for an entry the title matched.
    val lists = providerName != null && title.providerId != null
    var allLanguages by rememberSaveable(slot) { mutableStateOf(false) }
    var remote by remember { mutableStateOf<Load<List<RemoteImage>>>(Load.Loading) }
    var busy by remember { mutableStateOf<Change?>(null) }

    LaunchedEffect(slot, allLanguages, lists) {
        if (!lists) return@LaunchedEffect
        remote = Load.Loading
        remote = try {
            Load.Ready(api.remoteImages(target, slot, allLanguages))
        } catch (e: IOException) {
            Load.Failed(e.message.orEmpty())
        }
    }

    val failure = stringResource(R.string.title_images_error)
    fun showError(message: String?) {
        scope.launch { snackbar.showSnackbar(listOfNotNull(failure, message?.takeIf { it.isNotBlank() }).joinToString(": ")) }
    }
    fun change(action: Change) {
        busy = action
        scope.launch {
            try {
                changed = when (action) {
                    is Change.Pick -> api.setImage(target, slot, action.imageId)
                    is Change.Upload -> api.uploadImage(target, slot, action.bytes, action.type)
                    Change.Reset -> api.resetImage(target, slot)
                }
                // Pages that show the images fetch them again.
                viewer.changed()
            } catch (e: IOException) {
                showError(e.message)
            } finally {
                busy = null
            }
        }
    }
    val wrongType = stringResource(R.string.title_images_wrong_type)
    val tooBig = stringResource(R.string.title_images_too_big)
    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val resolver = context.contentResolver
            val type = resolver.getType(uri)
            if (type == null || type !in IMAGE_TYPES) return@launch showError(wrongType)
            // Reads no more than one byte past the limit, to tell a file over it.
            val bytes = withContext(Dispatchers.IO) {
                runCatching { resolver.openInputStream(uri)?.use { it.readAtMost((MAX_IMAGE_BYTES + 1).toInt()) } }.getOrNull()
            }
            when {
                bytes == null || bytes.isEmpty() -> showError(null)
                bytes.size > MAX_IMAGE_BYTES -> showError(tooBig)
                else -> change(Change.Upload(bytes, type))
            }
        }
    }

    val name = when {
        target.season == null -> title.name
        target.episode == null -> stringResource(R.string.title_season_of, title.name, seasonName(target.season, res))
        else -> stringResource(
            R.string.title_season_of,
            title.name,
            if (target.season == 0) stringResource(R.string.media_special, target.episode)
            else stringResource(R.string.media_episode_code, target.season, target.episode),
        )
    }
    val inUse = current?.firstOrNull { it.slot == slot }
    LazyVerticalGrid(
        GridCells.Fixed(if (slot == ImageSlot.POSTER) 3 else 2),
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = Gutter, end = Gutter, bottom = bottomPadding()),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        wide("description") {
            Text(
                if (providerName != null) stringResource(R.string.title_images_description, name, providerName)
                else stringResource(R.string.title_images_description_local, name),
                style = MaterialTheme.typography.bodyMedium,
                color = Palette.Muted,
            )
        }
        if (images.state is Load.Failed) {
            wide("loadError") {
                Text(
                    stringResource(R.string.title_images_load_error, (images.state as Load.Failed).message),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Palette.Danger,
                )
            }
            return@LazyVerticalGrid
        }
        wide("slots") {
            // Each slot with the image it has, which also picks the slot to
            // change. Scrolls sideways when they don't fit.
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                slots.forEach { each ->
                    SlotCard(
                        each,
                        current?.firstOrNull { it.slot == each },
                        toneKey = title.id,
                        providerName = providerName,
                        selected = each == slot,
                        onSelect = if (slots.size > 1) ({ slot = each }) else null,
                    )
                }
            }
        }
        wide("actions") {
            val upload = @Composable { modifier: Modifier ->
                MatineeButton(
                    onClick = { pickFile.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    look = ButtonLook.Secondary,
                    enabled = busy == null,
                    height = 40.dp,
                    modifier = modifier,
                ) {
                    Busy(busy is Change.Upload, Lucide.ImageUp)
                    Text(stringResource(R.string.title_images_upload))
                }
            }
            val remove = if (inUse?.image == null) null else @Composable { modifier: Modifier ->
                MatineeButton(onClick = { change(Change.Pick(null)) }, look = ButtonLook.Outline, enabled = busy == null, height = 40.dp, modifier = modifier) {
                    Busy(busy == Change.Pick(null), Lucide.Trash)
                    Text(stringResource(R.string.title_images_remove))
                }
            }
            val reset = if (inUse?.chosen != true || !lists) null else @Composable { modifier: Modifier ->
                MatineeButton(onClick = { change(Change.Reset) }, look = ButtonLook.Outline, enabled = busy == null, height = 40.dp, modifier = modifier) {
                    Busy(busy == Change.Reset, Lucide.RotateCcw)
                    Text(stringResource(R.string.title_images_reset, providerName.orEmpty()), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Column {
                if (isWide()) {
                    @OptIn(ExperimentalLayoutApi::class)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        upload(Modifier)
                        remove?.invoke(Modifier)
                        reset?.invoke(Modifier)
                    }
                } else {
                    // A phone's buttons fill the width: upload and remove side by
                    // side, and going back to the provider's, whose name is
                    // long, on a line of its own.
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        upload(Modifier.weight(1f))
                        remove?.invoke(Modifier.weight(1f))
                    }
                    reset?.let {
                        Gap(8.dp)
                        it(Modifier.fillMaxWidth())
                    }
                }
                if (lists) {
                    Row(
                        Modifier.fillMaxWidth().padding(top = 8.dp).clickable { allLanguages = !allLanguages },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(stringResource(R.string.title_images_all_languages), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                        Switch(
                            checked = allLanguages,
                            onCheckedChange = { allLanguages = it },
                            colors = SwitchDefaults.colors(checkedTrackColor = Palette.Accent, checkedThumbColor = Color.Black),
                        )
                    }
                }
            }
        }
        when {
            providerState is Load.Loading -> wide("provider") { LoadingBox(Modifier.padding(32.dp)) }
            !lists -> wide("nothing") {
                Note(
                    if (providerName != null) stringResource(R.string.title_images_unmatched, providerName)
                    else stringResource(R.string.title_images_no_provider),
                )
            }
            else -> when (val state = remote) {
                Load.Loading -> wide("remote") { LoadingBox(Modifier.padding(32.dp)) }
                is Load.Failed -> wide("remoteError") {
                    Text(state.message, style = MaterialTheme.typography.bodyMedium, color = Palette.Danger)
                }
                is Load.Ready -> if (state.value.isEmpty()) {
                    wide("empty") {
                        Note(
                            if (allLanguages) stringResource(R.string.title_images_empty, providerName.orEmpty())
                            else stringResource(R.string.title_images_empty_language, providerName.orEmpty()),
                        )
                    }
                } else {
                    items(state.value, key = { it.id }) { image ->
                        Choice(
                            image,
                            slot,
                            toneKey = title.id,
                            inUse = image.id == inUse?.image?.id,
                            pending = busy == Change.Pick(image.id),
                            enabled = busy == null,
                        ) { change(Change.Pick(image.id)) }
                    }
                }
            }
        }
    }
}

/** Up to [limit] bytes of the stream: enough to tell one over a limit without reading all of it. */
private fun InputStream.readAtMost(limit: Int): ByteArray {
    val out = ByteArrayOutputStream()
    val buffer = ByteArray(64 * 1024)
    while (out.size() < limit) {
        val read = read(buffer, 0, minOf(buffer.size, limit - out.size()))
        if (read < 0) break
        out.write(buffer, 0, read)
    }
    return out.toByteArray()
}

/** An item across the whole grid. */
private fun LazyGridScope.wide(key: String, content: @Composable () -> Unit) {
    item(key = key, span = { GridItemSpan(maxLineSpan) }) { content() }
}

@Composable
private fun Busy(busy: Boolean, icon: Int) {
    if (busy) CircularProgressIndicator(Modifier.size(16.dp), color = Palette.Foreground, strokeWidth = 2.dp)
    else LucideIcon(icon, null, size = 16.dp)
}

@Composable
private fun Note(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        color = Palette.Muted,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
    )
}

private fun aspect(slot: String) = if (slot == ImageSlot.POSTER) 2f / 3f else 16f / 9f

@Composable
private fun slotName(slot: String): String = stringResource(
    when (slot) {
        ImageSlot.POSTER -> R.string.title_images_slot_poster
        ImageSlot.BACKDROP -> R.string.title_images_slot_backdrop
        ImageSlot.LOGO -> R.string.title_images_slot_logo
        else -> R.string.title_images_slot_still
    },
)

/** "Picked from TMDB", "Uploaded", "None", and so on. */
@Composable
private fun stateText(slot: String, current: ItemImage, providerName: String?): String = when {
    current.image == null && current.chosen -> stringResource(R.string.title_images_state_removed)
    current.image == null && slot == ImageSlot.STILL -> stringResource(R.string.title_images_state_none_frame)
    current.image == null -> stringResource(R.string.title_images_state_none)
    current.uploaded -> stringResource(R.string.title_images_state_uploaded)
    providerName == null -> stringResource(R.string.title_images_state_picked)
    current.chosen -> stringResource(R.string.title_images_state_picked_from, providerName)
    else -> stringResource(R.string.title_images_state_from, providerName)
}

/** A slot's name and the image it has, all at one height whatever the image's shape. Picks the slot when there are several. */
@Composable
private fun SlotCard(
    slot: String,
    current: ItemImage?,
    toneKey: String,
    providerName: String?,
    selected: Boolean,
    onSelect: (() -> Unit)?,
) {
    val api = LocalApi.current
    Row(
        Modifier
            .clip(ControlShape)
            .border(1.dp, if (selected && onSelect != null) Palette.Accent else Palette.Border, ControlShape)
            .background(if (selected && onSelect != null) Palette.Accent.copy(alpha = 0.1f) else Color.Transparent)
            .then(if (onSelect != null) Modifier.clickable(onClick = onSelect) else Modifier)
            .padding(6.dp)
            .padding(end = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.height(56.dp).aspectRatio(aspect(slot)).clip(MaterialTheme.shapes.extraSmall).tone(toneKey)) {
            Picture(
                listOfNotNull(api.art(current?.image, ArtworkSize.Thumb)),
                Modifier.fillMaxSize().then(if (slot == ImageSlot.LOGO) Modifier.padding(4.dp) else Modifier),
                contentScale = if (slot == ImageSlot.LOGO) ContentScale.Fit else ContentScale.Crop,
            )
        }
        Column {
            Text(slotName(slot), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            Text(
                current?.let { stateText(slot, it, providerName) } ?: "",
                style = MaterialTheme.typography.bodySmall,
                color = Palette.Muted,
                maxLines = 1,
            )
        }
    }
}

/** One of the provider's images: the picture, a tick on the one in use, and its size and language. */
@Composable
private fun Choice(
    image: RemoteImage,
    slot: String,
    toneKey: String,
    inUse: Boolean,
    pending: Boolean,
    enabled: Boolean,
    onPick: () -> Unit,
) {
    val api = LocalApi.current
    val label = stringResource(if (inUse) R.string.title_images_in_use else R.string.title_images_use)
    Column(Modifier.clip(ControlShape).clickable(enabled = enabled, onClickLabel = label, onClick = onPick)) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(aspect(slot))
                .clip(ControlShape)
                .tone(toneKey)
                .border(if (inUse) 2.dp else 1.dp, if (inUse) Palette.Accent else Palette.Border, ControlShape),
        ) {
            Picture(
                listOfNotNull(api.art(image.preview)),
                Modifier.fillMaxSize().then(if (slot == ImageSlot.LOGO) Modifier.padding(8.dp) else Modifier),
                contentScale = if (slot == ImageSlot.LOGO) ContentScale.Fit else ContentScale.Crop,
            )
            if (inUse) {
                Box(
                    Modifier.align(Alignment.TopEnd).padding(6.dp).size(20.dp).clip(CircleShape).background(Palette.Accent),
                    contentAlignment = Alignment.Center,
                ) {
                    LucideIcon(Lucide.Check, null, size = 14.dp, tint = Color.Black)
                }
            }
            if (pending) {
                Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(Modifier.size(22.dp), color = Color.White, strokeWidth = 2.dp)
                }
            }
        }
        Gap(6.dp)
        // A line each, as three posters to a row leave no room for both on one.
        captionLines(image, slot).forEach {
            Text(it, style = MaterialTheme.typography.bodySmall, color = Palette.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** "1000 × 1500" and "English", from what the provider says. Stills have no text to speak of, whatever it says. */
@Composable
private fun captionLines(image: RemoteImage, slot: String): List<String> {
    val size = if (image.width != null && image.height != null) stringResource(R.string.title_images_size, image.width, image.height) else null
    val language = when {
        slot == ImageSlot.STILL -> null
        image.language != null -> Locale.forLanguageTag(image.language).getDisplayLanguage(Locale.getDefault())
            .replaceFirstChar { it.titlecase(Locale.getDefault()) }
        else -> stringResource(R.string.title_images_no_text)
    }
    return listOfNotNull(size, language)
}
