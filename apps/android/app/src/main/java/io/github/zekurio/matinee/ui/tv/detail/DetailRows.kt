package io.github.zekurio.matinee.ui.tv.detail

import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.Title
import io.github.zekurio.matinee.api.summary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.browse.creditKind
import io.github.zekurio.matinee.ui.components.ActionTarget
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.landscape
import io.github.zekurio.matinee.ui.episodeNumber
import io.github.zekurio.matinee.ui.formatDay
import io.github.zekurio.matinee.ui.formatRuntime
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.progressRatio
import io.github.zekurio.matinee.ui.runtimeMinutes
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.timeLeft
import io.github.zekurio.matinee.ui.title.rememberSeasonItems
import io.github.zekurio.matinee.ui.tv.TvCaptionedPoster
import io.github.zekurio.matinee.ui.tv.TvChip
import io.github.zekurio.matinee.ui.tv.TvFocusMemory
import io.github.zekurio.matinee.ui.tv.TvLandscapeCard
import io.github.zekurio.matinee.ui.tv.TvPersonCard
import io.github.zekurio.matinee.ui.tv.TvRow
import io.github.zekurio.matinee.ui.tv.tvPeople

/* The rows under a detail page's header, shared by the title, season, and episode pages. */

/**
 * An episode as a 16:9 card in a row: its still, how far in the person
 * is, its name, and its number with the time left or its length. Select
 * opens its page, as a tap does on the phone; holding Select offers the rest.
 */
@Composable
internal fun EpisodeCard(item: MediaItem, row: String, memory: TvFocusMemory, modifier: Modifier = Modifier, detail: Boolean = true) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val viewer = LocalContext.current.app.viewer
    val label = itemLabel(item, res)
    val left = if (item.progress?.completed == false) timeLeft(item, res) else null
    val number = episodeNumber(item, res)
    TvLandscapeCard(
        toneKey = label.showName,
        art = api.landscape(item),
        caption = if (detail || number == null || label.untitled) label.title else res.getString(R.string.title_episodes_coded_name, number, label.title),
        // An episode without a name is called by its number already.
        detail = if (detail) listOfNotNull(number.takeUnless { label.untitled }, left ?: formatRuntime(runtimeMinutes(item), res)).joinToString(" · ").ifEmpty { null } else null,
        onClick = { nav.item(item) },
        modifier = modifier,
        progress = progressRatio(item),
        watched = viewer.isWatched(item),
        focus = with(memory) { Modifier.item(row, item.id) },
        menu = ActionTarget.Item(item, here = false),
    )
}

/**
 * A season's episodes as a row titled [heading], without [exclude]. The
 * first time focus comes into it, it lands on [start], like the episode
 * Play starts. Nothing until they load, or if there are none.
 */
@Composable
internal fun EpisodesRow(
    heading: String,
    key: String,
    titleId: String,
    season: Int?,
    memory: TvFocusMemory,
    exclude: String? = null,
    start: String? = null,
) {
    val items = rememberSeasonItems(titleId, season)
    val list = (items.state as? Load.Ready)?.value?.filter { it.id != exclude }.orEmpty()
    if (list.isEmpty()) return
    if (start != null && list.any { it.id == start }) StartAt(memory, key, start)
    TvRow(heading, key, memory) {
        items(list, key = { it.id }) { item -> EpisodeCard(item, key, memory) }
    }
}

/** Lands focus coming into [row] on [item] the first time, rather than on its first card. */
@Composable
internal fun StartAt(memory: TvFocusMemory, row: String, item: String) {
    SideEffect { memory.rowItems.putIfAbsent(row, item) }
}

/** The episode up next on a show's page, in a row of its own, as the phone's page leads with it. */
@Composable
internal fun NextUpRow(item: MediaItem, memory: TvFocusMemory) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val viewer = LocalContext.current.app.viewer
    val label = itemLabel(item, res)
    val number = episodeNumber(item, res)
    val heading = stringResource(if (item.progress != null) R.string.title_next_up_continue else R.string.title_next_up_next)
    TvRow(heading, NEXT_UP, memory) {
        item(key = item.id) {
            TvLandscapeCard(
                toneKey = label.showName,
                art = api.landscape(item),
                caption = if (number != null && !label.untitled) res.getString(R.string.title_episodes_coded_name, number, label.title) else label.title,
                detail = listOfNotNull(
                    formatDay(item.episode?.airDate),
                    if (item.progress?.completed == false) timeLeft(item, res) else formatRuntime(runtimeMinutes(item), res),
                ).joinToString(" · ").ifEmpty { null },
                onClick = { nav.episode(item.id) },
                progress = progressRatio(item),
                watched = viewer.isWatched(item),
                focus = with(memory) { Modifier.item(NEXT_UP, item.id) },
                menu = ActionTarget.Item(item, here = false),
            )
        }
    }
}

/** A show's seasons by their posters, with how many episodes are left in each. */
@Composable
internal fun SeasonsRow(title: Title, memory: TvFocusMemory) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    if (title.seasons.isEmpty()) return
    TvRow(stringResource(R.string.title_seasons), SEASONS, memory) {
        items(title.seasons, key = { it.number ?: -1 }) { season ->
            val left = season.itemCount - season.watchedCount
            TvCaptionedPoster(
                seasonName(season.number, res),
                api.art(season.poster ?: title.images.poster),
                res.getQuantityString(R.plurals.media_episode_count, season.itemCount, season.itemCount),
                onClick = { nav.season(title.id, season.number) },
                focus = with(memory) { Modifier.item(SEASONS, (season.number ?: -1).toString()) },
                watched = left == 0,
                badge = left.toString(),
                menu = ActionTarget.Season(title.summary, season, here = false),
            )
        }
    }
}

/** The cast, then the creators, directors, and writers, each opening their page. */
@Composable
internal fun PeopleRow(title: Title, memory: TvFocusMemory) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val people = tvPeople(api, title.credits) { creditKind(it, res, 1) }
    if (people.isEmpty()) return
    TvRow(stringResource(R.string.tv_detail_people), PEOPLE, memory) {
        items(people, key = { "${it.name}-${it.role}" }) { person ->
            TvPersonCard(person, onClick = { nav.person(person.name) }, focus = with(memory) { Modifier.item(PEOPLE, "${person.name}-${person.role}") })
        }
    }
}

/** A title's genres and studios, each opening its titles across the server. */
@Composable
internal fun LinksRow(title: Title, memory: TvFocusMemory) {
    val nav = LocalNavigator.current
    if (title.genres.isEmpty() && title.studios.isEmpty()) return
    TvRow(stringResource(R.string.tv_detail_links), LINKS, memory) {
        items(title.genres, key = { "genre-$it" }) { genre ->
            TvChip(genre, { nav.genre(genre) }, with(memory) { Modifier.item(LINKS, "genre-$genre") })
        }
        items(title.studios, key = { "studio-$it" }) { studio ->
            TvChip(studio, { nav.studio(studio) }, with(memory) { Modifier.item(LINKS, "studio-$studio") })
        }
    }
}

internal const val ACTIONS = "actions"
internal const val PLAY = "play"
internal const val WATCHED = "watched"
private const val NEXT_UP = "nextUp"
private const val SEASONS = "seasons"
private const val PEOPLE = "people"
private const val LINKS = "links"
