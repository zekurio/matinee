package io.github.zekurio.matinee.ui.requests

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.Artwork
import io.github.zekurio.matinee.api.Availability
import io.github.zekurio.matinee.api.CatalogRef
import io.github.zekurio.matinee.api.CatalogSeason
import io.github.zekurio.matinee.api.CatalogTitleSummary
import io.github.zekurio.matinee.api.NextSeasonEntry
import io.github.zekurio.matinee.api.ShowScope
import io.github.zekurio.matinee.api.summary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.components.ArtFrame
import io.github.zekurio.matinee.ui.components.CardShape
import io.github.zekurio.matinee.ui.components.CardText
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.PosterArt
import io.github.zekurio.matinee.ui.components.PosterCard
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.focusRing
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.theme.Palette
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** How long the badge takes to go when a title arrives, before the card becomes the library's. */
private const val ARRIVAL_MS = 200

/**
 * A ring that fills clockwise in the accent, for how much of a title is
 * in. Without a share yet it's dotted: on its way, nothing to count.
 */
@Composable
fun ProgressRing(progress: Double?, modifier: Modifier = Modifier, size: Dp = 20.dp) {
    val accent = Palette.Accent
    val track = Palette.Foreground.copy(alpha = 0.2f)
    val shown by animateFloatAsState((progress ?: 0.0).toFloat().coerceIn(0f, 1f), tween(700), label = "ring")
    Canvas(modifier.size(size)) {
        val stroke = this.size.minDimension * 2.5f / 24f
        val inset = this.size.minDimension * 3f / 24f
        val box = Size(this.size.width - 2 * inset, this.size.height - 2 * inset)
        val at = Offset(inset, inset)
        drawArc(track, 0f, 360f, false, at, box, style = Stroke(stroke))
        if (progress == null) {
            val circumference = (Math.PI * box.width).toFloat()
            drawArc(
                accent, -90f, 360f, false, at, box,
                style = Stroke(stroke, cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(0.1f, circumference / 12f))),
            )
        } else {
            drawArc(accent, -90f, 360f * shown, false, at, box, style = Stroke(stroke, cap = StrokeCap.Round))
        }
    }
}

/**
 * The round glass mark in a catalog card's corner, where a library
 * title's watched check sits, once the title has a state; nothing before,
 * so a card carries no permanent plus. Glass means not here; the accent check means watched, and the
 * two never meet. [leaving] fills the ring and lets it go, for an arrival.
 */
@Composable
fun CatalogBadge(availability: Availability, modifier: Modifier = Modifier, leaving: Boolean = false, size: Dp = 24.dp) {
    val res = LocalResources.current
    val badge = if (leaving) CardBadge(Glyph.Ring, 1.0) else badgeOf(availability) ?: return
    var gone by remember { mutableStateOf(false) }
    LaunchedEffect(leaving) { if (leaving) gone = true }
    val fade by animateFloatAsState(if (gone) 0f else 1f, tween(ARRIVAL_MS, easing = Motion.ExitEasing), label = "badge")
    val label = when {
        leaving -> stringResource(R.string.web_catalog_badge_here)
        else -> stateWord(availability, java.time.LocalDate.now(), percent = true)?.let { stateText(it, res) }.orEmpty()
    }
    Box(
        modifier
            .graphicsLayer {
                alpha = fade
                scaleX = 0.5f + fade / 2
                scaleY = 0.5f + fade / 2
            }
            .size(size)
            .clip(CircleShape)
            .background(Palette.Background.copy(alpha = 0.7f))
            .border(1.dp, Palette.Foreground.copy(alpha = 0.1f), CircleShape)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        val glyph = size * 0.58f
        when (badge.glyph) {
            Glyph.Clock -> LucideIcon(Lucide.Clock, null, size = glyph)
            Glyph.Calendar -> LucideIcon(Lucide.Calendar, null, size = glyph)
            Glyph.Slash -> LucideIcon(Lucide.CircleSlash, null, size = glyph, tint = Palette.Muted)
            Glyph.Ring -> ProgressRing(badge.progress, size = size * 0.84f)
        }
    }
}

/** The accent dot on a title that came through the viewer's own ask, until they've watched it. */
@Composable
fun FreshDot(modifier: Modifier = Modifier) {
    val label = stringResource(R.string.web_catalog_badge_fresh)
    Box(modifier.size(8.dp).clip(CircleShape).background(Palette.Accent).semantics { contentDescription = label })
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun Modifier.cardTap(onClick: () -> Unit, onLongClick: (() -> Unit)? = null, label: String? = null): Modifier {
    val interaction = remember { MutableInteractionSource() }
    return clip(CardShape)
        .focusRing(interaction, CardShape)
        .combinedClickable(
            interactionSource = interaction,
            indication = androidx.compose.material3.ripple(),
            role = Role.Button,
            onClickLabel = label,
            onLongClick = onLongClick,
            onClick = onClick,
        )
}

/**
 * A title the server doesn't have, the size of a [PosterCard] so it sits
 * in the same rails and grids: the poster in full colour, the state in the
 * corner and on the second line. A tap opens its page; phones have no
 * controls on posters. When it arrives, the badge goes and the card
 * becomes the library's, on the same poster. [detail] stands in for the
 * year and kind while there's no state, as Coming soon's day does.
 */
@Composable
fun CatalogCard(
    title: CatalogTitleSummary,
    modifier: Modifier = Modifier,
    detail: String? = null,
    /** Already here when the list loaded: the library's card at once, without the badge going. */
    hereAtFirst: Boolean = false,
    fresh: Boolean = false,
) {
    val hub = LocalRequests.current
    val availability = hub.availability(title.ref, title.availability)
    val here = availability.libraryTitleId?.takeIf { availability.state == AvailabilityState.HERE }
    if (here != null) {
        var faded by remember(here) { mutableStateOf(hereAtFirst) }
        LaunchedEffect(here) {
            delay(ARRIVAL_MS.toLong())
            faded = true
        }
        if (faded) {
            ArrivedCard(title, here, fresh || (!hereAtFirst && availability.askedBySelf), modifier)
            return
        }
    }
    CatalogPoster(title, availability, modifier, detail, leaving = here != null)
}

@Composable
private fun CatalogPoster(title: CatalogTitleSummary, availability: Availability, modifier: Modifier, detail: String?, leaving: Boolean) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val line = cardLineText(title.year, title.ref, availability, res, detail)
    Column(modifier) {
        Box(Modifier.cardTap({ nav.catalog(title.ref) })) {
            PosterArt(title.name, api.art(title.poster))
            CatalogBadge(availability, Modifier.align(Alignment.TopEnd).padding(6.dp), leaving = leaving)
        }
        CardText(title.name, line)
    }
}

