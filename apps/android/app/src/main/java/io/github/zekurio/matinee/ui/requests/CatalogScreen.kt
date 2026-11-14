package io.github.zekurio.matinee.ui.requests

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.Availability
import io.github.zekurio.matinee.api.CatalogInput
import io.github.zekurio.matinee.api.CatalogRef
import io.github.zekurio.matinee.api.CatalogSeason
import io.github.zekurio.matinee.api.CatalogTitleDetail
import io.github.zekurio.matinee.ui.CatalogRoute
import io.github.zekurio.matinee.ui.ItemTopBar
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.RefreshOnResume
import io.github.zekurio.matinee.ui.StatusBarScrim
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.LoadingBox
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.PosterArt
import io.github.zekurio.matinee.ui.components.Rail
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.isWide
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.formatRating
import io.github.zekurio.matinee.ui.kit.Badge
import io.github.zekurio.matinee.ui.kit.CardShape
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.title.Backdrop
import io.github.zekurio.matinee.ui.title.CastRail
import io.github.zekurio.matinee.ui.title.CrewLines
import io.github.zekurio.matinee.ui.title.Overview
import io.github.zekurio.matinee.ui.title.TrailerButton

/**
 * Fetches [loaders] again each time an ask, a cancel, or a follow changed
 * something, including while their screen was covered: what each loader
 * last saw is kept with the hub, not the screen.
 */
@Composable
fun ReloadOnAsk(vararg loaders: Loader<*>) {
    val hub = LocalRequests.current
    val version = hub.version
    LaunchedEffect(version, *loaders) {
        for (loader in loaders) {
            val seen = hub.seen[loader]
            if (seen != null && seen != version) loader.reload()
            hub.seen[loader] = version
        }
    }
}

/**
 * A title the server doesn't have, on a page built like a library title's
 * so it reads as the same page: the backdrop, the poster beside the name
 * and facts, carrying the state, the overview, the crew, then where a
 * library title has Play, the request and Trailer, and the cast. A show lists its
 * seasons, each with its own state. When the title arrives while the page
 * is open, the library title's page takes its place.
 */
