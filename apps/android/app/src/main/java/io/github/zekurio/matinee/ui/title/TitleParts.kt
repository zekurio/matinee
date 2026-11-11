package io.github.zekurio.matinee.ui.title

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.Credit
import io.github.zekurio.matinee.api.CreditKind
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.Season
import io.github.zekurio.matinee.api.Title
import io.github.zekurio.matinee.api.summary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.browse.creditKind
import io.github.zekurio.matinee.ui.components.ArtFrame
import io.github.zekurio.matinee.ui.components.Badge
import io.github.zekurio.matinee.ui.components.CardShape
import io.github.zekurio.matinee.ui.components.CardText
import io.github.zekurio.matinee.ui.components.ControlShape
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.HoverPlay
import io.github.zekurio.matinee.ui.components.ImageSource
import io.github.zekurio.matinee.ui.components.LocalActions
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.PersonCard
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.PosterArt
import io.github.zekurio.matinee.ui.components.ProgressBar
import io.github.zekurio.matinee.ui.components.Rail
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.components.SectionTitle
import io.github.zekurio.matinee.ui.components.WatchedBadge
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.isWide
import io.github.zekurio.matinee.ui.components.landscape
import io.github.zekurio.matinee.ui.components.launchShowing
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.components.tone
import io.github.zekurio.matinee.ui.episodeNumber
import io.github.zekurio.matinee.ui.formatDay
import io.github.zekurio.matinee.ui.formatRating
import io.github.zekurio.matinee.ui.formatRuntime
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.progressRatio
import io.github.zekurio.matinee.ui.runtimeMinutes
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.timeLeft

/** The art across the top of a title's pages, faded into the page under the header. */
@Composable
fun Backdrop(sources: List<ImageSource>, toneKey: String, modifier: Modifier = Modifier) {
    val height = minOf(LocalConfiguration.current.screenHeightDp * 0.46f, 420f).dp
    Box(modifier.fillMaxWidth().height(height).tone(toneKey)) {
        Picture(sources, Modifier.fillMaxSize(), alignment = Alignment.TopCenter)
        // The web's two shades: from the start, where the text sits, and up
        // from the bottom into the page. The art stays a backdrop, so what
        // sits on it, a poster or an episode's still, stands out.
        Box(
            Modifier.fillMaxSize().background(
                Brush.horizontalGradient(
                    0f to Palette.Background.copy(alpha = 0.95f),
                    0.5f to Palette.Background.copy(alpha = 0.5f),
                    1f to Color.Transparent,
                ),
            ),
        )
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    0f to Color.Transparent,
                    0.6f to Palette.Background.copy(alpha = 0.7f),
                    1f to Palette.Background,
                ),
            ),
        )
    }
}

/** Names joined as a sentence, each a link: "A, B and C". */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LinkedNames(names: List<String>, color: Color, onClick: (String) -> Unit) {
    val and = stringResource(R.string.common_and)
    FlowRow {
        names.forEachIndexed { index, name ->
            Text(name, style = MaterialTheme.typography.bodyMedium, color = color, modifier = Modifier.clickable { onClick(name) })
            if (index < names.lastIndex) {
                Text(
                    if (index == names.lastIndex - 1) " $and " else ", ",
                    style = MaterialTheme.typography.bodyMedium,
                    color = Palette.Muted,
                )
            }
        }
    }
}

/** "Label  Value and Value", as the web lists directors, writers, and studios. */
@Composable
fun CreditLine(label: String, names: List<String>, onClick: (String) -> Unit) {
    if (names.isEmpty()) return
    Row(verticalAlignment = Alignment.Top) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted, modifier = Modifier.padding(end = 8.dp))
        LinkedNames(names, Palette.Foreground, onClick)
    }
}

