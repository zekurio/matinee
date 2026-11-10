package io.github.zekurio.matinee.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import coil3.compose.AsyncImage
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.downloads.DownloadState
import io.github.zekurio.matinee.downloads.OfflineItem
import io.github.zekurio.matinee.ui.AppHeader
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.components.ArtFrame
import io.github.zekurio.matinee.ui.components.CardText
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.ProgressBar
import io.github.zekurio.matinee.ui.components.Rail
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.WatchedBadge
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.tabBarPadding
import io.github.zekurio.matinee.ui.theme.Palette
import java.io.File

/** Where the person got to in a file: seconds in, of how many if known. */
internal data class Place(val positionSeconds: Double, val durationSeconds: Double?) {
    val ratio: Float? get() = durationSeconds?.takeIf { it > 0 }?.let { (positionSeconds / it).toFloat().coerceIn(0f, 1f) }
}

/** A downloaded show, its episodes in order. */
internal data class OfflineShow(val title: TitleSummary, val episodes: List<OfflineItem>) {
    val newest: OfflineItem get() = episodes.maxBy { it.addedAt }
}

/** Home without the server, as Findroid's offline home: what's downloaded, in the rows Home has online. */
internal data class OfflineHomeRows(
    val resume: List<OfflineItem>,
    val nextUp: List<OfflineItem>,
    val movies: List<OfflineItem>,
    val shows: List<OfflineShow>,
) {
    val isEmpty get() = movies.isEmpty() && shows.isEmpty()
}

/** Seasons in order, then the specials, then the files without a season, as on a show's page. */
private fun seasonOrder(number: Int?) = when (number) {
    null -> Int.MAX_VALUE
    0 -> Int.MAX_VALUE - 1
    else -> number
}

/**
 * Sorts the finished downloads into Home's rows. [place] is where the
 * person got to in a file, offline or as the server last said; [watched]
 * whether it's done. Started and not done is Continue watching, newest
 * first; a show with an episode watched or started offers the first
 * downloaded one after it that isn't, as Next up; then every movie, and
 * every show, newest first.
 */
internal fun offlineHomeRows(
    entries: Collection<OfflineItem>,
    place: (OfflineItem) -> Place?,
    watched: (OfflineItem) -> Boolean,
): OfflineHomeRows {
    val done = entries.filter { it.state == DownloadState.DONE }.sortedByDescending { it.addedAt }
    val started = { entry: OfflineItem -> !watched(entry) && (place(entry)?.positionSeconds ?: 0.0) > 0.0 }
    val resume = done.filter(started)
    val isShow = { entry: OfflineItem -> entry.item.title?.kind == TitleKind.SHOW && entry.item.title != null }
    val shows = done.filter(isShow).groupBy { it.item.title!!.id }.map { (_, files) ->
        OfflineShow(
            files.first().item.title!!,
            files.sortedWith(compareBy({ seasonOrder(it.item.seasonNumber) }, { it.item.episodeNumber ?: Int.MAX_VALUE })),
        )
    }.sortedByDescending { it.newest.addedAt }
    val nextUp = shows.mapNotNull { show ->
        val last = show.episodes.indexOfLast { watched(it) || started(it) }
        if (last < 0) return@mapNotNull null
        show.episodes.drop(last + 1).firstOrNull { !watched(it) && !started(it) }
    }
    return OfflineHomeRows(
        resume = resume,
        nextUp = nextUp,
        movies = done.filterNot(isShow),
        shows = shows,
    )
}

/**
 * Home in offline mode: the downloads in Home's rows, each playing from
 * the phone with a tap, a show opening its downloaded episodes. Comes back
 * up to date after the player, which may have moved a place on.
 */
