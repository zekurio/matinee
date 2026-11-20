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
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.CatalogInput
import io.github.zekurio.matinee.api.CatalogTitleSummary
import io.github.zekurio.matinee.api.CreditKind
import io.github.zekurio.matinee.api.PersonDepartment
import io.github.zekurio.matinee.api.PersonProfile
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.components.ActiveFilterChips
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.FilterButton
import io.github.zekurio.matinee.ui.components.LoadingBox
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.PosterCard
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.initials
import io.github.zekurio.matinee.ui.formatDay
import io.github.zekurio.matinee.ui.genreName
import io.github.zekurio.matinee.ui.kit.ButtonLook
import io.github.zekurio.matinee.ui.kit.Chip
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.MatineeButton
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.requests.CatalogCard
import io.github.zekurio.matinee.ui.requests.FollowTitles
import io.github.zekurio.matinee.ui.requests.key
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.title.Overview

/** A genre's or a studio's titles from every library, with the filters and sorts a library has. */
@Composable
fun BrowseScreen(genre: String?, studio: String?) {
    val name = genre?.let { genreName(it) } ?: studio.orEmpty()
    var kind by rememberSaveable { mutableStateOf<String?>(null) }
    val state = rememberTitleListState()
    var filtering by rememberSaveable { mutableStateOf(false) }
    val options = rememberFilterOptions(kind = kind, genre = genre, studio = studio)
    val offered = (options.state as? Load.Ready)?.value
    val pages = rememberBrowsePages(genre, studio, kind, state)
    val res = LocalResources.current
    val chips = activeTitleFilters(state.filters, offered, res) { state.filters = it }
    Column(Modifier.fillMaxSize()) {
        TopBar(name) {
            if (offered != null) FilterButton(state.filters.count()) { filtering = true }
            TitleSortButton(state, offered)
        }
        PosterGrid(
            pages,
            detail = { title -> titleCardDetail(title, state.sort, res) },
            empty = {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(vertical = 48.dp)) {
                    Text(
                        stringResource(
                            when {
                                chips.isNotEmpty() -> R.string.browse_no_filter_match
                                genre != null -> R.string.browse_genre_empty
                                else -> R.string.browse_studio_empty
                            },
                        ),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Palette.Muted,
                    )
                    if (chips.isNotEmpty()) {
                        Gap(12.dp)
                        MatineeButton(onClick = { state.filters = NO_TITLE_FILTERS }, look = ButtonLook.Outline) {
                            Text(stringResource(R.string.browse_clear_filters))
                        }
                    }
                }
            },
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(Modifier.padding(top = 4.dp)) {
                    Text(
                        listOfNotNull(
                            stringResource(if (genre != null) R.string.browse_genre else R.string.browse_studio),
                            pages.total?.let { res.getQuantityString(R.plurals.browse_title_count, it, it) },
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Palette.Muted,
                    )
                    Gap(12.dp)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(bottom = 8.dp)) {
                        BROWSE_KINDS.forEach { (value, label) -> Chip(stringResource(label), kind == value, { kind = value }) }
                    }
                    if (chips.isNotEmpty()) ActiveFilterChips(chips) { state.filters = NO_TITLE_FILTERS }
                }
            }
        }
    }
    if (filtering && offered != null) {
        TitleFilterSheet(kind, offered, state.filters, onChange = { state.filters = it }, onDismiss = { filtering = false })
    }
}

/**
 * Someone in the cast or crew: who they are, what they're in across the
 * libraries, then their other titles at TMDB, to request.
 */
