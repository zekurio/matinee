package io.github.zekurio.matinee.ui.tv.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.StatsRange
import io.github.zekurio.matinee.api.WatchStats
import io.github.zekurio.matinee.api.isAdmin
import io.github.zekurio.matinee.api.name
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.RefreshOnResume
import io.github.zekurio.matinee.ui.components.Avatar
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.landscape
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.profile.ProfileStats
import io.github.zekurio.matinee.ui.profile.formatWatchTime
import io.github.zekurio.matinee.ui.profile.joinedMonth
import io.github.zekurio.matinee.ui.profile.rangeName
import io.github.zekurio.matinee.ui.profile.rangePhrase
import io.github.zekurio.matinee.ui.profile.rememberProfileStats
import io.github.zekurio.matinee.ui.progressRatio
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.HideClockWhen
import io.github.zekurio.matinee.ui.tv.Overscan
import io.github.zekurio.matinee.ui.tv.TvArtCard
import io.github.zekurio.matinee.ui.tv.TvButton
import io.github.zekurio.matinee.ui.tv.TvChip
import io.github.zekurio.matinee.ui.tv.TvCards
import io.github.zekurio.matinee.ui.tv.TvFocusMemory
import io.github.zekurio.matinee.ui.tv.TvLandscapeCard
import io.github.zekurio.matinee.ui.tv.TvPage
import io.github.zekurio.matinee.ui.tv.TvPosterCard
import io.github.zekurio.matinee.ui.tv.TvRow
import io.github.zekurio.matinee.ui.tv.TvType
import io.github.zekurio.matinee.ui.tv.rememberTvFocusMemory
import io.github.zekurio.matinee.ui.tv.scrolledUp
import io.github.zekurio.matinee.api.LeaderboardBoard
import io.github.zekurio.matinee.ui.profile.BoardStanding
import java.text.NumberFormat
import java.time.ZoneId

private const val ACTIONS = "actions"
private const val RECENT = "recent"
private const val RANGES = "ranges"
private const val TOP = "top"
private const val GENRES = "genres"
private const val SEE_ALL = "seeAll"

/**
 * The signed-in person on a TV, from the drawer's top entry: who they are,
 * Settings and Sign out, what they watched last as a row of cards, then
 * their statistics for a range: watch time over the range as bars, the
 * other totals as large figures, their most watched titles, their genres,
 * where they stand on the leaderboard, and when in the week they watch.
 * A leaderboard board opens whole in the right-edge panel.
 */
@Composable
fun TvProfileScreen() {
    val session = LocalContext.current.app.session
    val user = LocalUser.current
    val profile = rememberLoader("profile-${user.username}") { profiles.get(user.username) }
    RefreshOnResume(profile)
    val stats = rememberProfileStats(user.username)
    val memory = rememberTvFocusMemory()
    memory.Restore { ACTIONS to "settings" }
    val loaded = (profile.state as? Load.Ready)?.value

    val list = rememberLazyListState()
    val scrolled by remember { derivedStateOf { list.scrolledUp } }
    HideClockWhen(scrolled)
    val board = remember { BoardPanelState() }
    val zone = remember { ZoneId.systemDefault().id }
    val standings = stats.stats?.takeIf { it.totals.plays > 0 }?.let { rememberStandings(stats.range, zone) }.orEmpty()
    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            state = list,
            contentPadding = PaddingValues(top = Overscan.Vertical + 8.dp, bottom = 120.dp),
            verticalArrangement = Arrangement.spacedBy(32.dp),
        ) {
            item(key = "who") { Header(loaded?.let(::joinedMonth)) }
            item(key = ACTIONS) { Actions(session, memory) }
            when (val state = profile.state) {
                Load.Loading -> item(key = "loading") { Spinner() }
                is Load.Failed -> item(key = "failed") {
                    Notice(stringResource(R.string.profile_load_failed), state.message)
                }
                is Load.Ready -> {
                    val recent = state.value.recent.orEmpty().map { it.item }
                    if (recent.isNotEmpty()) item(key = RECENT) { RecentRow(recent, memory) }
                }
            }
            statistics(stats, standings, memory, board::show)
        }
        BoardPanel(board, stats.range, memory)
    }
}