@Composable
fun OfflineHomeScreen() {
    val context = LocalContext.current
    val downloads = context.app.downloads
    val viewer = context.app.viewer
    val items by downloads.store.items.collectAsState()
    // The player keeps places offline; back from it, read them again.
    var seen by remember { mutableIntStateOf(0) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { seen++ }
    val placeOf = { entry: OfflineItem ->
        downloads.pending.report(entry.id)?.let { Place(it.positionSeconds, it.durationSeconds ?: entry.item.durationSeconds) }
            ?: entry.item.progress?.let { Place(it.positionSeconds, entry.item.durationSeconds) }
    }
    // Watched as the server last said, or played nearly to the end offline.
    val watchedOf = { entry: OfflineItem ->
        viewer.isWatched(entry.item) || (downloads.pending.report(entry.id) != null && (placeOf(entry)?.ratio ?: 0f) >= 0.9f)
    }
    val rows = remember(items, seen) { offlineHomeRows(items.values, placeOf, watchedOf) }
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = tabBarPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(28.dp),
    ) {
        item(key = "header") { AppHeader() }
        if (rows.isEmpty) {
            item(key = "empty") { NothingDownloaded() }
            return@LazyColumn
        }
        offlineRail("resume", R.string.browse_continue_watching, rows.resume, placeOf, watchedOf)
        offlineRail("nextUp", R.string.browse_next_up, rows.nextUp, placeOf, watchedOf)
        offlineRail("movies", R.string.web_libraries_dialog_kind_movies, rows.movies, placeOf, watchedOf)
        if (rows.shows.isNotEmpty()) {
            item(key = "shows") {
                Rail(stringResource(R.string.web_libraries_dialog_kind_shows)) {
                    items(rows.shows, key = { it.title.id }) { show -> ShowCard(show) }
                }
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.offlineRail(
    key: String,
    title: Int,
    entries: List<OfflineItem>,
    placeOf: (OfflineItem) -> Place?,
    watchedOf: (OfflineItem) -> Boolean,
) {
    if (entries.isEmpty()) return
    item(key = key) {
        Rail(stringResource(title)) {
            items(entries, key = { it.id }) { entry -> FileCard(entry, placeOf(entry), watchedOf(entry)) }
        }
    }
}

/** A downloaded movie or episode, its saved picture, and how far in; a tap plays it from the phone. */
@Composable
private fun FileCard(entry: OfflineItem, place: Place?, watched: Boolean) {
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val label = itemLabel(entry.item, res)
    val code = episodeCode(entry.item, res)
    Column(Modifier.width(railItemWidth(RailArt.Landscape))) {
        Box(Modifier.clickable { nav.play(entry.id) }) {
            OfflineArt(entry, label.showName) {
                if (watched) WatchedBadge(Modifier.align(Alignment.TopEnd).padding(6.dp))
                else place?.ratio?.takeIf { it > 0f }?.let { ProgressBar(it, Modifier.align(Alignment.BottomCenter)) }
            }
        }
        CardText(
            label.showName,
            if (code != null) stringResource(R.string.media_code_title, code, label.title) else label.year,
        )
    }
}

/** A downloaded show, the newest episode's picture; a tap opens its downloaded episodes. */
@Composable
private fun ShowCard(show: OfflineShow) {
    val nav = LocalNavigator.current
    Column(Modifier.width(railItemWidth(RailArt.Landscape))) {
        Box(Modifier.clickable { nav.downloadsShow(show.title.id) }) { OfflineArt(show.newest, show.title.name) {} }
        CardText(show.title.name, pluralStringResource(R.plurals.media_episode_count, show.episodes.size, show.episodes.size))
    }
}

/** A download's saved picture, over the title's tone; a film icon when it has none. */
@Composable
private fun OfflineArt(entry: OfflineItem, toneKey: String, overlay: @Composable androidx.compose.foundation.layout.BoxScope.() -> Unit) {
    val downloads = LocalContext.current.app.downloads
    ArtFrame(toneKey, 16f / 9f) {
        LucideIcon(Lucide.Film, null, size = 20.dp, tint = Palette.Muted.copy(alpha = 0.4f))
        val image = entry.image?.let { File(downloads.store.root, it) }
        if (image != null && image.exists()) {
            AsyncImage(model = image, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
        overlay()
    }
}

/** Offline with nothing downloaded: what there would be, and where it comes from. */
@Composable
private fun NothingDownloaded() {
    Column(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        LucideIcon(Lucide.Download, null, size = 28.dp, tint = Palette.Muted)
        Gap(12.dp)
        Text(stringResource(R.string.downloads_empty), style = MaterialTheme.typography.titleMedium)
        Gap(4.dp)
        Text(stringResource(R.string.downloads_empty_hint), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
    }
}
