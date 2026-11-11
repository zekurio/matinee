package io.github.zekurio.matinee.ui.tv.detail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.Title
import io.github.zekurio.matinee.api.isShow
import io.github.zekurio.matinee.api.summary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.components.LocalActions
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.frame
import io.github.zekurio.matinee.ui.components.launchShowing
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.mediaFlags
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.timeLeft
import io.github.zekurio.matinee.ui.title.isResuming
import io.github.zekurio.matinee.ui.title.rememberFileInfo
import io.github.zekurio.matinee.ui.title.showsNextUp
import io.github.zekurio.matinee.ui.title.titleFacts
import io.github.zekurio.matinee.ui.tv.ShowBackdrop
import io.github.zekurio.matinee.ui.tv.TvFocusMemory
import io.github.zekurio.matinee.ui.tv.TvIconButton
import io.github.zekurio.matinee.ui.tv.TvMainButton
import io.github.zekurio.matinee.ui.tv.TvType
import io.github.zekurio.matinee.ui.tv.rememberTvFocusMemory

/** A movie's or show's page on a TV. */
@Composable
fun TvTitleScreen(id: String) {
    val loader = rememberLoader("title-$id") { titles.get(id) }
    DetailState(loader.state, stringResource(R.string.title_load_error), loader::reload) { title -> TitlePage(title) }
}

/**
 * The title over its backdrop: its name or logo, facts, genres, and
 * overview, with Play and its marks under them, focus on Play. Below, for
 * a show, the episode up next, the episodes of a show with one season, and
 * its seasons; then the cast and crew, and its genres and studios.
 */
@Composable
private fun TitlePage(title: Title) {
    val api = LocalApi.current
    val next = title.next
    val memory = rememberTvFocusMemory()
    memory.Restore { ACTIONS to if (next != null) PLAY else WATCHED }
    ShowBackdrop(listOfNotNull(api.art(title.images.backdrop, ArtworkSize.Large), next?.let { api.frame(it.id, large = true) }))
    // One season, so no specials either: its episodes go right on the show's page, as on the phone.
    val only = title.seasons.singleOrNull()
    DetailList(header = { TitleHeader(title, memory) }) {
        if (title.isShow) {
            if (next != null && showsNextUp(title)) item(key = "nextUp") { NextUpRow(next, memory) }
            if (only != null) {
                item(key = "episodes") {
                    EpisodesRow(stringResource(R.string.title_episodes), "episodes", title.id, only.number, memory, start = next?.id)
                }
            }
            item(key = "seasons") { SeasonsRow(title, memory) }
        }
        item(key = "people") { PeopleRow(title, memory) }
        item(key = "links") { LinksRow(title, memory) }
    }
}

@Composable
private fun TitleHeader(title: Title, memory: TvFocusMemory) {
    val api = LocalApi.current
    val res = LocalResources.current
    val next = title.next
    HeaderColumn {
        val logo = api.art(title.images.logo, ArtworkSize.Medium)
        if (logo != null) {
            Picture(listOf(logo), Modifier.size(width = 420.dp, height = 110.dp), contentScale = ContentScale.Fit, alignment = Alignment.CenterStart)
        } else {
            Text(title.name, style = HeroType, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.width(720.dp))
        }
        if (title.originalName != null && title.originalName != title.name) {
            Text(title.originalName, style = TvType.Body, color = Palette.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        DetailFacts(
            titleFacts(title, res),
            title.contentRating,
            title.rating,
            Modifier.padding(top = 12.dp),
            flags = if (title.isShow || next == null) emptyList() else mediaFlags(next),
        )
        if (title.genres.isNotEmpty()) {
            Text(title.genres.joinToString(", "), style = TvType.Label, color = Palette.Muted, maxLines = 1, modifier = Modifier.padding(top = 8.dp))
        }
        Row(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            if (title.overview != null) DetailOverview(title.overview, tagline = title.tagline)
            // A movie's file: its picture, audio, and subtitles. A show's differ by episode.
            if (!title.isShow && next != null) rememberFileInfo(next)?.let { FileInfoLines(it, Modifier.width(240.dp)) }
        }
        TitleButtons(title, memory, Modifier.padding(top = 28.dp))
    }
}

/**
 * Play, or Resume with the time left, as the phone decides it, then play
 * from the start for a movie in progress, and the watched and favorite
 * marks. The tick, as the phone's, asks when before marking watched.
 */
@Composable
private fun TitleButtons(title: Title, memory: TvFocusMemory, modifier: Modifier = Modifier) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val actions = LocalActions.current
    val snackbar = LocalSnackbar.current
    val viewer = LocalContext.current.app.viewer
    val scope = rememberCoroutineScope()
    val summary = title.summary
    val next = title.next
    val resume = isResuming(next)
    val watched = viewer.isWatched(summary)
    val favorite = viewer.isFavorite(summary)
    val watchedFailure = stringResource(if (watched) R.string.media_mark_unwatched_failed else R.string.media_mark_watched_failed)
    val favoriteFailure = stringResource(R.string.media_favorite_failed)
    Row(with(memory) { modifier.row(ACTIONS) }, horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
        TvMainButton(
            Lucide.Play,
            stringResource(if (resume) R.string.title_resume else R.string.title_play),
            onClick = { next?.let { nav.play(it.id) } },
            modifier = with(memory) { Modifier.item(ACTIONS, PLAY) },
            detail = listOfNotNull(
                if (title.isShow) next?.let { episodeCode(it, res) } else null,
                if (resume) next?.let { timeLeft(it, res) } else null,
            ).joinToString(" · ").ifEmpty { null },
            enabled = next != null,
        )
        if (!title.isShow && next != null && resume) {
            TvIconButton(
                Lucide.RotateCcw,
                stringResource(R.string.actions_play_from_start),
                { nav.play(next.id, 0.0) },
                with(memory) { Modifier.item(ACTIONS, "restart") },
            )
        }
        TvIconButton(
            if (watched) Lucide.CircleCheck else Lucide.Check,
            stringResource(if (watched) R.string.media_mark_unwatched else R.string.media_mark_watched),
            {
                if (watched) scope.launchShowing(snackbar, watchedFailure) { viewer.setWatched(api, summary, false) }
                else actions.askWatched(title.name) { at -> viewer.setWatched(api, summary, true, watchedAt = at) }
            },
            with(memory) { Modifier.item(ACTIONS, WATCHED) },
            tint = if (watched) Palette.Accent else Palette.Foreground,
        )
        TvIconButton(
            if (favorite) Lucide.HeartFilled else Lucide.Heart,
            stringResource(if (favorite) R.string.media_remove_favorite else R.string.media_add_favorite),
            { scope.launchShowing(snackbar, favoriteFailure) { viewer.setFavorite(api, summary, !favorite) } },
            with(memory) { Modifier.item(ACTIONS, "favorite") },
            tint = if (favorite) Palette.Danger else Palette.Foreground,
        )
    }
}