/** The picture, the name, and the username, when they joined, and whether they're an admin. */
@Composable
private fun Header(joined: String?) {
    val api = LocalApi.current
    val user = LocalUser.current
    Row(
        Modifier.padding(start = TvPage.Start, end = 220.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        Avatar(user.name, user.avatarId?.let(api.paths::avatar), size = 96.dp)
        Column {
            Text(user.name, style = TvType.Display, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val facts = listOfNotNull(
                user.displayName?.let { "@${user.username}" },
                joined?.let { stringResource(R.string.profile_joined, it) },
                if (user.isAdmin) stringResource(R.string.profile_admin) else null,
            )
            if (facts.isNotEmpty()) {
                Text(facts.joinToString("  ·  "), style = TvType.Facts, color = Palette.Muted, modifier = Modifier.padding(top = 6.dp))
            }
        }
    }
}

/** Settings and Sign out, the profile's ways on. */
@Composable
private fun Actions(session: Session, memory: TvFocusMemory) {
    val nav = LocalNavigator.current
    Row(
        with(memory) { Modifier.row(ACTIONS) }.padding(start = TvPage.Start),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        TvButton(stringResource(R.string.shell_settings), nav::settings, with(memory) { Modifier.item(ACTIONS, "settings") }, icon = Lucide.Settings)
        TvButton(stringResource(R.string.shell_sign_out), session::signOut, with(memory) { Modifier.item(ACTIONS, "signOut") }, icon = Lucide.LogOut)
    }
}

/** The last files watched, a card each that opens its page, and a card for the whole list. */
@Composable
private fun RecentRow(items: List<MediaItem>, memory: TvFocusMemory) {
    val nav = LocalNavigator.current
    TvRow(stringResource(R.string.profile_recent), RECENT, memory) {
        items(items, key = { it.id }) { item -> WatchedCard(item, with(memory) { Modifier.item(RECENT, item.id) }) }
        item(key = SEE_ALL) {
            Column(Modifier.width(TvCards.LandscapeWidth)) {
                TvArtCard(
                    SEE_ALL,
                    16f / 9f,
                    onClick = nav::recent,
                    modifier = with(memory) { Modifier.item(RECENT, SEE_ALL) }.fillMaxWidth(),
                    contentDescription = stringResource(R.string.tv_profile_see_all),
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        LucideIcon(Lucide.Clock, null, size = 28.dp, tint = Palette.Foreground)
                        Text(stringResource(R.string.tv_profile_see_all), style = TvType.Label, color = Palette.Foreground)
                    }
                }
            }
        }
    }
}

/** A file watched: its still, the show or movie, and the episode, opening the file's page. */
@Composable
internal fun WatchedCard(item: MediaItem, focus: Modifier) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val viewer = LocalContext.current.app.viewer
    val label = itemLabel(item, res)
    val code = episodeCode(item, res)
    TvLandscapeCard(
        toneKey = label.showName,
        art = api.landscape(item),
        caption = label.showName,
        detail = code?.let { res.getString(R.string.media_code_title, it, label.title) } ?: label.year,
        onClick = { nav.item(item) },
        progress = progressRatio(item),
        watched = viewer.isWatched(item),
        focus = focus,
    )
}

/**
 * The statistics: the heading and the ranges, then for the range picked
 * the watch-time chart, the other totals, the most watched titles, the
 * genres, the leaderboard, and the viewing times.
 */
private fun LazyListScope.statistics(
    model: ProfileStats,
    standings: List<BoardStanding>,
    memory: TvFocusMemory,
    onBoard: (LeaderboardBoard) -> Unit,
) {
    item(key = "statsHead") {
        Column(Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.profile_statistics), style = TvType.Headline, modifier = Modifier.padding(start = TvPage.Start))
            if (!model.neverWatched) Ranges(model, memory)
        }
    }
    val stats = model.stats
    val state = model.state
    when {
        state is Load.Failed && stats == null -> item(key = "statsFailed") { Notice(state.message, null) }
        stats == null -> item(key = "statsLoading") { Spinner() }
        model.neverWatched -> item(key = "statsNever") {
            Notice(stringResource(R.string.profile_self_empty), stringResource(R.string.profile_self_empty_hint))
        }
        stats.totals.plays == 0 -> item(key = "statsNothing") {
            Notice(stringResource(R.string.profile_nothing_watched, rangePhrase(model.range)), null)
        }
        else -> {
            item(key = "watchTime") { WatchTimeChart(stats, memory) }
            item(key = "totals") { Totals(stats) }
            if (stats.titles.isNotEmpty()) item(key = TOP) { TopTitles(stats, memory) }
            if (stats.genres.isNotEmpty()) item(key = GENRES) { Genres(stats, memory) }
            if (standings.isNotEmpty()) item(key = STANDING) { Standing(standings, memory, onBoard) }
            if (stats.activity.isNotEmpty()) item(key = "viewingTimes") { ViewingTimes(stats, memory) }
        }
    }
}