@Composable
fun CatalogScreen(route: CatalogRoute) {
    val ref = CatalogRef(route.kind, route.provider, route.providerId)
    val details = rememberLoader("catalog-${ref.key}-${route.library}") { catalog.details(CatalogInput(ref, route.library)) }
    ReloadOnAsk(details)
    RefreshOnResume(details)
    when (val state = details.state) {
        Load.Loading -> Column(Modifier.fillMaxSize()) {
            ItemTopBar()
            LoadingBox()
        }
        is Load.Failed -> Column(Modifier.fillMaxSize()) {
            ItemTopBar()
            ErrorBox(stringResource(R.string.title_load_error), state.message, details::reload, disconnected = state.disconnected)
        }
        is Load.Ready -> CatalogPage(state.value, route.library)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CatalogPage(detail: CatalogTitleDetail, library: String?) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val hub = LocalRequests.current
    val ref = detail.ref
    val destination = detail.destinations.firstOrNull { it.selected }
    val related = rememberRelated(ref, library)
    // One stream for the page: the title, then the related titles too once their rows have loaded.
    FollowTitles(listOf(CatalogInput(ref, destination?.id)) + related.followed)
    val availability = hub.availability(ref, detail.availability)
    val seasons = bySeason(hub.seasons(ref, detail.seasons))

    // Once the title is in a library the viewer can see, this page becomes that title's page.
    val arrived = availability.libraryTitleId?.takeIf { availability.state == AvailabilityState.HERE }
    LaunchedEffect(arrived) { if (arrived != null) nav.arrived(arrived) }

    val listState = rememberLazyListState()
    var sheet by remember { mutableStateOf<Int?>(null) }
    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            state = listState,
            contentPadding = PaddingValues(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            item(key = "header") {
                Box {
                    Backdrop(listOfNotNull(api.art(detail.backdrop, ArtworkSize.Large)), ref.key)
                    // Laid out as a season's page is: the poster beside the
                    // name, here carrying the state in its corner.
                    Row(
                        Modifier
                            .padding(top = (minOf(LocalConfiguration.current.screenHeightDp * 0.46f, 420f) - 150f).dp)
                            .padding(horizontal = Gutter),
                        verticalAlignment = Alignment.Bottom,
                    ) {
                        Box(Modifier.width(if (isWide()) 180.dp else 132.dp)) {
                            CatalogPoster(detail, availability)
                        }
                        Gap(16.dp)
                        Column(Modifier.weight(1f).padding(bottom = 4.dp)) {
                            Text(detail.name, style = MaterialTheme.typography.headlineLarge, maxLines = 4, overflow = TextOverflow.Ellipsis)
                            Gap(8.dp)
                            val numbered = seasons.count { it.number > 0 }
                            val facts = listOfNotNull(
                                detail.year?.toString(),
                                if (ref.isShow && numbered > 0) res.getQuantityString(R.plurals.requests_season_count, numbered, numbered) else null,
                            )
                            if (facts.isNotEmpty() || detail.contentRating != null || detail.rating != null) {
                                FlowRow(
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    verticalArrangement = Arrangement.spacedBy(6.dp),
                                    itemVerticalAlignment = Alignment.CenterVertically,
                                ) {
                                    if (facts.isNotEmpty()) {
                                        Text(facts.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = Palette.Foreground.copy(alpha = 0.8f))
                                    }
                                    detail.contentRating?.let { Badge(it, outlined = true) }
                                    detail.rating?.let { rating ->
                                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                            LucideIcon(Lucide.Star, stringResource(R.string.media_hero_rated), size = 14.dp, tint = Palette.Star)
                                            Text(formatRating(rating), style = MaterialTheme.typography.bodyMedium)
                                        }
                                    }
                                }
                            }
                            // Plain text: genre pages list the library's titles.
                            if (detail.genres.isNotEmpty()) {
                                Gap(6.dp)
                                Text(detail.genres.take(4).joinToString(", "), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                            }
                        }
                    }
                }
            }
            if (detail.stale) {
                item(key = "stale") {
                    Text(
                        stringResource(R.string.web_catalog_page_stale),
                        style = MaterialTheme.typography.bodySmall,
                        color = Palette.Muted,
                        modifier = Modifier.padding(horizontal = Gutter),
                    )
                }
            }
            detail.overview?.let { overview ->
                item(key = "overview") { Box(Modifier.padding(horizontal = Gutter)) { Overview(overview) } }
            }
            item(key = "crew") { CrewLines(detail.credits, detail.studios) }
            item(key = "strip") { AdminStrip(availability.requestId) }
            item(key = "actions") { CatalogActions(detail, availability, seasons, destination?.id) { sheet = it } }
            if (ref.isShow && seasons.isNotEmpty()) {
                item(key = "seasons") {
                    Rail(stringResource(R.string.title_seasons)) {
                        items(seasons, key = { it.number }) { season ->
                            CatalogSeasonCard(
                                ref,
                                detail.name,
                                detail.poster,
                                season,
                                modifier = Modifier.width(railItemWidth(RailArt.Poster)),
                                onRequest = { sheet = season.number },
                            )
                        }
                    }
                }
            }
            item(key = "cast") { CastRail(detail.credits) }
            relatedRails(related)
            item(key = "bottom") { Box(Modifier.navigationBarsPadding()) }
        }
        StatusBarScrim(listState)
        ItemTopBar()
    }
    // Open with the season a card asked for, or -1 for the row's request.
    sheet?.let { only ->
        RequestSheet(
            ref,
            detail.name,
            seasons,
            first = availability.asks,
            defaultFuture = detail.defaultScope?.future ?: false,
            libraryId = destination?.id,
            destinations = detail.destinations,
            onLibrary = { library -> nav.catalogLibrary(ref, library) },
            only = only.takeIf { it >= 0 },
        ) { sheet = null }
    }
}

/** The header's poster, carrying the title's state in its corner. */
@Composable
private fun CatalogPoster(detail: CatalogTitleDetail, availability: Availability) {
    val api = LocalApi.current
    Box {
        PosterArt(detail.name, api.art(detail.poster))
        Box(Modifier.matchParentSize().clip(CardShape)) {
            PosterBadge(availability, Modifier.align(Alignment.TopEnd).padding(6.dp))
        }
    }
}

/**
 * The page's row, as a library title's has Play first: the one thing the
 * viewer may do, then Trailer. A show's request, a film's that could go
 * to more than one library, and "Request more" for a show requested
 * already open the request sheet through [onSheet] (-1 for no season of
 * its own); a film's otherwise requests at once. Nothing when there's
 * neither an action nor a trailer.
 */
@Composable
private fun CatalogActions(
    detail: CatalogTitleDetail,
    availability: Availability,
    seasons: List<CatalogSeason>,
    libraryId: String?,
    onSheet: (Int) -> Unit,
) {
    val res = LocalResources.current
    val hub = LocalRequests.current
    val ref = detail.ref
    val more = ref.isShow && posterAction(availability) == null && seasons.any { it.availability.asTitle().asks }
    val decides = ref.isShow || (availability.asks && detail.destinations.size > 1)
    val action = more || hasPosterButton(availability)
    if (!action && detail.trailers.isEmpty()) return
    Row(
        Modifier.fillMaxWidth().padding(horizontal = Gutter),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (action) {
            PosterActionButton(
                availability,
                detail.name,
                onRequest = { if (decides || more) onSheet(-1) else hub.ask(ref, detail.name, libraryId) },
                modifier = if (isWide()) Modifier.width(260.dp) else Modifier.weight(1f),
                busy = hub.busy[ref.key] == true,
                action = if (more) PosterAction.Request else null,
                label = if (more) res.getString(R.string.web_ask_more) else null,
                page = true,
            )
        }
        TrailerButton(detail.trailers)
    }
}
