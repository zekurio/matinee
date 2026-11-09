package io.github.zekurio.matinee.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.Profile
import io.github.zekurio.matinee.api.WatchStats
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalOffline
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.StatusBarScrim
import io.github.zekurio.matinee.ui.components.Avatar
import io.github.zekurio.matinee.ui.components.Badge
import io.github.zekurio.matinee.ui.components.EpisodeCard
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.ButtonLook
import io.github.zekurio.matinee.ui.components.PosterCard
import io.github.zekurio.matinee.ui.components.Rail
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.components.SectionTitle
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.settings.LinkRow
import io.github.zekurio.matinee.ui.settings.Panel
import io.github.zekurio.matinee.ui.tabBarPadding
import io.github.zekurio.matinee.ui.theme.Palette
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The profile tab, behind the person's picture in the tab bar, as the web's
 * profile page: who's signed in, their favorites, their statistics, and
 * what they watched last, with the way on to Settings, where signing out
 * is. Offline, only who it is and Settings, with a way to try the server
 * again.
 */
@Composable
fun ProfileScreen(session: Session) {
    val offline = LocalOffline.current
    val user = LocalUser.current
    val profile = if (offline) null else rememberLoader("profile-${user.username}") { profile(user.username) }
    val loaded = (profile?.state as? Load.Ready)?.value
    val listState = rememberLazyListState()
    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            state = listState,
            contentPadding = PaddingValues(bottom = tabBarPadding() + 24.dp),
            verticalArrangement = Arrangement.spacedBy(32.dp),
        ) {
            item(key = "who") { Header(loaded) }
            // Offline, trying the server again is what the page is for.
            if (offline) {
                item(key = "reconnect") {
                    Box(Modifier.padding(horizontal = Gutter)) {
                        Panel { LinkRow(stringResource(R.string.settings_go_online), icon = Lucide.RefreshCw) { session.setOfflineMode(false) } }
                    }
                }
            }
            if (!offline) {
                when (val state = profile?.state) {
                    is Load.Failed -> item(key = "failed") {
                        Text(
                            stringResource(R.string.profile_load_failed),
                            style = MaterialTheme.typography.bodyMedium,
                            color = Palette.Muted,
                            modifier = Modifier.padding(horizontal = Gutter),
                        )
                    }
                    is Load.Ready -> {
                        item(key = "favorites") { Favorites(state.value) }
                        item(key = "stats") { Statistics(state.value) }
                        state.value.recent?.takeIf { it.isNotEmpty() }?.let { recent ->
                            item(key = "recent") {
                                Rail(stringResource(R.string.profile_recent), onTitleClick = LocalNavigator.current::recent) {
                                    items(recent, key = { it.item.id }) { entry ->
                                        EpisodeCard(entry.item, Modifier.width(railItemWidth(RailArt.Landscape)))
                                    }
                                }
                            }
                        }
                    }
                    else -> item(key = "loading") {
                        Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = Palette.Accent)
                        }
                    }
                }
            }
        }
        StatusBarScrim(listState)
    }
}

/**
 * The picture and name, the username under a display name, and since when
 * they're here, with Settings in the corner as on most profiles.
 */
