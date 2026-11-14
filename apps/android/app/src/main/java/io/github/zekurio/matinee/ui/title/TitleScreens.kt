package io.github.zekurio.matinee.ui.title

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.Season
import io.github.zekurio.matinee.api.Title
import io.github.zekurio.matinee.api.isShow
import io.github.zekurio.matinee.api.summary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.ItemTopBar
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.StatusBarScrim
import io.github.zekurio.matinee.ui.components.ActionTarget
import io.github.zekurio.matinee.ui.components.EpisodeCard
import io.github.zekurio.matinee.ui.components.EpisodeRow
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.LoadingBox
import io.github.zekurio.matinee.ui.components.LocalActions
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.PosterArt
import io.github.zekurio.matinee.ui.components.Rail
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.SectionTitle
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.frame
import io.github.zekurio.matinee.ui.components.hasActions
import io.github.zekurio.matinee.ui.components.isWide
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.kit.Badge
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.mediaFlags
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.requests.NextSeasonRow
import io.github.zekurio.matinee.ui.requests.RestOfSeasonCard
import io.github.zekurio.matinee.ui.requests.ShowGaps
import io.github.zekurio.matinee.ui.requests.ShowRequestStrip
import io.github.zekurio.matinee.ui.requests.offersSeason
import io.github.zekurio.matinee.ui.requests.rememberShowGaps
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.theme.Palette

/** How far down the backdrop a page's heading starts, so it overlaps the art's faded end. */
@Composable
private fun headingTop(): Dp = (minOf(LocalConfiguration.current.screenHeightDp * 0.46f, 420f) - 150f).dp

/**
 * Where a phone starts a heading without its poster or still, lower, for
 * more of the backdrop, as the web's `max(10rem, 30vh)`.
 */
@Composable
private fun phoneHeadingTop(): Dp = maxOf(160f, LocalConfiguration.current.screenHeightDp * 0.3f).dp

/** Loading and failure for a page that shows nothing else until it has its data. */
@Composable
private fun <T> PageState(state: Load<T>, error: String, retry: () -> Unit, content: @Composable (T) -> Unit) {
    when (state) {
        Load.Loading -> Column(Modifier.fillMaxSize()) {
            ItemTopBar()
            LoadingBox()
        }
        is Load.Failed -> Column(Modifier.fillMaxSize()) {
            ItemTopBar()
            ErrorBox(error, state.message, retry, disconnected = state.disconnected)
        }
        is Load.Ready -> content(state.value)
    }
}

@Composable
fun TitleScreen(id: String) {
    val loader = rememberLoader("title-$id") { titles.get(id) }
    PageState(loader.state, stringResource(R.string.title_load_error), loader::reload) { title -> TitlePage(title, loader::reload) }
}

