package io.github.zekurio.matinee.ui.home

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.Library
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.ShelfEntry
import io.github.zekurio.matinee.ui.requests.homeAskedRail
import io.github.zekurio.matinee.ui.requests.rememberHomeAsked
import io.github.zekurio.matinee.api.TitleSort
import io.github.zekurio.matinee.api.isAdmin
import io.github.zekurio.matinee.ui.AppHeader
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalOffline
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.RefreshOnResume
import io.github.zekurio.matinee.ui.StatusBarScrim
import io.github.zekurio.matinee.ui.components.DisconnectedAction
import io.github.zekurio.matinee.ui.components.EpisodeCard
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.LocalActions
import io.github.zekurio.matinee.ui.components.Rail
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.ShelfCard
import io.github.zekurio.matinee.ui.components.isWide
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.tabBarPadding
import io.github.zekurio.matinee.ui.theme.Palette

@Composable
fun HomeScreen() {
    // Offline mode leaves the server alone: Home is the downloads.
    if (LocalOffline.current) {
        OfflineHomeScreen()
        return
    }
    OnlineHomeScreen()
}

@Composable
private fun OnlineHomeScreen() {
    val loaders = rememberHomeLoaders()
    val libraries = loaders.libraries
    val resume = loaders.resume
    val nextUp = loaders.nextUp
    val featured = loaders.featured
    val config = LocalConfiguration.current
    // On a phone, short enough that two rows of stills, captions and all,
    // fit under it above the bottom bar: 328dp of a 20:9 phone's 952. Under
    // 320dp its title and buttons would reach the header. Tablets and
    // TVs keep a tall banner.
    val heroHeight = if (isWide()) maxOf(config.screenHeightDp * 0.68f, 460f).dp
    else (config.screenHeightDp * 0.345f).coerceIn(320f, 400f).dp

    if (failedOutright(libraries.state, listOf(resume.state, nextUp.state, featured.state))) {
        Column(Modifier.fillMaxSize()) {
            AppHeader()
            ErrorBox(
                stringResource(R.string.home_failed),
                (libraries.state as? Load.Failed)?.message,
                { loaders.all.forEach { it.reload() } },
                aboveTabBar = true,
                disconnected = (libraries.state as? Load.Failed)?.disconnected == true,
            )
        }
        return
    }

    val libs = (libraries.state as? Load.Ready)?.value
    // Every shelf loads with the page, as on the web, so the page knows
    // which failed before they scroll into view.
    val shelves = libs.orEmpty().map { library -> key(library.id) { library to rememberShelf(library) } }
    // What failed is left out, as on the web, and loads again when Home
    // comes back. Only a Home with nothing at all says so, above.
    val onPage = loaders.all + shelves.map { it.second }
    // Rows that have nothing are left out of the list rather than drawn
    // empty, since the list puts its gap around every item.
    val asked = rememberHomeAsked()
    val hidden = LocalActions.current.hidden
    val listState = rememberLazyListState()
    val haze = rememberHazeState()
    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize().hazeSource(haze),
            state = listState,
            contentPadding = PaddingValues(bottom = tabBarPadding() + 24.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            item(key = "hero") {
                val top: @Composable () -> Unit = {
                    // Showing what loaded before while the server can't be reached: the icon, up top.
                    AppHeader { DisconnectedAction(*onPage.toTypedArray()) }
                }
                when (val state = featured.state) {
                    Load.Loading -> HeroSkeleton(Modifier.height(heroHeight), top)
                    is Load.Failed -> Column { top() }
                    is Load.Ready -> if (state.value.isNotEmpty()) Hero(state.value, Modifier.height(heroHeight), top)
                    else Column { top() }
                }
            }

            if (libs?.isEmpty() == true) {
                item(key = "empty") { NoLibraries() }
                return@LazyColumn
            }

            episodeRail("continue", R.string.browse_continue_watching, resume)
            episodeRail("nextUp", R.string.browse_next_up, nextUp)
            recommendationRails(loaders.recommendations, hidden)
            homeAskedRail(asked)
            if (libraries.state == Load.Loading) {
                item(key = "shelves-loading") { RailSkeleton(null, RailArt.Poster) }
            }
            shelves.forEach { (library, entries) ->
                if (entries.state !is Load.Failed) item(key = "shelf-${library.id}") { LibraryShelf(library, entries) }
            }
        }
        StatusBarScrim(listState, haze)
    }
}

/**
 * Continue watching or Next up. Loading and empty show nothing: an empty
 * one is the usual case for someone not in the middle of anything, and a
 * placeholder there would only fold away. A failed one is left out too.
 */
private fun LazyListScope.episodeRail(key: String, @StringRes title: Int, loader: Loader<List<MediaItem>>) {
    when (val rail = railState(loader.state)) {
        RailState.Loading, RailState.Empty, is RailState.Failed -> Unit
        is RailState.Shown -> item(key = key) { EpisodeRail(stringResource(title), rail.items) }
    }
}

/** A row of files to start or resume. One that moved to the front starts the row there again. */
@Composable
private fun EpisodeRail(title: String, items: List<MediaItem>) {
    key(items.first().id) {
        Rail(title) {
            items(items, key = { it.id }) { item ->
                EpisodeCard(item, Modifier.width(railItemWidth(RailArt.Landscape)))
            }
        }
    }
}

/** A library's newest titles. One that failed isn't shown. */
@Composable
private fun LibraryShelf(library: Library, entries: Loader<List<ShelfEntry>>) {
    val nav = LocalNavigator.current
    // Also refreshes when it scrolls back into view, once the last answer is old enough.
    RefreshOnResume(entries)
    val title = stringResource(R.string.browse_recently_added, library.name)
    val onTitleClick = if (library.itemCount > 0) ({ nav.library(library.id, TitleSort.RECENT) }) else null
    when (val state = railState(entries.state)) {
        RailState.Loading -> RailSkeleton(title, RailArt.Poster, onTitleClick)
        is RailState.Failed -> Unit
        RailState.Empty -> Rail(title, onTitleClick = onTitleClick) {
            item {
                Text(
                    stringResource(R.string.browse_empty_shelf),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Palette.Muted,
                    modifier = Modifier.padding(vertical = 24.dp),
                )
            }
        }
        is RailState.Shown -> Rail(title, onTitleClick = onTitleClick) {
            items(state.items, key = { it.title.id }) { entry ->
                ShelfCard(entry, Modifier.width(railItemWidth(RailArt.Poster)))
            }
        }
    }
}

@Composable
private fun NoLibraries() {
    val user = LocalUser.current
    Column(
        Modifier.fillMaxWidth().padding(horizontal = Gutter, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // An admin sees every library, so none means none exist. Anyone else
        // may be in no group that opens one.
        val admin = user.isAdmin
        LucideIcon(if (admin) Lucide.FolderPlus else Lucide.Popcorn, null, size = 32.dp, tint = Palette.Muted)
        Gap(16.dp)
        Text(stringResource(if (admin) R.string.browse_home_no_libraries else R.string.browse_home_nothing_yet), style = MaterialTheme.typography.titleMedium)
        Gap(4.dp)
        Text(
            stringResource(if (admin) R.string.browse_home_no_libraries_admin else R.string.browse_home_nothing_yet_description),
            style = MaterialTheme.typography.bodyMedium,
            color = Palette.Muted,
            textAlign = TextAlign.Center,
        )
    }
}