/** An overview cut to a few lines, with More to read the rest. */
@Composable
fun Overview(text: String, tagline: String? = null, lines: Int = 3) {
    var open by rememberSaveable(text) { mutableStateOf(false) }
    var overflows by rememberSaveable(text) { mutableStateOf(false) }
    Column(Modifier.clickable(enabled = overflows || open) { open = !open }) {
        val body = buildAnnotatedString {
            if (tagline != null) {
                withStyle(SpanStyle(fontWeight = FontWeight.Medium, color = Palette.Foreground)) { append(tagline) }
                append("\n")
            }
            append(text)
        }
        Text(
            body,
            style = MaterialTheme.typography.bodyLarge,
            color = Palette.Foreground.copy(alpha = 0.85f),
            maxLines = if (open) Int.MAX_VALUE else lines,
            overflow = TextOverflow.Ellipsis,
            onTextLayout = { if (!open) overflows = it.hasVisualOverflow },
        )
        if (overflows || open) {
            Text(
                stringResource(if (open) R.string.title_less else R.string.title_more),
                style = MaterialTheme.typography.bodyLarge,
                color = Palette.Muted,
            )
        }
    }
}

/**
 * Play, then the round watched, favorite, and more buttons, as under a
 * title's or episode's heading. [playDetail] says what Play starts, like
 * "S1, E3". The tick, as the web's, marks unwatched at once and asks when
 * the person watched [name] before marking it watched.
 */
@Composable
fun ActionRow(
    play: MediaItem?,
    resume: Boolean,
    playDetail: String?,
    name: String,
    watched: Boolean,
    favorite: Boolean,
    onWatched: suspend (watched: Boolean, watchedAt: String?) -> Unit,
    onFavorite: suspend () -> Unit,
    /** Opens the page's menu; null when it would be empty. */
    onMore: (() -> Unit)?,
) {
    val nav = LocalNavigator.current
    val actions = LocalActions.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val watchedFailure = stringResource(if (watched) R.string.media_mark_unwatched_failed else R.string.media_mark_watched_failed)
    val favoriteFailure = stringResource(R.string.media_favorite_failed)
    Row(
        Modifier.fillMaxWidth().padding(horizontal = Gutter),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MatineeButton(
            onClick = { play?.let { nav.play(it.id) } },
            enabled = play != null,
            modifier = if (isWide()) Modifier.width(260.dp) else Modifier.weight(1f),
        ) {
            LucideIcon(Lucide.Play, null, size = 16.dp)
            Text(stringResource(if (resume) R.string.title_resume else R.string.title_play))
            if (playDetail != null) Text(playDetail, color = Palette.AccentForeground.copy(alpha = 0.6f))
        }
        RoundIconButton(
            Lucide.Check,
            stringResource(if (watched) R.string.media_mark_unwatched else R.string.media_mark_watched),
            {
                if (watched) scope.launchShowing(snackbar, watchedFailure) { onWatched(false, null) }
                else actions.askWatched(name) { at -> onWatched(true, at) }
            },
            tint = if (watched) Palette.Accent else Palette.Foreground,
        )
        RoundIconButton(
            if (favorite) Lucide.HeartFilled else Lucide.Heart,
            stringResource(if (favorite) R.string.media_remove_favorite else R.string.media_add_favorite),
            { scope.launchShowing(snackbar, favoriteFailure) { onFavorite() } },
            tint = if (favorite) Palette.Danger else Palette.Foreground,
        )
        if (onMore != null) RoundIconButton(Lucide.Ellipsis, stringResource(R.string.title_more_actions), onMore)
    }
}

