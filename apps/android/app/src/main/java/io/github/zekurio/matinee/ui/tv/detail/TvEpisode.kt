package io.github.zekurio.matinee.ui.tv.detail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.components.LocalActions
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.frame
import io.github.zekurio.matinee.ui.components.launchShowing
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.timeLeft
import io.github.zekurio.matinee.ui.title.episodeFacts
import io.github.zekurio.matinee.ui.title.isResuming
import io.github.zekurio.matinee.ui.title.rememberFileInfo
import io.github.zekurio.matinee.ui.tv.ShowBackdrop
import io.github.zekurio.matinee.ui.tv.TvFocusMemory
import io.github.zekurio.matinee.ui.tv.TvIconButton
import io.github.zekurio.matinee.ui.tv.TvMainButton
import io.github.zekurio.matinee.ui.tv.TvType
import io.github.zekurio.matinee.ui.tv.rememberTvFocusMemory

/** An episode's page on a TV, or a loose file's. */
@Composable
fun TvEpisodeScreen(itemId: String) {
    val loader = rememberLoader("media-$itemId") { media.get(itemId) }
    DetailState(loader.state, stringResource(R.string.title_episode_load_error), loader::reload) { item -> EpisodePage(item) }
}

/**
 * The episode over its still, or its show's art: the show, season and
 * number, name, facts, overview, and file, with Play and its marks and
 * the ways to its season and show. Below, the rest of its season.
 */
@Composable
private fun EpisodePage(item: MediaItem) {
    val api = LocalApi.current
    val res = LocalResources.current
    val memory = rememberTvFocusMemory()
    memory.Restore { ACTIONS to PLAY }
    val title = item.title
    val season = item.seasonNumber
    ShowBackdrop(
        listOfNotNull(
            api.art(item.episode?.still, ArtworkSize.Large),
            api.art(title?.images?.backdrop, ArtworkSize.Large),
            api.frame(item.id, large = true),
        ),
    )
    DetailList(header = { EpisodeHeader(item, memory) }) {
        if (title != null) {
            item(key = "more") {
                EpisodesRow(
                    stringResource(R.string.title_episode_more_from, seasonName(season, res)),
                    "more",
                    title.id,
                    season,
                    memory,
                    exclude = item.id,
                )
            }
        }
    }
}

@Composable
private fun EpisodeHeader(item: MediaItem, memory: TvFocusMemory) {
    val res = LocalResources.current
    val viewer = LocalContext.current.app.viewer
    val label = itemLabel(item, res)
    val season = item.seasonNumber
    HeaderColumn {
        Text(label.showName, style = TvType.Title, color = Palette.Foreground.copy(alpha = 0.9f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        val where = listOfNotNull(
            season?.let { if (it == 0) stringResource(R.string.title_episode_specials) else stringResource(R.string.title_episode_season, it) },
            item.episodeNumber?.let { stringResource(R.string.title_episode_number, it) },
        ).joinToString("  ·  ")
        if (where.isNotEmpty()) Text(where, style = TvType.Facts, color = Palette.Muted, modifier = Modifier.padding(top = 2.dp))
        Text(label.title, style = HeroType, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp).width(720.dp))
        DetailFacts(episodeFacts(item, viewer, res), item.title?.contentRating, null, Modifier.padding(top = 12.dp))
        Row(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            item.episode?.overview?.let { DetailOverview(it, lines = 4) }
            rememberFileInfo(item)?.let { FileInfoLines(it, Modifier.width(240.dp)) }
        }
        EpisodeButtons(item, memory, Modifier.padding(top = 28.dp))
    }
}

/**
 * Play, or Resume with the time left, play from the start while it's in
 * progress, the marks, then its season and its show.
 */
@Composable
private fun EpisodeButtons(item: MediaItem, memory: TvFocusMemory, modifier: Modifier = Modifier) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val actions = LocalActions.current
    val snackbar = LocalSnackbar.current
    val viewer = LocalContext.current.app.viewer
    val scope = rememberCoroutineScope()
    val label = itemLabel(item, res)
    val title = item.title
    val season = item.seasonNumber
    val resume = isResuming(item)
    val watched = viewer.isWatched(item)
    val favorite = viewer.isFavorite(item)
    val watchedFailure = stringResource(if (watched) R.string.media_mark_unwatched_failed else R.string.media_mark_watched_failed)
    val favoriteFailure = stringResource(R.string.media_favorite_failed)
    Row(with(memory) { modifier.row(ACTIONS) }, horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
        TvMainButton(
            Lucide.Play,
            stringResource(if (resume) R.string.title_resume else R.string.title_play),
            onClick = { nav.play(item.id) },
            modifier = with(memory) { Modifier.item(ACTIONS, PLAY) },
            detail = if (resume) timeLeft(item, res) else null,
        )
        if (resume) {
            TvIconButton(Lucide.RotateCcw, stringResource(R.string.actions_play_from_start), { nav.play(item.id, 0.0) }, with(memory) { Modifier.item(ACTIONS, "restart") })
        }
        TvIconButton(
            if (watched) Lucide.CircleCheck else Lucide.Check,
            stringResource(if (watched) R.string.media_mark_unwatched else R.string.media_mark_watched),
            {
                if (watched) scope.launchShowing(snackbar, watchedFailure) { viewer.setWatched(api, item, false) }
                else actions.askWatched(label.title) { at -> viewer.setWatched(api, item, true, at) }
            },
            with(memory) { Modifier.item(ACTIONS, WATCHED) },
            tint = if (watched) Palette.Accent else Palette.Foreground,
        )
        TvIconButton(
            if (favorite) Lucide.HeartFilled else Lucide.Heart,
            stringResource(if (favorite) R.string.media_remove_favorite else R.string.media_add_favorite),
            { scope.launchShowing(snackbar, favoriteFailure) { viewer.setFavorite(api, item, !favorite) } },
            with(memory) { Modifier.item(ACTIONS, "favorite") },
            tint = if (favorite) Palette.Danger else Palette.Foreground,
        )
        if (title != null && season != null) {
            TvIconButton(
                Lucide.List,
                stringResource(R.string.actions_go_to_show, seasonName(season, res)),
                { nav.seasonUp(title.id, season) },
                with(memory) { Modifier.item(ACTIONS, "season") },
            )
        }
        if (title != null) {
            TvIconButton(
                Lucide.Tv,
                stringResource(R.string.actions_go_to_show, title.name),
                { nav.titleUp(title.id) },
                with(memory) { Modifier.item(ACTIONS, "show") },
            )
        }
    }
}
