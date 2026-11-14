package io.github.zekurio.matinee.ui.requests

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.CatalogInput
import io.github.zekurio.matinee.api.CatalogRef
import io.github.zekurio.matinee.api.CatalogSeason
import io.github.zekurio.matinee.api.ShowScope
import io.github.zekurio.matinee.api.Title
import io.github.zekurio.matinee.api.isShow
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.components.CardText
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.PosterArt
import io.github.zekurio.matinee.ui.components.SectionTitle
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.isWide
import io.github.zekurio.matinee.ui.kit.CardShape
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.theme.Palette
import java.time.LocalDate
import kotlinx.coroutines.delay

/*
 * What the server lacks of a show in the library, as its provider lists
 * it: the seasons that aren't here, for the seasons rail; the ones only
 * partly here, with the ask for the rest at the end of their episodes;
 * and the one after the last season that is, for Next up. As the web's
 * show-gaps.ts, next-season.tsx, and rest-of-season.tsx.
 */

/** A show's gaps, with each season's state as the server streams it. */
class ShowGaps(
    val ref: CatalogRef,
    val libraryId: String,
    val missing: List<CatalogSeason>,
    val partial: List<CatalogSeason>,
    val next: CatalogSeason?,
    /** Nothing of the show is asked for yet, so Undo may take back an ask. */
    val first: Boolean,
) {
    fun partialOf(number: Int?): CatalogSeason? = partial.firstOrNull { it.number == number }
}

/**
 * The gaps of [title], once for its page, following their state while the
 * page shows. Null for a film, until they load, and when the provider
 * can't say, so the page shows only what's here. A title that just
 * arrived may not be matched to its provider yet, so a failed load tries
 * again a few times; [onRecovered] runs when one of those succeeds, for
 * the page to fetch the title again too, which has its details by then.
 */
@Composable
fun rememberShowGaps(title: Title, onRecovered: () -> Unit = {}): ShowGaps? {
    if (!title.isShow) return null
    val hub = LocalRequests.current
    val loader = rememberLoader("gaps-${title.id}") { catalog.missingSeasons(title.id) }
    ReloadOnAsk(loader)
    var failures by remember(loader) { mutableIntStateOf(0) }
    val failed = loader.state is Load.Failed
    LaunchedEffect(failed, loader.refreshing) {
        if (failed && !loader.refreshing && failures < GAP_RETRIES) {
            delay(GAP_RETRY_MS * (failures + 1))
            failures++
            loader.reload()
        }
    }
    val ready = loader.state is Load.Ready
    LaunchedEffect(ready) { if (ready && failures > 0) onRecovered() }
    val data = (loader.state as? Load.Ready)?.value
    FollowTitles(if (data != null) listOf(CatalogInput(data.ref, title.libraryId)) else emptyList())
    if (data == null) return null
    val missing = bySeason(hub.seasons(data.ref, data.seasons))
    val partial = hub.seasons(data.ref, data.partialSeasons)
    val next = data.nextSeason?.let { wanted -> missing.firstOrNull { it.number == wanted.number } }
    return ShowGaps(
        data.ref,
        title.libraryId,
        missing,
        partial,
        next,
        first = (missing + partial).all { it.availability.requestId == null },
    )
}

/** How often, and how far apart, a failed load of a show's gaps tries again. */
private const val GAP_RETRIES = 3
private const val GAP_RETRY_MS = 5_000L

/**
 * Next up on a show's page once the viewer has watched every season here
 * and the next isn't on the server: that season's poster, carrying its
 * state in the corner and the one thing to do about it along its lower
 * edge, beside "Season 4 isn't here yet". It catches the moment someone
 * wants more.
 */
@Composable
fun NextSeasonRow(title: Title, gaps: ShowGaps, season: CatalogSeason) {
    val api = LocalApi.current
    val res = LocalResources.current
    val availability = season.availability.asTitle()
    val label = seasonName(season.number, res)
    val name = seasonOf(title.name, season.number, res)
    Column(Modifier.padding(horizontal = Gutter)) {
        SectionTitle(stringResource(R.string.title_next_up_next))
        Gap(12.dp)
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Box(Modifier.width(if (isWide()) 144.dp else 120.dp)) {
                PosterArt(name, api.art(season.poster ?: title.images.poster))
                Box(Modifier.matchParentSize().clip(CardShape)) {
                    SeasonPosterRequest(gaps.ref, name, season, gaps.libraryId, first = availability.requestId == null)
                }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(res.getString(R.string.requests_season_not_here, label), style = MaterialTheme.typography.titleMedium)
                Text(seasonDetailText(seasonDetail(season, LocalDate.now()), res), style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
                if (isWide()) {
                    season.overview?.let {
                        Text(it, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

/** The empty frame where the missing episodes' stills would be: dashed, so it reads as the gap it is. */
private fun Modifier.gapFrame(): Modifier = this
    .fillMaxWidth()
    .aspectRatio(16f / 9f)
    .clip(CardShape)
    .background(Palette.Foreground.copy(alpha = 0.03f))
    .drawBehind {
        drawRoundRect(
            Palette.Foreground.copy(alpha = 0.2f),
            cornerRadius = CornerRadius(6.dp.toPx()),
            style = Stroke(1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx()))),
        )
    }

/**
 * The end of a season's episodes when only some are here: how many more
 * there are, in a dashed frame the size of an episode's still, holding
 * what a poster would: the state once there is one, and the one thing to
 * do about it, "Request the rest" until it's requested. For an admin with
 * the season's request to answer, Add and Decline.
 */
@Composable
fun RestOfSeasonCard(title: Title, gaps: ShowGaps, season: CatalogSeason, modifier: Modifier = Modifier) {
    val res = LocalResources.current
    val hub = LocalRequests.current
    val availability = season.availability.asTitle()
    // For an admin, the season's request to answer: who asked behind the badge, Add and Decline for the button.
    val waiting = waitingRequest(availability)
    val answering = waiting?.takeIf { it.id !in hub.held }
    val more = season.availability.episodesAired - season.availability.episodesHere
    val name = res.getString(R.string.requests_rest_name, seasonOf(title.name, season.number, res))
    Column(modifier) {
        Box(Modifier.gapFrame(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                PosterBadge(availability, tip = waiting?.let { requestedText(it, res) })
                if (answering != null) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        AddButton(answering)
                        DeclineButton(answering)
                    }
                } else {
                    PosterActionButton(
                        availability,
                        name,
                        onRequest = { hub.ask(gaps.ref, name, gaps.libraryId, ShowScope(listOf(season.number), false), undo = gaps.first) },
                        busy = hub.busy[gaps.ref.key] == true,
                        label = stringResource(R.string.requests_rest_ask),
                        plain = true,
                    )
                }
            }
        }
        CardText(res.getQuantityString(R.plurals.requests_rest_more, more, more), null)
    }
}

/** "3 of 10 episodes here", for a season only partly on the server. */
@Composable
fun partialLine(season: CatalogSeason): String =
    stringResource(R.string.requests_season_partial, season.availability.episodesHere, season.availability.episodesAired)