/** [reload] fetches the title again, as when a show that just arrived gets its details. */
@Composable
private fun TitlePage(title: Title, reload: () -> Unit) {
    val api = LocalApi.current
    val actions = LocalActions.current
    val res = LocalResources.current
    val viewer = LocalContext.current.app.viewer
    val summary = title.summary
    val next = title.next
    // One season, so no specials either: its episodes go right on the show's page.
    val only = title.seasons.singleOrNull()
    val listState = rememberLazyListState()
    // What the server lacks of a show: seasons, the rest of one, the next one.
    val gaps = rememberShowGaps(title, onRecovered = reload)
    // Play's episode, as Next up offers it, or once every one here is watched, the next season to ask for.
    val episode = next?.takeIf { it.progress?.completed != true }
    val nextSeason = gaps?.next?.takeIf { episode == null && offersSeason(it) }
    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            state = listState,
            contentPadding = PaddingValues(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            item(key = "header") {
                Box {
                    Backdrop(
                        listOfNotNull(api.art(title.images.backdrop, ArtworkSize.Large), next?.let { api.frame(it.id, large = true) }),
                        title.name,
                    )
                    // Phones leave the poster out, for the name to have the width; seasons keep theirs.
                    val wide = isWide()
                    Column(Modifier.padding(top = if (wide) headingTop() else phoneHeadingTop())) {
                        TitleHeading(title, if (title.isShow || next == null) emptyList() else mediaFlags(next), poster = wide)
                    }
                }
            }
            if (title.overview != null) {
                item(key = "overview") {
                    Box(Modifier.padding(horizontal = Gutter)) { Overview(title.overview, title.tagline) }
                }
            }
            item(key = "crew") { CrewLines(title.credits, title.studios) }
            // A movie's file: its picture, audio, and subtitles. A show's differ by episode.
            if (!title.isShow && next != null) {
                item(key = "media") { MediaInfo(next, Modifier.padding(horizontal = Gutter)) }
            }
            if (title.isShow) item(key = "strip") { ShowRequestStrip(gaps) }
            item(key = "actions") {
                ActionRow(
                    play = next,
                    resume = isResuming(next),
                    name = title.name,
                    watched = viewer.isWatched(summary),
                    favorite = viewer.isFavorite(summary),
                    onWatched = { watched, at -> viewer.setWatched(api, summary, watched, watchedAt = at) },
                    onFavorite = { viewer.setFavorite(api, summary, !viewer.isFavorite(summary)) },
                    onMore = ActionTarget.Title(summary, file = if (title.isShow) null else next, here = true)
                        .let { more -> if (hasActions(more)) ({ actions.open(more) }) else null },
                    trailers = title.trailers,
                )
            }
            if (title.isShow) {
                if (next != null && showsNextUp(title)) {
                    item(key = "nextUp") { NextUpEpisode(next) }
                } else if (gaps != null && nextSeason != null) {
                    item(key = "nextSeason") { NextSeasonRow(title, gaps, nextSeason) }
                }
                if (only != null) {
                    item(key = "episodes") { SeasonEpisodesRail(title, only, next, gaps) }
                    item(key = "seasons") { SeasonsRail(title, gaps = gaps, extraOnly = true) }
                } else {
                    item(key = "seasons") { SeasonsRail(title, gaps = gaps) }
                }
            }
            item(key = "cast") { CastRail(title.credits) }
            item(key = "bottom") { Box(Modifier.navigationBarsPadding()) }
        }
        StatusBarScrim(listState)
        ItemTopBar()
    }
}

/** A season's episodes as a row of stills, starting at the one up next, then the ask for the rest when only some are here. */
@Composable
private fun SeasonEpisodesRail(title: Title, season: Season, next: MediaItem?, gaps: ShowGaps?) {
    val items = rememberSeasonItems(title.id, season.number)
    val list = (items.state as? Load.Ready)?.value ?: return
    val partial = gaps?.partialOf(season.number)
    val state = androidx.compose.foundation.lazy.rememberLazyListState(
        initialFirstVisibleItemIndex = list.indexOfFirst { it.id == next?.id }.coerceAtLeast(0),
    )
    Column {
        SectionTitle(stringResource(R.string.title_episodes), Modifier.padding(horizontal = Gutter))
        Gap(12.dp)
        androidx.compose.foundation.lazy.LazyRow(
            state = state,
            contentPadding = PaddingValues(horizontal = Gutter),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(list, key = { it.id }) { item ->
                EpisodeCard(item, Modifier.width(railItemWidth(RailArt.Landscape)), showName = false)
            }
            if (gaps != null && partial != null) {
                item(key = "rest") { RestOfSeasonCard(title, gaps, partial, Modifier.width(railItemWidth(RailArt.Landscape))) }
            }
        }
    }
}

@Composable
fun SeasonScreen(titleId: String, season: Int?) {
    val loader = rememberLoader("title-$titleId") { titles.get(titleId) }
    PageState(loader.state, stringResource(R.string.title_season_show_error), loader::reload) { title ->
        val current = title.seasons.firstOrNull { it.number == season }
        if (current == null) {
            Column(Modifier.fillMaxSize()) {
                ItemTopBar()
                ErrorBox(stringResource(R.string.title_season_missing, title.name), null, null)
            }
        } else {
            SeasonPage(title, current)
        }
    }
}

