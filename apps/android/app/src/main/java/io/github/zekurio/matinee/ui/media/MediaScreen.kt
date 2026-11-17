package io.github.zekurio.matinee.ui.media

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.input.InputMode
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalInputModeManager
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.withResumed
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.Library
import io.github.zekurio.matinee.api.isAdmin
import io.github.zekurio.matinee.ui.HEADER_HEIGHT
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.MediaPageContent
import io.github.zekurio.matinee.ui.MediaSearch
import io.github.zekurio.matinee.ui.SearchOrigin
import io.github.zekurio.matinee.ui.rememberReducedMotion
import io.github.zekurio.matinee.ui.searchMorphField
import io.github.zekurio.matinee.ui.searchMorphs
import io.github.zekurio.matinee.ui.components.ArtFrame
import io.github.zekurio.matinee.ui.components.DisconnectedAction
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.LoadingBox
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.SearchField
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.kit.CardShape
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.search.CatalogSearchEffect
import io.github.zekurio.matinee.ui.search.CatalogSearchState
import io.github.zekurio.matinee.ui.search.SearchEffect
import io.github.zekurio.matinee.ui.search.SearchFound
import io.github.zekurio.matinee.ui.search.SearchState
import io.github.zekurio.matinee.ui.search.SearchSuggestions
import io.github.zekurio.matinee.ui.tabBarPadding
import io.github.zekurio.matinee.ui.theme.Palette

/** Saves Media's search field across a configuration change and while a page covers Media. */
private val MediaSearchSaver = listSaver<MediaSearch, Any>(
    save = { listOf(it.query, it.opened, it.origin.name) },
    restore = { MediaSearch(it[0] as String, it[1] as Boolean, SearchOrigin.valueOf(it[2] as String)) },
)

/**
 * The Media tab, after Findroid's: the wide search field at the top, and
 * under it every library as a card, which opens the library. Tapped, the
 * field opens search, with Discover's rows under it while nothing's typed;
 * typing searches the server, its results grouped as search/Search.kt
 * shows them. While search is open Back takes the field's magnifier's
 * place. What shows for the field's state, and what Back does, is
 * [MediaSearch]'s: opened here, Back closes search, the text gone and the
 * keyboard down; opened from Home's search button, which opens Media with
 * the field taking the keyboard (`Navigator.search`), Back goes back to
 * Home, as the field shrinking back into the button (SearchMorph.kt).
 *
 * The field sits in the band Home's header has, [HEADER_HEIGHT] under the
 * status bar, its middle on the search button's, and the libraries start
 * 8 under it, where Home's cards do.
 */
@Composable
fun MediaScreen() {
    val nav = LocalNavigator.current
    val libraries = rememberLoader("libraries") { libraries.list() }
    // Opened from Home's button, search is open from the first frame, so nothing else shows under the field first.
    var field by rememberSaveable(stateSaver = MediaSearchSaver) {
        mutableStateOf(nav.searchPending?.let { MediaSearch().begin(it) } ?: MediaSearch())
    }
    val focus = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val inputMode = LocalInputModeManager.current
    val search = remember { SearchState() }
    SearchEffect(search, field.query)
    val catalog = remember { CatalogSearchState() }
    CatalogSearchEffect(catalog, field.query)

    // While a search opened by Home's button is open, the way back to Home
    // is the field shrinking back into the button; once Media's page is
    // gone, so is that.
    val morphs = field.returnsHome && searchMorphs(field.origin, rememberReducedMotion())
    SideEffect { if (morphs) nav.searchMorph = true }
    val owns by rememberUpdatedState(morphs)
    DisposableEffect(nav) { onDispose { if (owns) nav.searchMorph = false } }

    val close = {
        focusManager.clearFocus()
        keyboard?.hide()
        field = field.cancel()
    }
    // The field's arrow: back to Home if that's where search came from,
    // else back to the libraries. The page's leaving puts the keyboard away.
    val back = { if (field.returnsHome) nav.home() else close() }
    // The system's Back closes search before it leaves Media, as the field's
    // arrow does. While the keyboard is up, it goes first, as everywhere.
    // From Home's button it's the pages' own Back, which follows the gesture.
    BackHandler(enabled = field.closesOnBack, onBack = close)
    // Search asked for from Home's header: open, and the keyboard up once
    // Media's page is in, as a field can't hold focus before, and the
    // keyboard follows the field rather than rise before it's there.
    LaunchedEffect(nav) {
        snapshotFlow { nav.searchPending }.collect { pending ->
            if (pending == null) return@collect
            nav.searchPending = null
            field = field.begin(pending)
            lifecycle.withResumed {}
            focus.requestFocus()
            keyboard?.show()
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().heightIn(min = HEADER_HEIGHT).padding(horizontal = Gutter),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Gutter to gutter on a phone; on a wide window as wide as a search needs, from the start.
            SearchField(
                field.query,
                { field = field.type(it) },
                field.open,
                onBack = back,
                // A tap opens search. Focus that the system hands the field back with a
                // keyboard, as after Escape closed search, doesn't; typing does.
                onFocus = { if (inputMode.inputMode == InputMode.Touch) field = field.begin() },
                focus = focus,
                modifier = Modifier.weight(1f, fill = false).widthIn(max = 640.dp).searchMorphField(),
            )
            // Still showing the libraries from before, while the server can't be reached.
            if (!field.open) DisconnectedAction(libraries)
        }
        when (val content = field.content) {
            MediaPageContent.Libraries -> Libraries(libraries)
            // 12 from the field, as a list of results has always started.
            MediaPageContent.Suggestions -> Box(Modifier.padding(top = 4.dp)) { SearchSuggestions() }
            is MediaPageContent.Results -> Box(Modifier.padding(top = 4.dp)) {
                val names = (libraries.state as? Load.Ready)?.value.orEmpty().associate { it.id to it.name }
                SearchFound(content.text, search, catalog, names)
            }
        }
    }
}