/** The ranges as pills, the one picked marked; Select picks another. */
@Composable
private fun Ranges(model: ProfileStats, memory: TvFocusMemory) {
    Row(
        with(memory) { Modifier.row(RANGES) }.padding(start = TvPage.Start, top = 18.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        StatsRange.all.forEach { range ->
            TvChip(
                rangeName(range),
                { model.onRange(range) },
                with(memory) { Modifier.item(RANGES, range) },
                selected = range == model.range,
                role = Role.RadioButton,
            )
        }
    }
}

/** Plays and what was finished, as large figures across. The watch time is the chart's, above. */
@Composable
private fun Totals(stats: WatchStats) {
    val count = remember { NumberFormat.getIntegerInstance() }
    val totals = stats.totals
    val figures = listOf(
        count.format(totals.plays) to stringResource(R.string.stats_plays),
        count.format(totals.movies) to stringResource(R.string.stats_movies_finished),
        count.format(totals.episodes) to stringResource(R.string.stats_episodes_finished),
        count.format(totals.shows) to stringResource(R.string.stats_shows_watched),
    )
    Row(Modifier.padding(start = TvPage.Start, end = TvPage.End), horizontalArrangement = Arrangement.spacedBy(48.dp)) {
        figures.forEach { (value, label) ->
            Column {
                Text(value, style = TvType.Display, maxLines = 1)
                Text(label, style = TvType.Label, color = Palette.Muted, maxLines = 1)
            }
        }
    }
}

/** The most watched titles as posters, each with how often and how long under it. */
@Composable
private fun TopTitles(stats: WatchStats, memory: TvFocusMemory) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    TvRow(stringResource(R.string.stats_top), TOP, memory) {
        items(stats.titles, key = { it.title.id }) { entry ->
            Column(Modifier.width(TvCards.PosterWidth)) {
                TvPosterCard(
                    entry.title.name,
                    api.art(entry.title.images.poster),
                    onClick = { nav.title(entry.title) },
                    modifier = with(memory) { Modifier.item(TOP, entry.title.id) },
                )
                Text(
                    entry.title.name,
                    style = TvType.Label,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 12.dp),
                )
                Text(
                    formatWatchTime(entry.watchSeconds, res),
                    style = TvType.Caption,
                    color = Palette.Muted,
                    maxLines = 1,
                )
            }
        }
    }
}

/** Watch time per genre, each a pill that opens the genre. */
@Composable
private fun Genres(stats: WatchStats, memory: TvFocusMemory) {
    val nav = LocalNavigator.current
    val res = LocalResources.current
    TvRow(stringResource(R.string.stats_genres), GENRES, memory) {
        items(stats.genres, key = { it.name }) { genre ->
            TvButton(
                genre.name,
                { nav.genre(genre.name) },
                with(memory) { Modifier.item(GENRES, genre.name) },
                detail = formatWatchTime(genre.watchSeconds, res),
            )
        }
    }
}

@Composable
private fun Spinner() {
    Box(Modifier.fillMaxWidth().height(96.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(Modifier.size(32.dp), color = Palette.Muted, strokeWidth = 3.dp)
    }
}

/** A line, and one under it, where a section has nothing to show. */
@Composable
private fun Notice(title: String, detail: String?) {
    Column(Modifier.padding(start = TvPage.Start, end = TvPage.End)) {
        Text(title, style = TvType.Title, textAlign = TextAlign.Start)
        if (detail != null) Text(detail, style = TvType.Body, color = Palette.Muted, modifier = Modifier.padding(top = 4.dp))
    }
}