@Composable
private fun SeasonPage(title: Title, season: Season) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val actions = LocalActions.current
    val res = LocalResources.current
    val viewer = LocalContext.current.app.viewer
    val items = rememberSeasonItems(title.id, season.number)
    val list = (items.state as? Load.Ready)?.value
    val next = seasonNext(list, viewer)
    val allWatched = seasonWatched(list, viewer)
    val listState = rememberLazyListState()
    val gaps = rememberShowGaps(title)
    val partial = gaps?.partialOf(season.number)
    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            state = listState,
            contentPadding = PaddingValues(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            item(key = "header") {
                Box {
                    Backdrop(listOfNotNull(api.art(title.images.backdrop, ArtworkSize.Large)), title.name)
                    Row(
                        Modifier.padding(top = headingTop()).padding(horizontal = Gutter),
                        verticalAlignment = Alignment.Bottom,
                    ) {
                        Box(Modifier.width(if (isWide()) 180.dp else 112.dp)) {
                            PosterArt(seasonName(season.number, res), api.art(season.poster ?: title.images.poster))
                        }
                        Gap(16.dp)
                        Column(Modifier.weight(1f).padding(bottom = 4.dp)) {
                            Text(
                                title.name,
                                style = MaterialTheme.typography.titleMedium,
                                color = Palette.Muted,
                                modifier = Modifier.clickable { nav.titleUp(title.id) },
                            )
                            Text(seasonName(season.number, res), style = MaterialTheme.typography.headlineLarge)
                            Gap(6.dp)
                            Text(
                                listOf(
                                    res.getQuantityString(R.plurals.media_episode_count, season.itemCount, season.itemCount),
                                    res.getQuantityString(R.plurals.title_season_watched_count, season.watchedCount, season.watchedCount),
                                ).joinToString(" · "),
                                style = MaterialTheme.typography.bodyMedium,
                                color = Palette.Foreground.copy(alpha = 0.8f),
                            )
                        }
                    }
                }
            }
            season.overview?.let { overview ->
                item(key = "overview") { Box(Modifier.padding(horizontal = Gutter)) { Overview(overview) } }
            }
            item(key = "actions") {
                ActionRow(
                    play = next,
                    resume = isResuming(next),
                    name = "${title.name} · ${seasonName(season.number, res)}",
                    watched = allWatched,
                    favorite = viewer.isFavorite(title.summary, season),
                    onWatched = { watched, at -> setSeasonWatched(api, viewer, title.summary, season.number, watched, at) },
                    // The files without a season number aren't a season to mark.
                    onFavorite = if (season.number == null) null else ({ viewer.setFavorite(api, title.summary, season, !viewer.isFavorite(title.summary, season)) }),
                    onMore = ActionTarget.Season(title.summary, season, here = true)
                        .let { more -> if (hasActions(more)) ({ actions.open(more) }) else null },
                )
            }
            item(key = "episodesTitle") {
                SectionTitle(stringResource(R.string.title_episodes), Modifier.padding(horizontal = Gutter))
            }
            when (val state = items.state) {
                Load.Loading -> item(key = "loading") { LoadingBox(Modifier.padding(32.dp)) }
                is Load.Failed -> item(key = "error") {
                    Text(
                        stringResource(R.string.title_episodes_error, state.message),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Palette.Muted,
                        modifier = Modifier.padding(horizontal = Gutter),
                    )
                }
                is Load.Ready -> items(state.value, key = { it.id }) { item ->
                    Box(Modifier.padding(horizontal = Gutter)) { EpisodeRow(item) }
                }
            }
            if (gaps != null && partial != null && items.state is Load.Ready) {
                item(key = "rest") {
                    Box(Modifier.padding(horizontal = Gutter).width(railItemWidth(RailArt.Landscape))) { RestOfSeasonCard(title, gaps, partial) }
                }
            }
            item(key = "seasons") { SeasonsRail(title, season, gaps) }
            item(key = "bottom") { Box(Modifier.navigationBarsPadding()) }
        }
        StatusBarScrim(listState)
        ItemTopBar(parent = title.name, onParent = { nav.titleUp(title.id) })
    }
}

@Composable
fun EpisodeScreen(itemId: String) {
    val loader = rememberLoader("media-$itemId") { media.get(itemId) }
    PageState(loader.state, stringResource(R.string.title_episode_load_error), loader::reload) { item -> EpisodePage(item) }
}

