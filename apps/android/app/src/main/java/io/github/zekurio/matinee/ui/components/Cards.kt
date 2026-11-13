package io.github.zekurio.matinee.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
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
import androidx.compose.runtime.getValue
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
import io.github.zekurio.matinee.api.Favorite
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.Season
import io.github.zekurio.matinee.api.ShelfEntry
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalOffline
import io.github.zekurio.matinee.ui.Navigator
import io.github.zekurio.matinee.ui.Motion
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

/** Play in the middle of a still: a frosted circle. */
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

/**
 * Play over a card's still, as the web shows it on a desktop: while a
 * mouse hovers the card, or the D-pad focuses it on a TV. A touch screen
 * has neither, so a phone's cards stay clean; a tap opens the item, and
 * its page has Play.
 */
@Composable
fun BoxScope.HoverPlay(interaction: InteractionSource, onClick: () -> Unit, contentDescription: String, size: Dp = 56.dp) {
    val hovered by interaction.collectIsHoveredAsState()
    val focused by interaction.collectIsFocusedAsState()
    AnimatedVisibility(hovered || focused, Modifier.align(Alignment.Center), enter = Motion.fadeIn, exit = Motion.fadeOut) {
        PlayGlyph(onClick, contentDescription, size = size)
    }
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
private fun Modifier.cardClick(
    onClick: () -> Unit,
    onLongClick: (() -> Unit)?,
    interaction: MutableInteractionSource = remember { MutableInteractionSource() },
): Modifier {
    // Offline, a card's page and actions are the server's; it only shows.
    val enabled = !LocalOffline.current
    return clip(CardShape)
        .focusRing(interaction, CardShape)
        .combinedClickable(
            interactionSource = interaction,
            indication = androidx.compose.material3.ripple(),
            enabled = enabled,
            role = Role.Button,
            onLongClick = onLongClick,
            onClick = onClick,
        )
}

/**
 * An episode or movie to start or resume, for Continue watching and Next
 * up. The picture is the episode, the show leads the text, and the episode
 * follows. The card opens the episode's page, a long press offers the
 * rest, and Play shows on the still where there's hover or focus. Without
 * [showName], as in a season's row, the episode leads and its number and
 * length follow.
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
        val interaction = remember { MutableInteractionSource() }
        Box(Modifier.cardClick({ nav.item(item) }, { actions.item(item) }, interaction)) {
            ArtFrame(label.showName, 16f / 9f) {
                LucideIcon(Lucide.Film, null, size = 20.dp, tint = Palette.Muted.copy(alpha = 0.4f))
                Picture(api.landscape(item), Modifier.fillMaxSize())
                if (watched) WatchedBadge(Modifier.align(Alignment.TopEnd).padding(6.dp))
                else if (ratio != null && ratio > 0f) ProgressBar(ratio, Modifier.align(Alignment.BottomCenter))
                if (!LocalOffline.current) HoverPlay(
                    interaction,
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

/**
 * A season of a show as a poster, for a row of posters: the season's
 * poster, or the show's, the show's name over the season's, opening the
 * season's page. A long press offers the season's menu.
 */
@Composable
fun SeasonPosterCard(title: TitleSummary, season: Season, modifier: Modifier = Modifier) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val actions = LocalActions.current
    val res = LocalResources.current
    val name = seasonName(season.number, res)
    Column(modifier) {
        Box(Modifier.cardClick({ nav.season(title.id, season.number) }, { actions.season(title, season) })) {
            PosterArt(
                stringResource(R.string.title_season_of, title.name, name),
                api.art(season.poster ?: title.images.poster),
                watched = season.itemCount > 0 && season.watchedCount >= season.itemCount,
            )
        }
        CardText(title.name, name)
    }
}

/**
 * An episode as its show's poster, for a row of posters: the show's name
 * over the episode's, opening the episode's page. A long press offers the
 * rest.
 */
