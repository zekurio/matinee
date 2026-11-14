package io.github.zekurio.matinee.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.Profile
import io.github.zekurio.matinee.api.isAdmin
import io.github.zekurio.matinee.api.name
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.auth.Session
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalOffline
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.RefreshOnResume
import io.github.zekurio.matinee.ui.StatusBarScrim
import io.github.zekurio.matinee.ui.components.Avatar
import io.github.zekurio.matinee.ui.components.Disconnected
import io.github.zekurio.matinee.ui.components.DisconnectedAction
import io.github.zekurio.matinee.ui.components.EpisodeCard
import io.github.zekurio.matinee.ui.components.FavoriteCard
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Rail
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.SectionTitle
import io.github.zekurio.matinee.ui.components.favoriteKey
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.kit.Badge
import io.github.zekurio.matinee.ui.kit.ButtonLook
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.MatineeButton
import io.github.zekurio.matinee.ui.kit.RoundIconButton
import io.github.zekurio.matinee.ui.kit.Spinner
import io.github.zekurio.matinee.ui.media.isFavorite
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.settings.LinkRow
import io.github.zekurio.matinee.ui.settings.Panel
import io.github.zekurio.matinee.ui.tabBarPadding
import io.github.zekurio.matinee.ui.theme.Palette
import java.time.ZoneId

/**
 * The profile tab, behind the person's picture in the tab bar, as the web's
 * profile page: who's signed in, their favorites, their statistics, and
 * what they watched last, with the way on to Settings, where signing out
 * is. What the server sent last is kept, as Home keeps its rows: while the
 * server can't be reached it stays up with the disconnect icon in the
 * header, and offline mode shows it, though nothing in it opens.
 */
@Composable
fun ProfileScreen(session: Session) {
    val user = LocalUser.current
    val context = LocalContext.current
    val snapshot = remember(user.username) { ProfileSnapshot(context, user.username) }
    if (LocalOffline.current) {
        // Offline mode leaves the server alone: only what it sent before.
        val saved = remember(snapshot) { snapshot.profile.read() }
        ProfilePage(saved?.let { Load.Ready(it) }, null, rememberSavedStats(snapshot))
        return
    }
    val profile = rememberLoader("profile-${user.username}", snapshot.profile) { profiles.get(user.username) }
    // Back on the tab, favorites and what was watched may have moved on.
    RefreshOnResume(profile)
    ProfilePage(profile.state, profile, rememberProfileStats(user.username, snapshot))
}

/** The page for [state], fetched by [loader], or saved, offline, where there's none; null with nothing saved. */
@Composable
private fun ProfilePage(state: Load<Profile>?, loader: Loader<Profile>?, stats: ProfileStats) {
    val loaded = (state as? Load.Ready)?.value
    val listState = rememberLazyListState()
    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            state = listState,
            contentPadding = PaddingValues(bottom = tabBarPadding() + 24.dp),
        ) {
            item(key = "who") {
                // Showing what loaded before while the server can't be reached: the icon, up top.
                Header(loaded) { if (loader != null) DisconnectedAction(*listOfNotNull(loader, stats.loader).toTypedArray()) }
            }
            when (state) {
                null -> Unit
                is Load.Failed -> item(key = "failed") {
                    if (state.disconnected) {
                        Disconnected(loader?.let { it::reload }, Modifier.fillMaxWidth().padding(top = SectionGap))
                    } else {
                        Text(
                            stringResource(R.string.profile_load_failed),
                            style = MaterialTheme.typography.bodyMedium,
                            color = Palette.Muted,
                            modifier = Modifier.padding(start = Gutter, end = Gutter, top = SectionGap),
                        )
                    }
                }
                is Load.Ready -> {
                    item(key = "favorites") { Box(Modifier.padding(top = SectionGap)) { Favorites(state.value) } }
                    // Each card its own item, so a tab switch builds only the ones on screen.
                    statistics(stats)
                    state.value.recent?.takeIf { it.isNotEmpty() }?.let { recent ->
                        item(key = "recent") {
                            val offline = LocalOffline.current
                            Rail(
                                modifier = Modifier.padding(top = SectionGap),
                                title = stringResource(R.string.profile_recent),
                                onTitleClick = if (offline) null else LocalNavigator.current::recent,
                            ) {
                                items(recent, key = { it.item.id }) { entry ->
                                    EpisodeCard(entry.item, Modifier.width(railItemWidth(RailArt.Landscape)))
                                }
                            }
                        }
                    }
                }
                Load.Loading -> item(key = "loading") {
                    Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                        Spinner(size = 32.dp, color = Palette.Accent)
                    }
                }
            }
        }
        StatusBarScrim(listState)
    }
}

