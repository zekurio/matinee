package io.github.zekurio.matinee.ui.browse

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.CreditKind
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.ui.AppHeader
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.components.Chip
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.LoadingBox
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.PosterCard
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.initials
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette

/** A genre's or a studio's titles from every library. */
@Composable
fun BrowseScreen(genre: String?, studio: String?) {
    val name = genre ?: studio.orEmpty()
    var kind by rememberSaveable { mutableStateOf<String?>(null) }
    val pages = rememberTitlePages("browse-$genre-$studio-$kind") { offset, limit ->
        browse(genre = genre, studio = studio, kind = kind, limit = limit, offset = offset).let {
            io.github.zekurio.matinee.api.TitleList(it.items, it.total)
        }
    }
    val res = LocalResources.current
    Column(Modifier.fillMaxSize()) {
        AppHeader()
        PosterGrid(
            pages,
            detail = { it.year?.toString() },
            empty = {
                Text(
                    stringResource(if (genre != null) R.string.browse_genre_empty else R.string.browse_studio_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Palette.Muted,
                    modifier = Modifier.padding(vertical = 48.dp),
                )
            },
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column {
                    Text(
                        stringResource(if (genre != null) R.string.browse_genre else R.string.browse_studio),
                        style = MaterialTheme.typography.labelLarge,
                        color = Palette.Muted,
                    )
                    PageTitle(name, pages.total?.let { res.getQuantityString(R.plurals.browse_title_count, it, it) })
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(bottom = 8.dp)) {
                        Chip(stringResource(R.string.browse_kind_all), kind == null, { kind = null })
                        Chip(stringResource(R.string.browse_kind_movie), kind == TitleKind.MOVIE, { kind = TitleKind.MOVIE })
                        Chip(stringResource(R.string.browse_kind_show), kind == TitleKind.SHOW, { kind = TitleKind.SHOW })
                    }
                }
            }
        }
    }
}

/** Someone in the cast or crew, and everything they're in. */
@Composable
fun PersonScreen(name: String) {
    val api = LocalApi.current
    val res = LocalResources.current
    val person = rememberLoader("person-$name") { person(name) }
    Column(Modifier.fillMaxSize()) {
        AppHeader()
        when (val state = person.state) {
            Load.Loading -> LoadingBox()
            is Load.Failed -> ErrorBox(stringResource(R.string.person_load_failed), state.message, person::reload)
            is Load.Ready -> {
                val value = state.value
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(150.dp),
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = Gutter, end = Gutter, bottom = 32.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalArrangement = Arrangement.spacedBy(20.dp),
                ) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Row(
                            Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(20.dp),
                        ) {
                            Box(
                                Modifier.size(112.dp).clip(CircleShape).background(Palette.Secondary),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(initials(value.name), style = MaterialTheme.typography.headlineMedium, color = Palette.Muted)
                                api.art(value.photo)?.let { Picture(listOf(it), Modifier.fillMaxSize()) }
                            }
                            Column(Modifier.weight(1f)) {
                                Text(value.name, style = MaterialTheme.typography.headlineMedium)
                                Gap(4.dp)
                                Text(
                                    listOf(
                                        creditKind(value.kind, res, 1),
                                        res.getQuantityString(R.plurals.browse_title_count, value.titleCount, value.titleCount),
                                    ).joinToString(" · "),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = Palette.Muted,
                                )
                            }
                        }
                    }
                    items(value.credits, key = { "${it.title.id}-${it.kind}" }) { credit ->
                        PosterCard(
                            credit.title,
                            credit.role ?: credit.title.year?.toString()
                                ?: creditKind(credit.kind, res, 1),
                        )
                    }
                    item(span = { GridItemSpan(maxLineSpan) }) { Box(Modifier.navigationBarsPadding()) }
                }
            }
        }
    }
}

/** "Director", or "Directors" for [count] above one. */
fun creditKind(kind: String, res: android.content.res.Resources, count: Int): String {
    val plural = when (kind) {
        CreditKind.CREATOR -> R.plurals.people_credit_creator
        CreditKind.DIRECTOR -> R.plurals.people_credit_director
        CreditKind.WRITER -> R.plurals.people_credit_writer
        else -> R.plurals.people_credit_actor
    }
    return res.getQuantityString(plural, count)
}
