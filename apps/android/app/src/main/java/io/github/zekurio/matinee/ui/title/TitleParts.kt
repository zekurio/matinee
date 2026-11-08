package io.github.zekurio.matinee.ui.title

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.browse.creditKind
import io.github.zekurio.matinee.ui.components.ArtFrame
import io.github.zekurio.matinee.ui.components.Badge
import io.github.zekurio.matinee.ui.components.CardShape
import io.github.zekurio.matinee.ui.components.CardText
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.ImageSource
import io.github.zekurio.matinee.ui.components.LocalActions
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.PersonCard
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.PlayGlyph
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
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(
                    0f to Palette.Background.copy(alpha = 0.5f),
                    0.3f to Color.Transparent,
                    0.6f to Palette.Background.copy(alpha = 0.35f),
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
 * "S1, E3".
 */
@Composable
fun ActionRow(
    play: MediaItem?,
    resume: Boolean,
    playDetail: String?,
    watched: Boolean,
    favorite: Boolean,
    onWatched: suspend () -> Unit,
    onFavorite: suspend () -> Unit,
    onMore: () -> Unit,
) {
    val nav = LocalNavigator.current
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
            if (playDetail != null) Text(playDetail, color = Color.Black.copy(alpha = 0.6f))
        }
        RoundIconButton(
            Lucide.Check,
            stringResource(if (watched) R.string.media_mark_unwatched else R.string.media_mark_watched),
            { scope.launchShowing(snackbar, watchedFailure) { onWatched() } },
            tint = if (watched) Palette.Accent else Palette.Foreground,
        )
        RoundIconButton(
            if (favorite) Lucide.HeartFilled else Lucide.Heart,
            stringResource(if (favorite) R.string.media_remove_favorite else R.string.media_add_favorite),
            { scope.launchShowing(snackbar, favoriteFailure) { onFavorite() } },
            tint = if (favorite) Palette.Danger else Palette.Foreground,
        )
        RoundIconButton(Lucide.Ellipsis, stringResource(R.string.title_more_actions), onMore)
    }
}

/** The title's poster beside its name and facts, as the web's title header lays them out on phones. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TitleHeading(title: Title, flags: List<String>) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    Row(Modifier.padding(horizontal = Gutter), verticalAlignment = Alignment.Bottom) {
        Box(Modifier.width(if (isWide()) 180.dp else 112.dp)) {
            PosterArt(title.name, api.art(title.images.poster, ArtworkSize.Small))
        }
        Gap(16.dp)
        Column(Modifier.weight(1f).padding(bottom = 4.dp)) {
            Text(title.name, style = MaterialTheme.typography.headlineLarge, maxLines = 3, overflow = TextOverflow.Ellipsis)
            if (title.originalName != null && title.originalName != title.name) {
                Text(title.originalName, style = MaterialTheme.typography.bodyLarge, color = Palette.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Gap(8.dp)
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                itemVerticalAlignment = Alignment.CenterVertically,
            ) {
                val facts = listOfNotNull(
                    title.year?.toString(),
                    if (title.isShow) res.getQuantityString(R.plurals.media_episode_count, title.itemCount, title.itemCount)
                    else formatRuntime(title.runtimeMinutes, res),
                    if (title.isShow) title.status else null,
                )
                if (facts.isNotEmpty()) {
                    Text(facts.joinToString(" · "), style = MaterialTheme.typography.bodyMedium, color = Palette.Foreground.copy(alpha = 0.8f))
                }
                title.contentRating?.let { Badge(it, outlined = true) }
                title.rating?.let { rating ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        LucideIcon(Lucide.Star, stringResource(R.string.media_hero_rated), size = 14.dp, tint = Palette.Star)
                        Text(formatRating(rating), style = MaterialTheme.typography.bodyMedium)
                    }
                }
                flags.forEach { Badge(it) }
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

@Composable
private fun SeasonCard(title: Title, season: Season, modifier: Modifier, onClick: () -> Unit) {
    val api = LocalApi.current
    val res = LocalResources.current
    val left = season.itemCount - season.watchedCount
    Column(modifier.clip(CardShape).clickable(onClick = onClick)) {
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
                    color = Color.Black,
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
 * still with Play on it, its number and name, air date and runtime, and
 * what happens in it.
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
        Box(Modifier.clip(CardShape).clickable { nav.episode(item.id) }) {
            ArtFrame(label.showName, 16f / 9f) {
                Picture(api.landscape(item, ArtworkSize.Medium), Modifier.fillMaxSize())
                if (watched) WatchedBadge(Modifier.align(Alignment.TopEnd).padding(8.dp))
                else if (ratio != null && ratio > 0f) ProgressBar(ratio, Modifier.align(Alignment.BottomCenter))
                PlayGlyph({ nav.play(item.id) }, stringResource(R.string.media_play_named, label.title), size = 64.dp)
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
@Composable
fun StillFrame(item: MediaItem, watched: Boolean) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val label = itemLabel(item, res)
    val ratio = progressRatio(item)
    Box(
        Modifier
            .padding(horizontal = Gutter)
            .fillMaxWidth()
            .aspectRatio(16f / 9f)
            .clip(CardShape)
            .tone(label.showName)
            .border(1.dp, Palette.Border, CardShape),
        contentAlignment = Alignment.Center,
    ) {
        Picture(api.landscape(item, ArtworkSize.Medium), Modifier.fillMaxSize())
        if (watched) WatchedBadge(Modifier.align(Alignment.TopEnd).padding(10.dp), size = 24.dp)
        else if (ratio != null && ratio > 0f) ProgressBar(ratio, Modifier.align(Alignment.BottomCenter))
        PlayGlyph({ nav.play(item.id) }, stringResource(R.string.media_play_named, label.title), size = 64.dp)
    }
}