@Composable
private fun EpisodePage(item: MediaItem) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val actions = LocalActions.current
    val res = LocalResources.current
    val viewer = LocalContext.current.app.viewer
    val label = itemLabel(item, res)
    val title = item.title
    val season = item.seasonNumber
    val listState = rememberLazyListState()
    // On a phone the still is the backdrop, with the heading on it, and
    // isn't shown again; wider, the show's art is, with the still on it.
    val wide = isWide()
    val show = listOfNotNull(api.art(title?.images?.backdrop, ArtworkSize.Large))
    val still = listOfNotNull(api.art(item.episode?.still, ArtworkSize.Large), api.frame(item.id, large = true))
    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            state = listState,
            contentPadding = PaddingValues(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            item(key = "header") {
                Box {
                    Backdrop(if (wide) show + still else still + show, label.showName)
                    if (wide) {
                        // As high as the web starts it, so the season's other episodes make the first screen too.
                        Column(Modifier.padding(top = maxOf(112f, LocalConfiguration.current.screenHeightDp * 0.2f).dp)) {
                            StillFrame(item, viewer.isWatched(item))
                        }
                    } else {
                        Box(Modifier.padding(top = phoneHeadingTop())) { EpisodeHeading(item) }
                    }
                }
            }
            if (wide) {
                item(key = "heading") { EpisodeHeading(item) }
            }
            item.episode?.overview?.let { overview ->
                item(key = "overview") { Box(Modifier.padding(horizontal = Gutter)) { Overview(overview, lines = 6) } }
            }
            item(key = "actions") {
                ActionRow(
                    play = item,
                    resume = isResuming(item),
                    name = label.title,
                    watched = viewer.isWatched(item),
                    favorite = viewer.isFavorite(item),
                    onWatched = { watched, at -> viewer.setWatched(api, item, watched, at) },
                    onFavorite = { viewer.setFavorite(api, item, !viewer.isFavorite(item)) },
                    onMore = ActionTarget.Item(item, here = true)
                        .let { more -> if (hasActions(more)) ({ actions.open(more) }) else null },
                )
            }
            if (title != null) {
                item(key = "more") { MoreFromSeason(item, title.id) }
            }
            item(key = "bottom") { Box(Modifier.navigationBarsPadding()) }
        }
        StatusBarScrim(listState)
        ItemTopBar(
            parent = if (title == null) null else if (season != null) seasonName(season, res) else label.showName,
            onParent = title?.let { { if (season != null) nav.seasonUp(it.id, season) else nav.titleUp(it.id) } },
        )
    }
}

/** An episode's show, season and number, name, facts, and file, as the web's episode header has them. */
@Composable
private fun EpisodeHeading(item: MediaItem) {
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val viewer = LocalContext.current.app.viewer
    val label = itemLabel(item, res)
    val title = item.title
    val season = item.seasonNumber
    Column(Modifier.padding(horizontal = Gutter)) {
        Text(
            label.showName,
            style = MaterialTheme.typography.titleLarge,
            modifier = if (title != null) Modifier.clickable { nav.titleUp(title.id) } else Modifier,
        )
        val where = listOfNotNull(
            season?.let { if (it == 0) stringResource(R.string.title_episode_specials) else stringResource(R.string.title_episode_season, it) },
            item.episodeNumber?.let { stringResource(R.string.title_episode_number, it) },
        ).joinToString(" · ")
        if (where.isNotEmpty()) {
            Text(
                where,
                style = MaterialTheme.typography.titleMedium,
                color = Palette.Muted,
                modifier = if (title != null) Modifier.clickable { nav.seasonUp(title.id, season) } else Modifier,
            )
        }
        Gap(6.dp)
        Text(label.title, style = MaterialTheme.typography.headlineLarge, maxLines = 3, overflow = TextOverflow.Ellipsis)
        Gap(10.dp)
        val facts = episodeFacts(item, viewer, res).joinToString(" · ")
        val rating = title?.contentRating
        if (facts.isNotEmpty() || rating != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (facts.isNotEmpty()) Text(facts, style = MaterialTheme.typography.bodyMedium, color = Palette.Foreground.copy(alpha = 0.8f))
                rating?.let { Badge(it, outlined = true) }
            }
        }
        MediaInfo(item, Modifier.padding(top = 12.dp))
    }
}

@Composable
private fun MoreFromSeason(item: MediaItem, titleId: String) {
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val season = item.seasonNumber
    val items = rememberSeasonItems(titleId, season)
    val others = (items.state as? Load.Ready)?.value?.filter { it.id != item.id }.orEmpty()
    if (others.isEmpty()) return
    Rail(
        stringResource(R.string.title_episode_more_from, seasonName(season, res)),
        onTitleClick = { nav.seasonUp(titleId, season) },
    ) {
        items(others, key = { it.id }) { other ->
            EpisodeCard(other, Modifier.width(railItemWidth(RailArt.Landscape)), showName = false)
        }
    }
}