/** The title's name and facts, with its poster beside them when [poster] says, as the web's title header. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TitleHeading(title: Title, flags: List<String>, poster: Boolean = true) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    Row(Modifier.padding(horizontal = Gutter), verticalAlignment = Alignment.Bottom) {
        if (poster) {
            Box(Modifier.width(if (isWide()) 180.dp else 112.dp)) {
                PosterArt(title.name, api.art(title.images.poster, ArtworkSize.Small))
            }
            Gap(16.dp)
        }
        Column(Modifier.weight(1f).padding(bottom = 4.dp)) {
            Text(title.name, style = MaterialTheme.typography.headlineLarge, maxLines = 3, overflow = TextOverflow.Ellipsis)
            if (title.originalName != null && title.originalName != title.name) {
                Text(title.originalName, style = MaterialTheme.typography.bodyLarge, color = Palette.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Gap(8.dp)
            val facts = titleFacts(title, res)
            if (facts.isNotEmpty()) {
                Text(facts.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = Palette.Foreground.copy(alpha = 0.8f))
            }
            // The rating and the file's badges on a line of their own, so a
            // narrow screen doesn't strand the last one under the facts.
            if (title.contentRating != null || title.rating != null || flags.isNotEmpty()) {
                Gap(6.dp)
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    itemVerticalAlignment = Alignment.CenterVertically,
                ) {
                    title.contentRating?.let { Badge(it, outlined = true) }
                    title.rating?.let { rating ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            LucideIcon(Lucide.Star, stringResource(R.string.media_hero_rated), size = 14.dp, tint = Palette.Star)
                            Text(formatRating(rating), style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                    flags.forEach { Badge(it) }
                }
            }
            if (title.genres.isNotEmpty()) {
                Gap(6.dp)
                LinkedNames(title.genres, Palette.Muted, nav::genre)
            }
        }
    }
}

/** Directors, creators, writers, and studios, each a link to their page. */
@Composable
fun CrewLines(credits: List<Credit>, studios: List<String>) {
    val nav = LocalNavigator.current
    val res = LocalResources.current
    Column(Modifier.padding(horizontal = Gutter), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf(CreditKind.CREATOR, CreditKind.DIRECTOR, CreditKind.WRITER).forEach { kind ->
            val names = credits.filter { it.kind == kind }.map { it.name }.distinct()
            if (names.isNotEmpty()) CreditLine(creditKind(kind, res, names.size), names, nav::person)
        }
        if (studios.isNotEmpty()) {
            CreditLine(res.getQuantityString(R.plurals.people_studio, studios.size), studios, nav::studio)
        }
    }
}

@Composable
fun CastRail(credits: List<Credit>) {
    val api = LocalApi.current
    val cast = credits.filter { it.kind == CreditKind.ACTOR }
    if (cast.isEmpty()) return
    Rail(stringResource(R.string.title_cast)) {
        items(cast, key = { "${it.name}-${it.role}" }) { credit ->
            PersonCard(credit.name, credit.role, api.art(credit.photo, ArtworkSize.Thumb), Modifier.width(railItemWidth(RailArt.Person)))
        }
    }
}

/**
 * A show's seasons by their posters, with how many episodes are left in
 * each. On a season's page, [current] leaves that season out.
 */