/**
 * The picture and name, the username under a display name, and since when
 * they're here, with Settings in the corner as on most profiles. [action]
 * goes before Settings; offline, the offline icon, as on Home.
 */
@Composable
private fun Header(profile: Profile?, action: @Composable () -> Unit) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val user = LocalUser.current
    val joined = profile?.let(::joinedMonth)
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
        if (LocalOffline.current) {
            LucideIcon(Lucide.CloudOff, stringResource(R.string.downloads_offline), size = 20.dp, tint = Palette.Muted)
            Gap(12.dp)
        } else {
            action()
        }
        RoundIconButton(Lucide.Settings, stringResource(R.string.shell_settings), nav::settings, iconSize = 20.dp)
    }
}

/**
 * Favorites of every kind in one rail of posters, newest first, as the web
 * shows them; its heading opens the whole lists. With none yet, how to
 * make one.
 */
@Composable
private fun Favorites(profile: Profile) {
    val nav = LocalNavigator.current
    val viewer = LocalContext.current.app.viewer
    // Offline the whole lists are the server's to send.
    val openAll = if (LocalOffline.current) null else nav::favorites
    // One taken off here goes at once, before the profile is fetched again.
    val favorites = profile.favorites.orEmpty().filter(viewer::isFavorite)
    if (favorites.isEmpty()) {
        Column(Modifier.padding(horizontal = Gutter)) {
            SectionTitle(stringResource(R.string.favorites_title))
            Gap(8.dp)
            Text(stringResource(R.string.profile_no_favorites_hint), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
        }
        return
    }
    Rail(stringResource(R.string.favorites_title), onTitleClick = openAll) {
        items(favorites, key = ::favoriteKey) { favorite ->
            FavoriteCard(favorite, Modifier.width(railItemWidth(RailArt.Poster)))
        }
    }
}

/** The gap between the page's sections. */
private val SectionGap = 32.dp

/** The gap between the statistics' cards. */
private val CardGap = 28.dp

/**
 * The statistics' heading and range, then a list item per card. Kept apart,
 * the cards below the screen wait until they scroll in, instead of all
 * being built in the frame the tab opens.
 */
private fun LazyListScope.statistics(model: ProfileStats) {
    item(key = "stats-head") {
        Column(Modifier.padding(top = SectionGap), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            SectionTitle(stringResource(R.string.profile_statistics), Modifier.padding(horizontal = Gutter))
            if (!model.neverWatched) RangeChips(model.range, model.onRange)
        }
    }
    val stats = model.stats
    val state = model.state
    val card = Modifier.padding(start = Gutter, end = Gutter, top = 16.dp)
    when {
        state is Load.Failed && stats == null -> item(key = "stats-failed") {
            if (state.disconnected) Disconnected(model.loader?.let { it::reload }, card.fillMaxWidth())
            else Text(state.message, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted, modifier = card)
        }
        stats == null -> item(key = "stats-loading") {
            Box(card.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                Spinner(size = 32.dp, color = Palette.Accent)
            }
        }
        model.neverWatched -> item(key = "stats-never") {
            Column(card) {
                Text(stringResource(R.string.profile_self_empty), style = MaterialTheme.typography.bodyLarge)
                Gap(4.dp)
                Text(stringResource(R.string.profile_self_empty_hint), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
            }
        }
        stats.totals.plays == 0 -> item(key = "stats-nothing") {
            Column(card) {
                Text(stringResource(R.string.profile_nothing_watched, rangePhrase(model.range)), style = MaterialTheme.typography.bodyLarge)
                Gap(12.dp)
                MatineeButton(onClick = { model.onRange("all") }, look = ButtonLook.Outline) {
                    Text(stringResource(R.string.profile_show_all_time))
                }
            }
        }
        else -> {
            val next = Modifier.padding(start = Gutter, end = Gutter, top = CardGap)
            item(key = "stats-time") { WatchTimeCard(stats, card) }
            item(key = "stats-list") { StatList(stats, next) }
            item(key = "stats-titles") { TopTitles(stats, next) }
            item(key = "stats-genres") { Genres(stats, next) }
            // Where they stand is a board of everyone's, which isn't saved.
            if (model.loader != null) {
                item(key = "stats-standing") { Standing(model.range, remember { ZoneId.systemDefault().id }, next) }
            }
            item(key = "stats-activity") { Activity(stats, next) }
        }
    }
}
