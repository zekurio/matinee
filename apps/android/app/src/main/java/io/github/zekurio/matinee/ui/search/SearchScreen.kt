package io.github.zekurio.matinee.ui.search

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.SearchResults
import io.github.zekurio.matinee.ui.AppHeader
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.browse.creditKind
import io.github.zekurio.matinee.ui.components.Chip
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeTextField
import io.github.zekurio.matinee.ui.components.PersonCard
import io.github.zekurio.matinee.ui.components.PosterCard
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.components.SectionTitle
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette
import java.io.IOException
import kotlinx.coroutines.delay

private const val LIMIT = 40

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SearchScreen() {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    var query by rememberSaveable { mutableStateOf("") }
    var results by remember { mutableStateOf<SearchResults?>(null) }
    var searching by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    val libraries = rememberLoader("libraries") { libraries() }
    val names = (libraries.state as? Load.Ready)?.value.orEmpty().associate { it.id to it.name }

    LaunchedEffect(Unit) { if (query.isEmpty()) focus.requestFocus() }
    LaunchedEffect(query) {
        val text = query.trim()
        if (text.isEmpty()) {
            results = null
            return@LaunchedEffect
        }
        delay(250)
        searching = true
        failed = false
        try {
            results = api.search(text, LIMIT)
        } catch (_: IOException) {
            failed = true
        } finally {
            searching = false
        }
    }

    Column(Modifier.fillMaxSize()) {
        AppHeader(search = false)
        Row(Modifier.padding(horizontal = Gutter).padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            MatineeTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = stringResource(R.string.search_field),
                leadingIcon = Lucide.Search,
                modifier = Modifier.focusRequester(focus),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                trailing = if (query.isNotEmpty()) ({
                    RoundIconButton(Lucide.X, stringResource(R.string.search_clear), { query = "" }, background = Color.Transparent, size = 40.dp, iconSize = 18.dp)
                }) else null,
            )
        }
        val found = results
        val text = query.trim()
        when {
            text.isEmpty() -> Hint(stringResource(R.string.search_intro))
            failed -> Hint(stringResource(R.string.search_failed))
            found == null -> Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Palette.Accent)
            }
            found.titles.isEmpty() && found.people.isEmpty() && found.genres.isEmpty() && found.studios.isEmpty() && found.users.isEmpty() ->
                Hint(stringResource(R.string.search_no_match, text), stringResource(R.string.search_no_match_hint), Lucide.SearchX)
            else -> LazyVerticalGrid(
                columns = GridCells.Adaptive(150.dp),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = Gutter, end = Gutter, bottom = 32.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                val groups = found.titles.groupBy { it.libraryId }
                groups.forEach { (libraryId, titles) ->
                    item(span = { GridItemSpan(maxLineSpan) }, key = "lib-$libraryId") {
                        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(names[libraryId] ?: stringResource(R.string.search_titles_heading), style = MaterialTheme.typography.titleLarge)
                            Text(res.getQuantityString(R.plurals.browse_title_count, titles.size, titles.size), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                        }
                    }
                    items(titles, key = { it.id }) { title -> PosterCard(title, title.year?.toString()) }
                }
                if (found.people.isNotEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "people") {
                        Column {
                            SectionTitle(stringResource(R.string.search_section_cast))
                            Gap(12.dp)
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                items(found.people, key = { it.name }) { person ->
                                    PersonCard(
                                        person.name,
                                        creditKind(person.kind, res, 1),
                                        api.art(person.photo, ArtworkSize.Thumb),
                                        Modifier.width(railItemWidth(RailArt.Person)),
                                    )
                                }
                            }
                        }
                    }
                }
                if (found.genres.isNotEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "genres") {
                        Column {
                            SectionTitle(stringResource(R.string.search_section_genres))
                            Gap(12.dp)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                found.genres.forEach { Chip(it.name, false, { nav.genre(it.name) }) }
                            }
                        }
                    }
                }
                if (found.studios.isNotEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "studios") {
                        Column {
                            SectionTitle(stringResource(R.string.search_section_studios))
                            Gap(12.dp)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                found.studios.forEach { Chip(it.name, false, { nav.studio(it.name) }) }
                            }
                        }
                    }
                }
                if (searching) {
                    item(span = { GridItemSpan(maxLineSpan) }, key = "searching") {
                        Text(stringResource(R.string.search_searching), style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
                    }
                }
                item(span = { GridItemSpan(maxLineSpan) }, key = "bottom") { Box(Modifier.navigationBarsPadding()) }
            }
        }
    }
}

@Composable
private fun Hint(text: String, detail: String? = null, icon: Int? = null) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (icon != null) {
            LucideIcon(icon, null, size = 28.dp, tint = Palette.Muted)
            Gap(12.dp)
        }
        Text(text, style = MaterialTheme.typography.bodyLarge, color = if (detail != null) Palette.Foreground else Palette.Muted)
        if (detail != null) {
            Gap(4.dp)
            Text(detail, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
        }
    }
}