@Composable
fun PersonScreen(name: String, tmdbId: String? = null) {
    val api = LocalApi.current
    val res = LocalResources.current
    val person = rememberLoader("person-$name-$tmdbId") { people.get(name, tmdbId) }
    val grid = rememberLazyGridState()
    val catalog = (person.state as? Load.Ready)?.value?.catalog.orEmpty()
    val positions = remember(catalog) { catalog.withIndex().associate { (index, credit) -> CATALOG_KEY + credit.ref.key to index } }
    // The catalog cards around the screen, in blocks, as Browse follows
    // them: the stream takes a hundred at most and opens again on a change.
    val window by remember(grid, positions) {
        derivedStateOf {
            val shown = grid.layoutInfo.visibleItemsInfo.mapNotNull { positions[it.key] }
            if (shown.isEmpty()) return@derivedStateOf 0 to 0
            val from = maxOf(0, shown.min() / FOLLOW_BLOCK - 1)
            val to = minOf(shown.max() / FOLLOW_BLOCK + 1, from + FOLLOW_BLOCKS - 1)
            from * FOLLOW_BLOCK to (to + 1) * FOLLOW_BLOCK
        }
    }
    FollowTitles(
        catalog.subList(minOf(window.first, catalog.size), minOf(window.second, catalog.size)).map { CatalogInput(it.ref) },
    )
    Column(Modifier.fillMaxSize()) {
        TopBar(null, home = true)
        when (val state = person.state) {
            Load.Loading -> LoadingBox()
            is Load.Failed -> ErrorBox(stringResource(R.string.person_load_failed), state.message, person::reload, disconnected = state.disconnected)
            is Load.Ready -> {
                val value = state.value
                val profile = value.profile
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(150.dp),
                    state = grid,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = Gutter, end = Gutter, bottom = 32.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalArrangement = Arrangement.spacedBy(20.dp),
                ) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Column(Modifier.padding(top = 8.dp, bottom = 12.dp)) {
                            Row(
                                Modifier.fillMaxWidth(),
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
                                        if (profile != null) {
                                            profileLine(profile, res)
                                        } else {
                                            listOf(
                                                creditKind(value.kind, res, 1),
                                                res.getQuantityString(R.plurals.browse_title_count, value.titleCount, value.titleCount),
                                            ).joinToString(" · ")
                                        },
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = Palette.Muted,
                                    )
                                }
                            }
                            profile?.biography?.let { biography ->
                                Gap(16.dp)
                                Overview(biography)
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
                    if (value.catalog.isNotEmpty()) {
                        item(span = { GridItemSpan(maxLineSpan) }, key = "notHere") {
                            Column(Modifier.padding(top = if (value.credits.isEmpty()) 0.dp else 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Text(
                                        stringResource(R.string.web_catalog_notHere),
                                        style = MaterialTheme.typography.titleLarge,
                                        modifier = Modifier.alignByBaseline().weight(1f, fill = false),
                                    )
                                    Text(
                                        res.getQuantityString(R.plurals.browse_title_count, value.catalog.size, value.catalog.size),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = Palette.Muted,
                                        modifier = Modifier.alignByBaseline(),
                                    )
                                }
                                if (value.stale) {
                                    Text(stringResource(R.string.web_discover_stale), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                                }
                            }
                        }
                        items(value.catalog, key = { CATALOG_KEY + it.ref.key }) { credit ->
                            CatalogCard(
                                CatalogTitleSummary(credit.ref, credit.name, credit.year, credit.poster, credit.availability),
                                detail = listOfNotNull(credit.year?.toString(), credit.role).joinToString(" · ").ifEmpty { null },
                            )
                        }
                    }
                    item(span = { GridItemSpan(maxLineSpan) }) { Box(Modifier.navigationBarsPadding()) }
                }
            }
        }
    }
}

private const val CATALOG_KEY = "catalog-"
private const val FOLLOW_BLOCK = 12
private const val FOLLOW_BLOCKS = 6

/** "Acting · Born Sep 2, 1964", each part TMDB knows. */
private fun profileLine(profile: PersonProfile, res: android.content.res.Resources): String = listOfNotNull(
    profile.knownFor?.let { department(it, res) },
    formatDay(profile.birthday)?.let { res.getString(R.string.person_born, it) },
    formatDay(profile.deathday)?.let { res.getString(R.string.person_died, it) },
).joinToString(" · ")

/** What TMDB says someone is known for, in the app's language. */
private fun department(id: String, res: android.content.res.Resources): String? = when (id) {
    PersonDepartment.ACTING -> R.string.person_department_acting
    PersonDepartment.DIRECTING -> R.string.person_department_directing
    PersonDepartment.WRITING -> R.string.person_department_writing
    PersonDepartment.CREATOR -> R.string.person_department_creator
    PersonDepartment.PRODUCTION -> R.string.person_department_production
    PersonDepartment.EDITING -> R.string.person_department_editing
    PersonDepartment.CAMERA -> R.string.person_department_camera
    PersonDepartment.SOUND -> R.string.person_department_sound
    PersonDepartment.ART -> R.string.person_department_art
    PersonDepartment.COSTUME -> R.string.person_department_costume
    PersonDepartment.VISUAL_EFFECTS -> R.string.person_department_visualEffects
    PersonDepartment.LIGHTING -> R.string.person_department_lighting
    PersonDepartment.CREW -> R.string.person_department_crew
    else -> null
}?.let(res::getString)

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
