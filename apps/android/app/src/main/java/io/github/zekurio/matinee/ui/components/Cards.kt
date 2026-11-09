package io.github.zekurio.matinee.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.ShelfEntry
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.episodeNumber
import io.github.zekurio.matinee.ui.formatRuntime
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.progressRatio
import io.github.zekurio.matinee.ui.runtimeMinutes
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.timeLeft

enum class RailArt { Landscape, Poster, Person }

/** True on tablets and TVs, which get the web's fixed card sizes. */
@Composable
fun isWide(): Boolean = LocalConfiguration.current.screenWidthDp >= 600

/**
 * How wide a card is in a rail: a share of a phone's width, so the next
 * card peeks in, and the web's fixed sizes on bigger screens. Stills are
 * narrower than the web's on phones, so two rails fit under Home's banner.
 */
@Composable
fun railItemWidth(art: RailArt): Dp {
    val config = LocalConfiguration.current
    val width = config.screenWidthDp.toFloat()
    if (width >= 600) {
        return when (art) {
            RailArt.Landscape -> 300.dp
            RailArt.Poster -> 176.dp
            RailArt.Person -> 116.dp
        }
    }
    val inner = width - 2 * Gutter.value
    return when (art) {
        RailArt.Landscape -> minOf(inner * 0.66f, config.screenHeightDp * 0.34f * 16f / 9f).dp
        RailArt.Poster -> (inner * 0.44f).dp
        RailArt.Person -> (inner * 0.28f).dp
    }
}

/** A titled row of cards that scrolls sideways past the page's edge. */
@Composable
fun Rail(
    title: String,
    modifier: Modifier = Modifier,
    onTitleClick: (() -> Unit)? = null,
    content: LazyListScope.() -> Unit,
) {
    Column(modifier.fillMaxWidth()) {
        SectionTitle(title, Modifier.padding(horizontal = Gutter), onTitleClick)
        Gap(12.dp)
        LazyRow(
            contentPadding = PaddingValues(horizontal = Gutter),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            content = content,
        )
    }
}

/** The 2:3 or 16:9 frame art sits in, on its tone, with a border. */
@Composable
fun ArtFrame(
    toneKey: String,
    aspect: Float,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier
            .fillMaxWidth()
            .aspectRatio(aspect)
            .clip(CardShape)
            .tone(toneKey)
            .border(1.dp, Palette.Border, CardShape),
        contentAlignment = Alignment.Center,
        content = content,
    )
}

/** Play in the middle of a still: a frosted circle, always there on touch screens. */
@Composable
fun PlayGlyph(onClick: () -> Unit, contentDescription: String, modifier: Modifier = Modifier, size: Dp = 56.dp) {
    RoundIconButton(
        Lucide.Play,
        contentDescription,
        onClick,
        modifier,
        size = size,
        iconSize = size * 0.38f,
        background = Color.Black.copy(alpha = 0.35f),
    )
}