@Composable
private fun Header(profile: Profile?) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val user = LocalUser.current
    val joined = profile?.user?.createdAt?.let { at ->
        runCatching {
            DateTimeFormatter.ofPattern(android.text.format.DateFormat.getBestDateTimePattern(Locale.getDefault(), "MMMMyyyy"), Locale.getDefault())
                .format(Instant.parse(at).atZone(ZoneId.systemDefault()))
        }.getOrNull()
    }
    // One row, as a profile's header on a phone: the picture, who it is,
    // and Settings at its end, a button of the same weight as the avatar.
    Row(
        Modifier.fillMaxWidth().statusBarsPadding().padding(start = Gutter, end = Gutter, top = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(user.name, user.avatarId?.let(api.paths::avatar), size = 64.dp)
        Gap(16.dp)
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    user.name,
                    style = MaterialTheme.typography.titleLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (user.isAdmin) Badge(stringResource(R.string.profile_admin), outlined = true)
            }
            val facts = listOfNotNull(
                user.displayName?.let { "@${user.username}" },
                joined?.let { stringResource(R.string.profile_joined, it) },
            ).joinToString(" · ")
            if (facts.isNotEmpty()) {
                Text(facts, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Gap(12.dp)
        RoundIconButton(Lucide.Settings, stringResource(R.string.shell_settings), nav::settings, iconSize = 20.dp)
    }
}

/**
 * Favorite titles as posters, then favorite episodes; each heading opens
 * the whole list. With none yet, how to make one.
 */
@Composable
private fun Favorites(profile: Profile) {
    val nav = LocalNavigator.current
    val titles = profile.favorites.orEmpty()
    val items = profile.favoriteItems.orEmpty()
    if (titles.isEmpty() && items.isEmpty()) {
        Column(Modifier.padding(horizontal = Gutter)) {
            SectionTitle(stringResource(R.string.favorites_title))
            Gap(8.dp)
            Text(stringResource(R.string.profile_no_favorites_hint), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
        }
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(32.dp)) {
        if (titles.isNotEmpty()) {
            Rail(stringResource(R.string.favorites_title), onTitleClick = nav::favorites) {
                items(titles, key = { it.id }) { title ->
                    PosterCard(title, title.year?.toString(), Modifier.width(railItemWidth(RailArt.Poster)))
                }
            }
        }
        if (items.isNotEmpty()) {
            Rail(stringResource(R.string.profile_favorite_episodes), onTitleClick = nav::favorites) {
                items(items, key = { it.id }) { item ->
                    EpisodeCard(item, Modifier.width(railItemWidth(RailArt.Landscape)))
                }
            }
        }
    }
}

/**
 * The statistics for a range, all time to start. The last range's figures
 * stay up while the next one loads, so the page doesn't jump.
 */
@Composable
private fun Statistics(profile: Profile) {
    var range by rememberSaveable { mutableStateOf("all") }
    val zone = remember { ZoneId.systemDefault().id }
    val loader = rememberLoader("profile-stats-${profile.user.username}-$range") { profileStats(profile.user.username, range, zone) }
    var last by remember { mutableStateOf<WatchStats?>(null) }
    val state = loader.state
    LaunchedEffect(state) { if (state is Load.Ready) last = state.value }
    val stats = (state as? Load.Ready)?.value ?: last
    // With nothing ever watched, picking a period changes nothing.
    val neverWatched = stats != null && range == "all" && stats.totals.plays == 0

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        SectionTitle(stringResource(R.string.profile_statistics), Modifier.padding(horizontal = Gutter))
        if (!neverWatched) RangeChips(range) { range = it }
        Column(Modifier.padding(horizontal = Gutter), verticalArrangement = Arrangement.spacedBy(28.dp)) {
            when {
                state is Load.Failed && stats == null ->
                    Text(state.message, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                stats == null -> Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Palette.Accent)
                }
                neverWatched -> Column {
                    Text(stringResource(R.string.profile_self_empty), style = MaterialTheme.typography.bodyLarge)
                    Gap(4.dp)
                    Text(stringResource(R.string.profile_self_empty_hint), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
                }
                stats.totals.plays == 0 -> Column {
                    Text(stringResource(R.string.profile_nothing_watched, rangePhrase(range)), style = MaterialTheme.typography.bodyLarge)
                    Gap(12.dp)
                    MatineeButton(onClick = { range = "all" }, look = ButtonLook.Outline) {
                        Text(stringResource(R.string.profile_show_all_time))
                    }
                }
                else -> {
                    WatchTimeCard(stats)
                    StatList(stats)
                    TopTitles(stats)
                    Genres(stats)
                    Standing(range, zone)
                    Activity(stats)
                }
            }
        }
    }
}
