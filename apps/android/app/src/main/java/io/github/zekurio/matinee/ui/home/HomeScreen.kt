package io.github.zekurio.matinee.ui.home

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
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.Library
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.TitleSort
import io.github.zekurio.matinee.ui.AppHeader
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.StatusBarScrim
import io.github.zekurio.matinee.ui.tabBarPadding
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
import io.github.zekurio.matinee.ui.theme.Palette

@Composable
fun HomeScreen() {
    val libraries = rememberLoader("libraries") { libraries() }
    val resume = rememberLoader("continue") { continueWatching() }
    val nextUp = rememberLoader("nextUp") { nextUp() }
    val featured = rememberLoader("featured") { featured() }
    val config = LocalConfiguration.current
    // On a phone, short enough that two rows of stills, captions and all,
    // fit under it above the bottom bar: 328dp of a 20:9 phone's 952. Under
    // 320dp its title and buttons would reach the header. Tablets and
    // TVs keep a tall banner.
    val heroHeight = if (isWide()) maxOf(config.screenHeightDp * 0.68f, 460f).dp
    else (config.screenHeightDp * 0.345f).coerceIn(320f, 400f).dp

    val libs = (libraries.state as? Load.Ready)?.value
    val failed = libraries.state as? Load.Failed
    if (failed != null) {
        Column(Modifier.fillMaxSize()) {
            AppHeader()
            ErrorBox(stringResource(R.string.home_load_failed), failed.message, libraries::reload)
        }
        return
    }

    val listState = rememberLazyListState()
    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            state = listState,
            contentPadding = PaddingValues(bottom = tabBarPadding() + 24.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            item(key = "hero") {
                val slides = (featured.state as? Load.Ready)?.value
                val top: @Composable () -> Unit = { AppHeader() }
                when {
                    slides == null && featured.state is Load.Loading -> HeroSkeleton(Modifier.height(heroHeight), top)
                    !slides.isNullOrEmpty() -> Hero(slides, Modifier.height(heroHeight), top)
                    else -> Column { top() }
                }
            }

            if (libs?.isEmpty() == true) {
                item(key = "empty") { NoLibraries() }
                return@LazyColumn
            }

            (resume.state as? Load.Ready)?.value?.takeIf { it.isNotEmpty() }?.let { items ->
                item(key = "continue") { EpisodeRail(stringResource(R.string.browse_continue_watching), items) }
            }
            (nextUp.state as? Load.Ready)?.value?.takeIf { it.isNotEmpty() }?.let { items ->
                item(key = "nextUp") { EpisodeRail(stringResource(R.string.browse_next_up), items) }
            }
            libs?.forEach { library ->
                item(key = "shelf-${library.id}") { LibraryShelf(library) }
            }
        }
        StatusBarScrim(listState)
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

@Composable
private fun LibraryShelf(library: Library) {
    val nav = LocalNavigator.current
    val entries = rememberLoader("shelf-${library.id}") { shelf(library.id, 12) }
    val list = (entries.state as? Load.Ready)?.value ?: return
    Rail(
        stringResource(R.string.browse_recently_added, library.name),
        onTitleClick = if (library.itemCount > 0) ({ nav.library(library.id, TitleSort.RECENT) }) else null,
    ) {
        if (list.isEmpty()) {
            item {
                Text(
                    stringResource(R.string.browse_empty_shelf),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Palette.Muted,
                    modifier = Modifier.padding(vertical = 24.dp),
                )
            }
        }
        items(list, key = { it.title.id }) { entry ->
            ShelfCard(entry, Modifier.width(railItemWidth(RailArt.Poster)))
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