/** Name and detail under a card, one line each. */
@Composable
fun CardText(primary: String, secondary: String?, modifier: Modifier = Modifier, untitled: Boolean = false) {
    Column(modifier.padding(top = 8.dp)) {
        Text(
            primary,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (untitled) FontWeight.Normal else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (secondary != null) {
            Text(
                secondary,
                style = MaterialTheme.typography.bodySmall,
                color = Palette.Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Modifier.cardClick(onClick: () -> Unit, onLongClick: (() -> Unit)?): Modifier {
    val interaction = remember { MutableInteractionSource() }
    return clip(CardShape)
        .focusRing(interaction, CardShape)
        .combinedClickable(
            interactionSource = interaction,
            indication = androidx.compose.material3.ripple(),
            role = Role.Button,
            onLongClick = onLongClick,
            onClick = onClick,
        )
}

/**
 * An episode or movie to start or resume, for Continue watching and Next
 * up. The picture is the episode, the show leads the text, and the episode
 * follows. The card opens the episode's page, the round button plays it,
 * and a long press offers the rest. Without [showName], as in a season's
 * row, the episode leads and its number and length follow.
 */
@Composable
fun EpisodeCard(item: MediaItem, modifier: Modifier = Modifier, showName: Boolean = true) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val actions = LocalActions.current
    val res = LocalResources.current
    val viewer = androidx.compose.ui.platform.LocalContext.current.app.viewer
    val label = itemLabel(item, res)
    val code = episodeCode(item, res)
    val watched = viewer.isWatched(item)
    val ratio = progressRatio(item)
    val left = if (item.progress?.completed == false) timeLeft(item, res) else null
    val name = if (code != null) stringResource(R.string.media_show_code_title, label.showName, code, label.title) else label.title
    Column(modifier) {
        Box(Modifier.cardClick({ nav.item(item) }, { actions.item(item) })) {
            ArtFrame(label.showName, 16f / 9f) {
                LucideIcon(Lucide.Film, null, size = 20.dp, tint = Palette.Muted.copy(alpha = 0.4f))
                Picture(api.landscape(item), Modifier.fillMaxSize())
                if (watched) WatchedBadge(Modifier.align(Alignment.TopEnd).padding(6.dp))
                else if (ratio != null && ratio > 0f) ProgressBar(ratio, Modifier.align(Alignment.BottomCenter))
                PlayGlyph(
                    onClick = { nav.play(item.id) },
                    contentDescription = if (left != null) stringResource(R.string.media_resume_named, name)
                    else stringResource(R.string.media_play_named, name),
                )
            }
        }
        if (showName) {
            val detail = when {
                code != null -> listOfNotNull(stringResource(R.string.media_code_title, code, label.title), left).joinToString(" · ")
                else -> left ?: label.year
            }
            CardText(label.showName, detail)
        } else {
            val detail = listOfNotNull(
                episodeNumber(item, res),
                left ?: formatRuntime(runtimeMinutes(item), res),
            ).joinToString(" · ").ifEmpty { null }
            CardText(label.title, detail, untitled = label.untitled)
        }
    }
}

/** A 2:3 poster, with the name on the title's tone until the poster shows. */
@Composable
fun PosterArt(name: String, poster: ImageSource?, modifier: Modifier = Modifier, watched: Boolean = false) {
    ArtFrame(name, 2f / 3f, modifier) {
        Text(
            name,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = Palette.Foreground.copy(alpha = 0.7f),
            textAlign = TextAlign.Center,
            maxLines = 4,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(12.dp),
        )
        if (poster != null) Picture(listOf(poster), Modifier.fillMaxSize())
        if (watched) WatchedBadge(Modifier.align(Alignment.TopEnd).padding(6.dp))
    }
}

/** A movie or show as its poster, opening its page. */
@Composable
fun PosterCard(
    title: TitleSummary,
    detail: String?,
    modifier: Modifier = Modifier,
    poster: ImageSource? = LocalApi.current.art(title.images.poster),
    onClick: (() -> Unit)? = null,
) {
    val nav = LocalNavigator.current
    val actions = LocalActions.current
    val viewer = androidx.compose.ui.platform.LocalContext.current.app.viewer
    Column(modifier) {
        Box(Modifier.cardClick(onClick ?: { nav.title(title) }, { actions.title(title) })) {
            PosterArt(title.name, poster, watched = viewer.isWatched(title))
        }
        CardText(title.name, detail)
    }
}

/** A movie or show from a library's shelf, saying what it got last. */
@Composable
fun ShelfCard(entry: ShelfEntry, modifier: Modifier = Modifier) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val (title, _, count, _, added) = entry
    when {
        title.kind == TitleKind.MOVIE -> PosterCard(title, title.year?.toString(), modifier)
        added == null -> PosterCard(
            title,
            res.getQuantityString(R.plurals.media_episode_count, count, count),
            modifier,
        )
        added.count == 1 -> {
            val code = episodeCode(added.item, res)
            val name = itemLabel(added.item, res).title
            PosterCard(
                title,
                if (code != null) res.getString(R.string.media_code_title, code, name) else name,
                modifier,
                poster = api.art(added.season?.poster ?: title.images.poster),
                onClick = { nav.episode(added.item.id) },
            )
        }
        else -> {
            val fresh = res.getQuantityString(R.plurals.media_new_episodes, added.count, added.count)
            val season = added.season
            PosterCard(
                title,
                if (season != null) "${seasonName(season.number, res)} · $fresh" else fresh,
                modifier,
                poster = api.art(season?.poster ?: title.images.poster),
                onClick = if (season != null) ({ nav.season(title.id, season.number) }) else null,
            )
        }
    }
}

/** Someone in the cast or crew: a round portrait, the name, and the part. */
@Composable
fun PersonCard(name: String, role: String?, photo: ImageSource?, modifier: Modifier = Modifier) {
    val nav = LocalNavigator.current
    val interaction = remember { MutableInteractionSource() }
    Column(
        modifier
            .clip(CardShape)
            .focusRing(interaction, CardShape)
            .combinedClickable(interaction, androidx.compose.material3.ripple(), role = Role.Button) { nav.person(name) },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.fillMaxWidth().aspectRatio(1f).clip(CircleShape).background(Palette.Secondary),
            contentAlignment = Alignment.Center,
        ) {
            Text(initials(name), style = MaterialTheme.typography.headlineSmall, color = Palette.Muted, fontWeight = FontWeight.Medium)
            if (photo != null) Picture(listOf(photo), Modifier.fillMaxSize())
        }
        Text(
            name,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 8.dp),
        )
        if (role != null) {
            Text(
                role,
                style = MaterialTheme.typography.bodySmall,
                color = Palette.Muted,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** A list row for a file: its still, name, and details, playing on a tap. */
@Composable
fun EpisodeRow(item: MediaItem, modifier: Modifier = Modifier) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val actions = LocalActions.current
    val res = LocalResources.current
    val viewer = androidx.compose.ui.platform.LocalContext.current.app.viewer
    val label = itemLabel(item, res)
    val watched = viewer.isWatched(item)
    val ratio = progressRatio(item)
    Row(
        modifier.fillMaxWidth().cardClick({ nav.item(item) }, { actions.item(item) }).padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(144.dp)) {
            ArtFrame(label.showName, 16f / 9f) {
                Picture(api.landscape(item, ArtworkSize.Thumb), Modifier.fillMaxSize())
                if (watched) WatchedBadge(Modifier.align(Alignment.TopEnd).padding(5.dp), size = 18.dp)
                else if (ratio != null && ratio > 0f) ProgressBar(ratio, Modifier.align(Alignment.BottomCenter), 3.dp)
            }
        }
        Column(Modifier.weight(1f)) {
            Text(
                label.title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = if (label.untitled) FontWeight.Normal else FontWeight.Medium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            val detail = listOfNotNull(
                episodeNumber(item, res),
                if (item.progress?.completed == false) timeLeft(item, res) else formatRuntime(runtimeMinutes(item), res),
            ).joinToString(" · ")
            if (detail.isNotEmpty()) Text(detail, style = MaterialTheme.typography.bodySmall, color = Palette.Muted, maxLines = 1)
            item.episode?.overview?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = Palette.Faint, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        RoundIconButton(
            Lucide.Play,
            stringResource(R.string.media_play_named, label.title),
            { nav.play(item.id) },
            size = 40.dp,
            iconSize = 16.dp,
            background = Color.Transparent,
        )
    }
}