/**
 * A title that came in through a request, as the library's card on the
 * poster the request had, so the picture doesn't change. While it's
 * [fresh], the accent dot until the viewer has watched it.
 */
@Composable
fun ArrivedCard(title: CatalogTitleSummary, titleId: String, fresh: Boolean, modifier: Modifier = Modifier) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val viewer = androidx.compose.ui.platform.LocalContext.current.app.viewer
    val library = rememberLoader("title-$titleId") { titles.get(titleId) }
    val poster = api.art(title.poster)
    val summary = (library.state as? Load.Ready)?.value?.summary
    Box(modifier) {
        if (summary != null) {
            PosterCard(summary, summary.year?.toString(), poster = poster ?: api.art(summary.images.poster))
            if (fresh && !viewer.isWatched(summary)) FreshDot(Modifier.align(Alignment.TopEnd).padding(10.dp))
        } else {
            Column(Modifier.cardTap({ nav.title(titleId) })) {
                PosterArt(title.name, poster)
                CardText(title.name, title.year?.toString())
            }
        }
    }
}

/**
 * A season of a show the server lacks, by its poster, with its own state
 * in the corner and on the second line. While it can be requested, a tap
 * calls [onRequest], which opens the request sheet with that season
 * ticked; there's no sheet of its own to tell its story.
 */
@Composable
fun CatalogSeasonCard(
    show: CatalogRef,
    showName: String,
    showPoster: Artwork?,
    season: CatalogSeason,
    modifier: Modifier = Modifier,
    onRequest: () -> Unit,
) {
    val api = LocalApi.current
    val res = LocalResources.current
    val availability = season.availability.asTitle()
    val label = seasonName(season.number, res)
    val name = seasonOf(showName, season.number, res)
    val line = seasonLineText(season, res)
    val requests = posterAction(availability) == PosterAction.Request
    Column(if (requests) modifier.cardTap(onRequest, label = "$name, $line") else modifier) {
        Box {
            PosterArt(name, api.art(season.poster ?: showPoster))
            CatalogBadge(availability, Modifier.align(Alignment.TopEnd).padding(6.dp))
        }
        CardText(label, line)
    }
}

/**
 * A show in Home's Next up whose next season isn't on the server, the
 * size of an episode's card beside it: the show's backdrop, the season's
 * state in the corner, and "Season 4 isn't here yet". A tap opens the
 * show, whose Next up has the ask with a button.
 */
@Composable
fun NextSeasonCard(entry: NextSeasonEntry, modifier: Modifier = Modifier) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val hub = LocalRequests.current
    val title = entry.title
    val season = hub.season(entry.ref, entry.season)
    val availability = season.availability.asTitle()
    val line = nextSeasonLine(season.number, availability, res)
    Column(modifier) {
        Box(Modifier.cardTap({ nav.title(title.id) }, label = "${title.name}, $line")) {
            ArtFrame(title.name, 16f / 9f) {
                Picture(
                    listOfNotNull(api.art(title.images.backdrop, ArtworkSize.Small), api.art(title.images.poster)),
                    Modifier.fillMaxSize(),
                )
                CatalogBadge(availability, Modifier.align(Alignment.TopEnd).padding(6.dp))
            }
        }
        CardText(title.name, line)
    }
}

/**
 * What a request button opens on a phone: a sheet from the bottom, where
 * the thumb is, with [title] on top. [content] gets a way to close it
 * that lets the sheet slide away first.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AskSheet(title: String, onDismiss: () -> Unit, content: @Composable ColumnScope.(close: (then: () -> Unit) -> Unit) -> Unit) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val close: (() -> Unit) -> Unit = { then ->
        scope.launch { sheet.hide() }.invokeOnCompletion {
            onDismiss()
            then()
        }
    }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet, containerColor = Palette.Raised) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
            content(close)
        }
    }
}

/** A bar of how much is in, with the share beside it, for a sheet. */
@Composable
fun ProgressLine(progress: Double) {
    val res = LocalResources.current
    val shown by animateFloatAsState(progress.toFloat().coerceIn(0f, 1f), tween(700), label = "progress")
    androidx.compose.foundation.layout.Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f).height(6.dp).clip(CircleShape).background(Palette.Foreground.copy(alpha = 0.15f))) {
            Box(Modifier.fillMaxWidth(shown).fillMaxHeight().clip(CircleShape).background(Palette.Accent))
        }
        Gap(12.dp)
        Text(formatPercent(progress, res), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
    }
}