@Composable
fun SeasonsRail(title: Title, current: Season? = null) {
    val nav = LocalNavigator.current
    val seasons = if (current == null) title.seasons else title.seasons.filter { it.number != current.number }
    if (seasons.isEmpty()) return
    Rail(stringResource(if (current != null) R.string.title_seasons_more else R.string.title_seasons)) {
        items(seasons, key = { it.number ?: -1 }) { season ->
            SeasonCard(title, season, Modifier.width(railItemWidth(RailArt.Poster))) { nav.season(title.id, season.number) }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SeasonCard(title: Title, season: Season, modifier: Modifier, onClick: () -> Unit) {
    val api = LocalApi.current
    val actions = LocalActions.current
    val res = LocalResources.current
    val left = season.itemCount - season.watchedCount
    Column(modifier.clip(CardShape).combinedClickable(onLongClick = { actions.season(title.summary, season) }, onClick = onClick)) {
        Box {
            PosterArt(
                stringResource(R.string.title_season_of, title.name, seasonName(season.number, res)),
                api.art(season.poster ?: title.images.poster),
            )
            if (left == 0) {
                WatchedBadge(Modifier.align(Alignment.TopEnd).padding(6.dp))
            } else {
                Text(
                    left.toString(),
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                    color = Palette.AccentForeground,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(6.dp)
                        .clip(MaterialTheme.shapes.extraLarge)
                        .background(Palette.Accent)
                        .padding(horizontal = 6.dp, vertical = 1.dp),
                )
            }
        }
        CardText(seasonName(season.number, res), res.getQuantityString(R.plurals.media_episode_count, season.itemCount, season.itemCount))
    }
}

/**
 * The episode up next on a show's page, as the web's EpisodeRow: a big
 * still that opens it, with Play on hover or focus, its number and name,
 * air date and runtime, and what happens in it.
 */
@Composable
fun NextUpEpisode(item: MediaItem) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val actions = LocalActions.current
    val res = LocalResources.current
    val viewer = LocalContext.current.app.viewer
    val label = itemLabel(item, res)
    val ratio = progressRatio(item)
    val watched = viewer.isWatched(item)
    Column(Modifier.padding(horizontal = Gutter)) {
        SectionTitle(stringResource(if (item.progress != null) R.string.title_next_up_continue else R.string.title_next_up_next))
        Gap(12.dp)
        val interaction = remember { MutableInteractionSource() }
        Box(Modifier.clip(CardShape).clickable(interaction, ripple()) { nav.episode(item.id) }) {
            ArtFrame(label.showName, 16f / 9f) {
                Picture(api.landscape(item, ArtworkSize.Medium), Modifier.fillMaxSize())
                if (watched) WatchedBadge(Modifier.align(Alignment.TopEnd).padding(8.dp))
                else if (ratio != null && ratio > 0f) ProgressBar(ratio, Modifier.align(Alignment.BottomCenter))
                HoverPlay(interaction, { nav.play(item.id) }, stringResource(R.string.media_play_named, label.title), size = 64.dp)
            }
        }
        Gap(10.dp)
        Column(Modifier.clickable { actions.item(item) }) {
            val number = episodeNumber(item, res)
            val heading = if (number != null) stringResource(R.string.title_episodes_coded_name, number, label.title) else label.title
            Text(heading, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            val detail = listOfNotNull(
                formatDay(item.episode?.airDate),
                if (item.progress?.completed == false) timeLeft(item, res) else formatRuntime(runtimeMinutes(item), res),
            ).joinToString(" · ")
            if (detail.isNotEmpty()) Text(detail, style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
            item.episode?.overview?.let {
                Gap(6.dp)
                Text(it, style = MaterialTheme.typography.bodyMedium, color = Palette.Foreground.copy(alpha = 0.8f), maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** An episode's still on its own page, full width, with Play on it. */
/**
 * An episode's still, which plays it, lifted off the backdrop by a shadow
 * as on the web. The whole still plays; Play shows on it on hover or focus.
 */
@Composable
fun StillFrame(item: MediaItem, watched: Boolean) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val label = itemLabel(item, res)
    val ratio = progressRatio(item)
    val interaction = remember { MutableInteractionSource() }
    val play = stringResource(R.string.media_play_named, label.title)
    Box(
        Modifier
            .padding(horizontal = Gutter)
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .shadow(24.dp, ControlShape, ambientColor = Color.Black, spotColor = Color.Black)
            .clip(ControlShape)
            .tone(label.showName)
            .border(1.dp, Palette.Border, ControlShape)
            .clickable(interaction, ripple(), onClickLabel = play) { nav.play(item.id) },
        contentAlignment = Alignment.Center,
    ) {
        Picture(api.landscape(item, ArtworkSize.Medium), Modifier.fillMaxSize())
        if (watched) WatchedBadge(Modifier.align(Alignment.TopEnd).padding(10.dp), size = 24.dp)
        else if (ratio != null && ratio > 0f) ProgressBar(ratio, Modifier.align(Alignment.BottomCenter))
        HoverPlay(interaction, { nav.play(item.id) }, play, size = 64.dp)
    }
}

/** What a file holds, a line each with its icon: the picture, the audio, and the subtitles, from [rememberFileInfo]. */
@Composable
fun MediaInfo(item: MediaItem, modifier: Modifier = Modifier) {
    val info = rememberFileInfo(item) ?: return
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        info.video?.let { InfoLine(Lucide.Film, stringResource(R.string.media_info_video), it) }
        info.audio?.let { InfoLine(Lucide.AudioLines, stringResource(R.string.media_info_audio), it) }
        info.subtitles?.let { InfoLine(Lucide.Captions, stringResource(R.string.media_info_subtitles), it) }
    }
}

@Composable
private fun InfoLine(icon: Int, label: String, text: String) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        // Level with the first line of text, which may wrap.
        LucideIcon(icon, label, size = 16.dp, tint = Palette.Muted, modifier = Modifier.padding(top = 2.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, color = Palette.Foreground.copy(alpha = 0.8f), maxLines = 3, overflow = TextOverflow.Ellipsis)
    }
}