@Composable
fun EpisodePosterCard(item: MediaItem, modifier: Modifier = Modifier) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val actions = LocalActions.current
    val res = LocalResources.current
    val viewer = androidx.compose.ui.platform.LocalContext.current.app.viewer
    val label = itemLabel(item, res)
    val code = episodeCode(item, res)
    Column(modifier) {
        Box(Modifier.cardClick({ nav.item(item) }, { actions.item(item) })) {
            PosterArt(label.showName, api.art(item.title?.images?.poster), watched = viewer.isWatched(item))
        }
        CardText(label.showName, if (code != null) stringResource(R.string.media_code_title, code, label.title) else label.title)
    }
}

/**
 * A favorite of any kind as a poster, so a row that mixes them lines up:
 * a movie, a show, a season, or an episode on its show's poster.
 */
@Composable
fun FavoriteCard(favorite: Favorite, modifier: Modifier = Modifier) {
    when (favorite) {
        is Favorite.Movie -> PosterCard(favorite.title, favorite.title.year?.toString(), modifier)
        is Favorite.Show -> PosterCard(favorite.title, favorite.title.year?.toString(), modifier)
        is Favorite.ShowSeason -> SeasonPosterCard(favorite.title, favorite.season, modifier)
        is Favorite.Episode -> EpisodePosterCard(favorite.item, modifier)
    }
}

/** Tells favorites apart in a row that mixes their kinds. */
fun favoriteKey(favorite: Favorite): String = when (favorite) {
    is Favorite.Movie -> "title/${favorite.title.id}"
    is Favorite.Show -> "title/${favorite.title.id}"
    is Favorite.ShowSeason -> "season/${favorite.title.id}/${favorite.season.number}"
    is Favorite.Episode -> "episode/${favorite.item.id}"
}

/**
 * What a shelf entry's card shows and opens: a movie by its year, a show by
 * what it got last, with the season's poster and page, or the one new
 * episode's, where that's what's new.
 */
class ShelfCardModel(val poster: ImageSource?, val detail: String?, val open: (Navigator) -> Unit)

fun shelfCardModel(entry: ShelfEntry, api: io.github.zekurio.matinee.api.MatineeApi, res: android.content.res.Resources): ShelfCardModel {
    val (title, _, count, _, added) = entry
    val openTitle: (Navigator) -> Unit = { it.title(title) }
    return when {
        title.kind == TitleKind.MOVIE -> ShelfCardModel(api.art(title.images.poster), title.year?.toString(), openTitle)
        added == null -> ShelfCardModel(
            api.art(title.images.poster),
            res.getQuantityString(R.plurals.media_episode_count, count, count),
            openTitle,
        )
        added.count == 1 -> {
            val code = episodeCode(added.item, res)
            val name = itemLabel(added.item, res).title
            ShelfCardModel(
                api.art(added.season?.poster ?: title.images.poster),
                if (code != null) res.getString(R.string.media_code_title, code, name) else name,
            ) { it.episode(added.item.id) }
        }
        else -> {
            val fresh = res.getQuantityString(R.plurals.media_new_episodes, added.count, added.count)
            val season = added.season
            ShelfCardModel(
                api.art(season?.poster ?: title.images.poster),
                if (season != null) "${seasonName(season.number, res)} · $fresh" else fresh,
                if (season != null) ({ nav: Navigator -> nav.season(title.id, season.number) }) else openTitle,
            )
        }
    }
}

/** A movie or show from a library's shelf, saying what it got last. */
@Composable
fun ShelfCard(entry: ShelfEntry, modifier: Modifier = Modifier) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val card = shelfCardModel(entry, api, res)
    PosterCard(entry.title, card.detail, modifier, poster = card.poster, onClick = { card.open(nav) })
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
                else if (ratio != null && ratio > 0f) ProgressBar(ratio, Modifier.align(Alignment.BottomCenter), inset = 6.dp)
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
