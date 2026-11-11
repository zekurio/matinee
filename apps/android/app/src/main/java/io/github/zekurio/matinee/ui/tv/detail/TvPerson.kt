package io.github.zekurio.matinee.ui.tv.detail

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.BringIntoViewSpec
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.Person
import io.github.zekurio.matinee.api.PersonCredit
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.browse.creditKind
import io.github.zekurio.matinee.ui.components.ActionTarget
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.initials
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.HideClockWhen
import io.github.zekurio.matinee.ui.tv.ShowBackdrop
import io.github.zekurio.matinee.ui.tv.TvCaptionedPoster
import io.github.zekurio.matinee.ui.tv.TvCards
import io.github.zekurio.matinee.ui.tv.TvPage
import io.github.zekurio.matinee.ui.tv.TvType
import io.github.zekurio.matinee.ui.tv.rememberTvFocusMemory
import io.github.zekurio.matinee.ui.tv.scrolledUp

/** Someone in the cast or crew on a TV, and everything they're in. */
@Composable
fun TvPersonScreen(name: String) {
    val person = rememberLoader("person-$name") { people.get(name) }
    DetailState(person.state, stringResource(R.string.person_load_failed), person::reload) { PersonPage(it) }
}

/** Posters across the page, as many as fit between the rail and the right edge. */
private const val COLUMNS = 6

/**
 * The person's photo, name, job, and how many titles they're in, then
 * those titles as a grid of posters, each with their role in it. The
 * focused title's backdrop goes behind the page.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PersonPage(person: Person) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val viewer = LocalContext.current.app.viewer
    val memory = rememberTvFocusMemory()
    memory.Restore { person.credits.firstOrNull()?.let { GRID to key(it) } }
    var focused by remember { mutableStateOf<PersonCredit?>(null) }
    ShowBackdrop(listOfNotNull(api.art(focused?.title?.images?.backdrop, ArtworkSize.Large)))
    val density = LocalDensity.current
    val spec = remember(density) { with(density) { GridSpec(EDGE.toPx(), PIVOT.toPx()) } }
    val grid = rememberLazyGridState()
    val scrolled by remember { derivedStateOf { grid.scrolledUp } }
    HideClockWhen(scrolled)
    CompositionLocalProvider(LocalBringIntoViewSpec provides spec) {
        LazyVerticalGrid(
            GridCells.Fixed(COLUMNS),
            Modifier.fillMaxSize(),
            state = grid,
            contentPadding = PaddingValues(start = TvPage.Start, end = TvPage.End, top = HEADER_TOP, bottom = 48.dp),
            horizontalArrangement = Arrangement.spacedBy(TvCards.Gap),
            verticalArrangement = Arrangement.spacedBy(28.dp),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }, key = "header") { PersonHeader(person) }
            items(person.credits, key = ::key) { credit ->
                TvCaptionedPoster(
                    credit.title.name,
                    api.art(credit.title.images.poster),
                    credit.role ?: credit.title.year?.toString() ?: creditKind(credit.kind, res, 1),
                    onClick = { nav.title(credit.title) },
                    modifier = Modifier.onFocusChanged { if (it.hasFocus) focused = credit },
                    focus = with(memory) { Modifier.item(GRID, key(credit)) },
                    watched = viewer.isWatched(credit.title),
                    menu = ActionTarget.Title(credit.title, null, here = false),
                )
            }
        }
    }
}

private const val GRID = "grid"

private fun key(credit: PersonCredit) = "${credit.title.id}-${credit.kind}"

@Composable
private fun PersonHeader(person: Person) {
    val api = LocalApi.current
    val res = LocalResources.current
    Row(Modifier.padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(28.dp)) {
        Box(Modifier.size(120.dp).clip(CircleShape).background(Palette.Secondary), contentAlignment = Alignment.Center) {
            Text(initials(person.name), style = TvType.Headline, color = Palette.Muted)
            api.art(person.photo, ArtworkSize.Small)?.let { Picture(listOf(it), Modifier.fillMaxSize()) }
        }
        Column {
            Text(person.name, style = TvType.Hero, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOf(
                    creditKind(person.kind, res, 1),
                    res.getQuantityString(R.plurals.browse_title_count, person.titleCount, person.titleCount),
                ).joinToString("  ·  "),
                style = TvType.Facts,
                color = Palette.Foreground.copy(alpha = 0.85f),
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}

/** Room a focused poster keeps from the grid's top and bottom. */
private val EDGE = 40.dp

/** Where a poster that has to move goes: this far below the grid's top. */
private val PIVOT = 120.dp

/** Leaves a focused poster where it is while it's clear of the edges, else brings it to [pivot]. */
@OptIn(ExperimentalFoundationApi::class)
private class GridSpec(private val edge: Float, private val pivot: Float) : BringIntoViewSpec {
    override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float =
        if (offset >= edge && offset + size <= containerSize - edge) 0f else offset - pivot
}
