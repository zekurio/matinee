package io.github.zekurio.matinee.ui.tv.browse

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.ui.browse.BROWSE_KINDS
import io.github.zekurio.matinee.ui.browse.rememberBrowsePages
import io.github.zekurio.matinee.ui.components.ImageSource
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.tv.ShowBackdrop
import io.github.zekurio.matinee.ui.tv.TvGrid
import io.github.zekurio.matinee.ui.tv.TvButton
import io.github.zekurio.matinee.ui.tv.TvTitleGrid
import io.github.zekurio.matinee.ui.tv.home.FocusedItem
import io.github.zekurio.matinee.ui.tv.rememberTvFocusMemory
import io.github.zekurio.matinee.ui.tv.titleInfo

/**
 * A genre's or a studio's titles from every library on a TV: its name,
 * the phone's choice of movies, shows, or both as buttons, and the titles
 * as a grid of posters.
 */
@Composable
fun TvBrowseScreen(genre: String?, studio: String?) {
    val api = LocalApi.current
    val res = LocalResources.current
    var kind by rememberSaveable { mutableStateOf<String?>(null) }
    val pages = rememberBrowsePages(genre, studio, kind)
    val memory = rememberTvFocusMemory()
    var focused by remember { mutableStateOf<FocusedItem?>(null) }
    var backdrop by remember { mutableStateOf(emptyList<ImageSource>()) }
    val current by rememberUpdatedState(pages)
    // Restore keeps its first lambda, so it reads the pages through current.
    memory.Restore {
        current.items.firstOrNull()?.let { TvGrid.ROW to it.id }
            ?: (CONTROLS to kindKey(kind)).takeIf { current.done || current.error != null }
    }
    ShowBackdrop(backdrop)
    LaunchedEffect(kind) {
        focused = null
        backdrop = emptyList()
    }

    Column(Modifier.fillMaxSize()) {
        GridHeader(
            title = genre ?: studio.orEmpty(),
            detail = listOfNotNull(
                stringResource(if (genre != null) R.string.browse_genre else R.string.browse_studio),
                pages.total?.let { res.getQuantityString(R.plurals.browse_title_count, it, it) },
            ).joinToString("  ·  "),
            focused = focused,
        ) {
            BROWSE_KINDS.forEach { (value, label) ->
                TvButton(
                    stringResource(label),
                    { kind = value },
                    with(memory) { Modifier.item(CONTROLS, kindKey(value)) },
                    icon = when (value) {
                        TitleKind.MOVIE -> Lucide.Film
                        TitleKind.SHOW -> Lucide.Tv
                        else -> Lucide.LibraryBig
                    },
                    active = kind == value,
                )
            }
        }
        TvTitleGrid(
            pages,
            memory,
            empty = stringResource(if (genre != null) R.string.browse_genre_empty else R.string.browse_studio_empty),
            onFocus = { title ->
                val info = titleInfo(title, api, res, kind = kind == null)
                focused = info
                backdrop = info.backdrop
            },
            modifier = Modifier.weight(1f),
            scrollKey = kind,
        )
    }
}

private fun kindKey(kind: String?) = kind ?: "all"