/** Every library as a card, or why there are none. */
@Composable
private fun Libraries(libraries: Loader<List<Library>>) {
    when (val state = libraries.state) {
        Load.Loading -> LoadingBox(aboveTabBar = true)
        is Load.Failed -> ErrorBox(stringResource(R.string.home_load_failed), state.message, libraries::reload, aboveTabBar = true, disconnected = state.disconnected)
        is Load.Ready -> LazyVerticalGrid(
            columns = GridCells.Adaptive(160.dp),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Gutter, end = Gutter, top = 8.dp, bottom = tabBarPadding() + 24.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            if (state.value.isEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }, key = "empty") { NoLibraries() }
            }
            items(state.value, key = { it.id }) { library -> LibraryCard(library) }
        }
    }
}

/**
 * A library as the backdrop the server picked for it today, with its name
 * across it, as Jellyfin shows one, and how many titles it holds below.
 */
@Composable
private fun LibraryCard(library: Library) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val art = api.art(library.backdrop, ArtworkSize.Medium)
    Column(Modifier.clip(CardShape).clickable { nav.library(library.id) }) {
        ArtFrame(library.name, 16f / 9f) {
            if (art != null) {
                Picture(listOf(art), Modifier.fillMaxSize())
                Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f)))
            } else {
                LucideIcon(
                    if (library.kind == "shows") Lucide.Tv else Lucide.Film,
                    null,
                    size = 28.dp,
                    tint = Palette.Muted,
                    modifier = Modifier.align(Alignment.TopStart).padding(12.dp),
                )
            }
            Text(
                library.name,
                // Big enough to read across the room, over the backdrop.
                style = MaterialTheme.typography.headlineSmall.copy(
                    shadow = Shadow(Color.Black.copy(alpha = 0.6f), blurRadius = 12f),
                ),
                fontWeight = FontWeight.Bold,
                color = Color.White,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 12.dp),
            )
        }
        Text(
            res.getQuantityString(R.plurals.browse_title_count, library.titleCount, library.titleCount),
            style = MaterialTheme.typography.bodySmall,
            color = Palette.Muted,
            maxLines = 1,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
private fun NoLibraries() {
    val user = LocalUser.current
    Column(
        Modifier.fillMaxWidth().padding(vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // An admin sees every library, so none means none exist. Anyone else
        // may be in no group that opens one.
        val admin = user.isAdmin
        LucideIcon(if (admin) Lucide.FolderPlus else Lucide.Popcorn, null, size = 32.dp, tint = Palette.Muted)
        Gap(16.dp)
        Text(stringResource(if (admin) R.string.browse_home_no_libraries else R.string.browse_home_nothing_yet), style = MaterialTheme.typography.titleMedium)
        Gap(4.dp)
        Text(
            stringResource(if (admin) R.string.browse_home_no_libraries_admin else R.string.browse_home_nothing_yet_description),
            style = MaterialTheme.typography.bodyMedium,
            color = Palette.Muted,
            textAlign = TextAlign.Center,
        )
    }
}
