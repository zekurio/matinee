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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.Library
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.TitleSort
import io.github.zekurio.matinee.api.isAdmin
import io.github.zekurio.matinee.ui.AppHeader
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.RefreshOnResume
import io.github.zekurio.matinee.ui.StatusBarScrim
import io.github.zekurio.matinee.ui.components.EpisodeCard
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.Rail
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.ShelfCard
import io.github.zekurio.matinee.ui.components.isWide
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.tabBarPadding
import io.github.zekurio.matinee.ui.theme.Palette

@Composable
fun HomeScreen() {
    val libraries = rememberLoader("libraries") { libraries.list() }
    val resume = rememberLoader("continue") { home.continueWatching(limit = 20) }
    val nextUp = rememberLoader("nextUp") { home.nextUp(limit = 20) }
    val featured = rememberLoader("featured") { home.featured() }
    // Back on Home, what's in progress may have moved on, here or on
    // another device. Featured stays: it's picked at random, so fetching it
    // again would swap the banner under the person.
    RefreshOnResume(libraries, resume, nextUp)
    // Shelves on screen whose refresh failed, for the one notice that says so.
    val staleShelves = remember { mutableStateMapOf<String, Loader<*>>() }
    val config = LocalConfiguration.current
    // On a phone, short enough that two rows of stills, captions and all,
    // fit under it above the bottom bar: 328dp of a 20:9 phone's 952. Under
    // 320dp its title and buttons would reach the header. Tablets and
    // TVs keep a tall banner.
    val heroHeight = if (isWide()) maxOf(config.screenHeightDp * 0.68f, 460f).dp
    else (config.screenHeightDp * 0.345f).coerceIn(320f, 400f).dp

    val sections = listOf(libraries, resume, nextUp, featured)
    if (failedOutright(libraries.state, listOf(resume.state, nextUp.state, featured.state))) {
        Column(Modifier.fillMaxSize()) {
            AppHeader()
            ErrorBox(
                stringResource(R.string.home_failed),
                (libraries.state as? Load.Failed)?.message,
                { sections.forEach { it.reload() } },
            )
        }
        return
    }

    val stale = sections + staleShelves.values
    val staleError = stale.firstNotNullOfOrNull { it.refreshError }
    val libs = (libraries.state as? Load.Ready)?.value
    val listState = rememberLazyListState()
    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            state = listState,
            contentPadding = PaddingValues(bottom = tabBarPadding() + 24.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            item(key = "hero") {
                val top: @Composable () -> Unit = { AppHeader() }
                when (val state = featured.state) {
                    Load.Loading -> HeroSkeleton(Modifier.height(heroHeight), top)
                    is Load.Failed -> Column {
                        top()
                        Notice(
                            stringResource(R.string.home_featured_failed),
                            state.message,
                            featured::reload,
                            Modifier.padding(top = 8.dp),
                        )
                    }
                    is Load.Ready -> if (state.value.isNotEmpty()) Hero(state.value, Modifier.height(heroHeight), top)
                    else Column { top() }
                }
            }

            if (staleError != null) {
                item(key = "stale") {
                    Notice(
                        stringResource(R.string.loading_stale),
                        staleError,
                        { stale.filter { it.refreshError != null }.forEach { it.reload() } },
                        retrying = stale.any { it.refreshError != null && it.refreshing },
                    )
                }
            }

            if (libs?.isEmpty() == true) {
                item(key = "empty") { NoLibraries() }
                return@LazyColumn
            }

            episodeRail("continue", R.string.browse_continue_watching, R.string.home_continue_failed, resume)
            episodeRail("nextUp", R.string.browse_next_up, R.string.home_next_up_failed, nextUp)
            when (val state = libraries.state) {
                Load.Loading -> item(key = "shelves-loading") { RailSkeleton(null, RailArt.Poster) }
                is Load.Failed -> item(key = "shelves-failed") {
                    Notice(stringResource(R.string.home_load_failed), state.message, libraries::reload, retrying = libraries.refreshing)
                }
                is Load.Ready -> state.value.forEach { library ->
                    item(key = "shelf-${library.id}") { LibraryShelf(library, staleShelves) }
                }
            }
        }
        StatusBarScrim(listState)
    }
}

/**
 * Continue watching or Next up. Loading and empty show nothing: an empty
 * one is the usual case for someone not in the middle of anything, and a
 * placeholder there would only fold away. A failed one says so.
 */
private fun LazyListScope.episodeRail(key: String, @StringRes title: Int, @StringRes failed: Int, loader: Loader<List<MediaItem>>) {
    when (val rail = railState(loader.state)) {
        RailState.Loading, RailState.Empty -> Unit
        is RailState.Failed -> item(key = key) {
            RailFailure(stringResource(title), stringResource(failed), rail.message, loader::reload, retrying = loader.refreshing)
        }
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

/** A library's newest titles. One whose refresh failed puts itself in [stale] while it's on screen. */
@Composable
private fun LibraryShelf(library: Library, stale: MutableMap<String, Loader<*>>) {
    val nav = LocalNavigator.current
    val entries = rememberLoader("shelf-${library.id}") { media.shelf(library.id, 12) }
    // Also when it scrolls back into view, once the last answer is old enough.
    RefreshOnResume(entries)
    val refreshFailed = entries.refreshError != null
    DisposableEffect(entries, refreshFailed) {
        if (refreshFailed) stale[library.id] = entries else stale.remove(library.id)
        onDispose { stale.remove(library.id) }
    }
    val title = stringResource(R.string.browse_recently_added, library.name)
    val onTitleClick = if (library.itemCount > 0) ({ nav.library(library.id, TitleSort.RECENT) }) else null
    when (val state = railState(entries.state)) {
        RailState.Loading -> RailSkeleton(title, RailArt.Poster, onTitleClick)
        is RailState.Failed -> RailFailure(
            title,
            stringResource(R.string.home_shelf_failed),
            state.message,
            entries::reload,
            retrying = entries.refreshing,
        )
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
        LucideIcon(Lucide.FolderPlus, null, size = 32.dp, tint = Palette.Muted)
        Gap(16.dp)
        Text(stringResource(R.string.browse_home_no_libraries), style = MaterialTheme.typography.titleMedium)
        Gap(4.dp)
        Text(
            stringResource(if (user.isAdmin) R.string.browse_home_no_libraries_admin else R.string.browse_home_no_libraries_user),
            style = MaterialTheme.typography.bodyMedium,
            color = Palette.Muted,
            textAlign = TextAlign.Center,
        )
    }
}
