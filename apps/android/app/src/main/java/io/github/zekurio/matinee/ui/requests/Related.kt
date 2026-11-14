package io.github.zekurio.matinee.ui.requests

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.CatalogInput
import io.github.zekurio.matinee.api.CatalogRef
import io.github.zekurio.matinee.api.CatalogTitleSummary
import io.github.zekurio.matinee.api.RelatedPage
import io.github.zekurio.matinee.api.RelatedRail
import io.github.zekurio.matinee.api.RelatedRailId
import io.github.zekurio.matinee.api.RelatedRails
import io.github.zekurio.matinee.api.RelatedTitle
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.PosterCard
import io.github.zekurio.matinee.ui.components.Rail
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.home.RailSkeleton
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette

/*
 * The rows under a catalog title's page, as the web has them: the rest
 * of the film series it belongs to, and more like it. Titles already
 * here are the library's cards; the rest are catalog cards.
 */

/** The rows of titles related to a catalog title, and each row's titles. */
class RelatedRows(val rails: Loader<RelatedRails>, val pages: Map<String, Loader<RelatedPage>>) {
    /**
     * The titles the rows show that aren't here, for the page's one
     * stream. Empty until every row has loaded, so the stream opens again
     * once rather than once a row.
     */
    val followed: List<CatalogInput>
        get() {
            if (rails.state !is Load.Ready || pages.values.any { it.state is Load.Loading }) return emptyList()
            return pages.values
                .flatMap { (it.state as? Load.Ready)?.value?.items.orEmpty() }
                .filter { it.availability.state != AvailabilityState.HERE }
                .map { CatalogInput(it.ref) }
        }
}

/** The rows related to [ref], each loading on its own. */
@Composable
fun rememberRelated(ref: CatalogRef, library: String?): RelatedRows {
    val key = "related-${ref.key}-$library"
    val rails = rememberLoader(key) { catalog.related(CatalogInput(ref, library)) }
    val list = (rails.state as? Load.Ready)?.value?.rails.orEmpty()
    val pages = list.associate { rail -> rail.id to rememberLoader("$key-${rail.id}") { catalog.relatedTitles(ref, rail.id, library) } }
    return RelatedRows(rails, pages)
}

/**
 * The related rows, for the catalog page's list. A row with nothing in
 * it stays out; a list of rows that didn't load leaves no gap, since the
 * page is whole without it.
 */
fun LazyListScope.relatedRails(related: RelatedRows) {
    when (val state = related.rails.state) {
        Load.Loading -> item(key = "related-loading") { RailSkeleton(null, RailArt.Poster) }
        is Load.Failed -> Unit
        is Load.Ready -> {
            val rows = state.value.rails.mapNotNull { rail ->
                val page = related.pages[rail.id] ?: return@mapNotNull null
                val loaded = (page.state as? Load.Ready)?.value
                if (loaded != null && loaded.items.isEmpty()) null else rail to page
            }
            val stale = state.value.stale || related.pages.values.any { (it.state as? Load.Ready)?.value?.stale == true }
            if (stale && rows.isNotEmpty()) {
                item(key = "related-stale") {
                    Box(Modifier.padding(horizontal = Gutter)) {
                        Text(stringResource(R.string.web_catalog_related_stale), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                    }
                }
            }
            rows.forEach { (rail, page) -> item(key = "related-${rail.id}") { RelatedRow(rail, page) } }
        }
    }
}

@Composable
private fun RelatedRow(rail: RelatedRail, page: Loader<RelatedPage>) {
    val title = rail.name?.takeIf { rail.id == RelatedRailId.COLLECTION } ?: stringResource(R.string.web_catalog_related_moreLikeThis)
    when (val state = page.state) {
        Load.Loading -> RailSkeleton(title, RailArt.Poster)
        is Load.Failed -> RailFailed(title, page::reload)
        is Load.Ready -> Rail(title) {
            items(state.value.items, key = { it.ref.key }) { item ->
                RelatedCard(item, Modifier.width(railItemWidth(RailArt.Poster)))
            }
        }
    }
}

/**
 * A title the viewer can watch is the library's card. The rest are
 * catalog cards, with what the stream says now; one that arrives while
 * on screen turns into the library's card in place.
 */
@Composable
private fun RelatedCard(item: RelatedTitle, modifier: Modifier) {
    val availability = LocalRequests.current.availability(item.ref, item.availability)
    val library = item.title
    if (library != null && availability.state == AvailabilityState.HERE && availability.libraryTitleId == library.id) {
        PosterCard(library, library.year?.toString(), modifier)
    } else {
        CatalogCard(CatalogTitleSummary(item.ref, item.name, item.year, item.poster, item.availability), modifier)
    }
}
