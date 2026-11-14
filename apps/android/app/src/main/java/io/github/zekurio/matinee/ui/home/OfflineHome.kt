package io.github.zekurio.matinee.ui.home

import android.content.Context
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
import androidx.core.content.edit
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
import io.github.zekurio.matinee.ui.components.ProgressBar
import io.github.zekurio.matinee.ui.components.Rail
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.WatchedBadge
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
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

/** The files in Home's Continue watching and Next up as the server last sent them, by id, in order. */
internal data class ServedRows(val resume: List<String> = emptyList(), val nextUp: List<String> = emptyList())

/**
 * Keeps [ServedRows] across restarts: online Home saves what the server
 * sent, offline Home reads it, so the two rows don't change just because
 * the server is out of reach.
 */
class HomeSnapshot(context: Context) {
    private val prefs = context.getSharedPreferences("home_snapshot", Context.MODE_PRIVATE)

    internal fun read() = ServedRows(
        resume = prefs.getString(RESUME, null)?.split(SEPARATOR)?.filter { it.isNotEmpty() }.orEmpty(),
        nextUp = prefs.getString(NEXT_UP, null)?.split(SEPARATOR)?.filter { it.isNotEmpty() }.orEmpty(),
    )

    fun saveResume(ids: List<String>) = prefs.edit { putString(RESUME, ids.joinToString(SEPARATOR)) }

    fun saveNextUp(ids: List<String>) = prefs.edit { putString(NEXT_UP, ids.joinToString(SEPARATOR)) }

    private companion object {
        const val RESUME = "resume"
        const val NEXT_UP = "next_up"
        const val SEPARATOR = ","
    }
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
 * whether it's done.
 *
 * Continue watching and Next up start as the server last had them online,
 * [served], in its order, so they read as they did; of those, what's on
 * the phone and still fits. Then what was started offline since, newest
 * first, and for a show with an episode watched or started, the first
 * downloaded one after it that isn't. Then every movie, and every show,
 * newest first.
 */
internal fun offlineHomeRows(
    entries: Collection<OfflineItem>,
    place: (OfflineItem) -> Place?,
    watched: (OfflineItem) -> Boolean,
    served: ServedRows = ServedRows(),
): OfflineHomeRows {
    val done = entries.filter { it.state == DownloadState.DONE }.sortedByDescending { it.addedAt }
    val started = { entry: OfflineItem -> !watched(entry) && (place(entry)?.positionSeconds ?: 0.0) > 0.0 }
    val byId = done.associateBy { it.id }
    // What the server had, still unfinished, then what was started offline since.
    val resume = (served.resume.mapNotNull(byId::get).filterNot(watched) + done.filter(started)).distinctBy { it.id }
    val isShow = { entry: OfflineItem -> entry.item.title?.kind == TitleKind.SHOW && entry.item.title != null }
    val shows = done.filter(isShow).groupBy { it.item.title!!.id }.map { (_, files) ->
        OfflineShow(
            files.first().item.title!!,
            files.sortedWith(compareBy({ seasonOrder(it.item.seasonNumber) }, { it.item.episodeNumber ?: Int.MAX_VALUE })),
        )
    }.sortedByDescending { it.newest.addedAt }
    val worked = shows.mapNotNull { show ->
        val last = show.episodes.indexOfLast { watched(it) || started(it) }
        if (last < 0) return@mapNotNull null
        show.episodes.drop(last + 1).firstOrNull { !watched(it) && !started(it) }
    }
    // The server's picks not begun since, then the ones worked out here, each once and not twice with Continue watching.
    val resumed = resume.map { it.id }.toSet()
    val nextUp = (served.nextUp.mapNotNull(byId::get).filter { !watched(it) && !started(it) } + worked)
        .distinctBy { it.id }
        .filterNot { it.id in resumed }
        // One per show, the first in line, as the server's own list has it.
        .distinctBy { it.item.title?.id ?: it.id }
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
    val snapshot = remember { HomeSnapshot(context) }
    val rows = remember(items, seen) { offlineHomeRows(items.values, placeOf, watchedOf, snapshot.read()) }
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
