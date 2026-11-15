package io.github.zekurio.matinee.ui.home

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import io.github.zekurio.matinee.api.FeaturedTitle
import io.github.zekurio.matinee.api.HomeRecommendations
import io.github.zekurio.matinee.api.Library
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.ShelfEntry
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.RefreshOnResume
import io.github.zekurio.matinee.ui.rememberLoader

/** What Home loads, for the phone's Home and the TV's alike. */
class HomeLoaders(
    val libraries: Loader<List<Library>>,
    val resume: Loader<List<MediaItem>>,
    val nextUp: Loader<List<MediaItem>>,
    val featured: Loader<List<FeaturedTitle>>,
    val recommendations: Loader<HomeRecommendations>,
) {
    val all: List<Loader<*>> get() = listOf(libraries, resume, nextUp, featured, recommendations)
}

/**
 * Home's loads: the libraries, Continue watching, Next up, featured, and
 * the recommendation rows. Continue watching and Next up are kept for
 * offline Home as they come. Back on Home, what's in progress may have
 * moved on, here or on another device, so those refresh on resume, and
 * the recommendations once they're old. Featured stays: it's picked at
 * random, so fetching it again would swap it under the person. Home
 * leaves out what failed, though, so a failed one tries again on return,
 * whichever it is.
 */
@Composable
fun rememberHomeLoaders(): HomeLoaders {
    val libraries = rememberLoader("libraries") { libraries.list() }
    val resume = rememberLoader("continue") { home.continueWatching(limit = 20) }
    val nextUp = rememberLoader("nextUp") { home.nextUp(limit = 20).map { it.item } }
    val featured = rememberLoader("featured") { home.featured() }
    val recommendations = rememberLoader("recommendations") { recommendations.home() }
    val context = LocalContext.current
    val snapshot = remember { HomeSnapshot(context) }
    LaunchedEffect(resume.state) { (resume.state as? Load.Ready)?.value?.let { list -> snapshot.saveResume(list.map { it.id }) } }
    LaunchedEffect(nextUp.state) { (nextUp.state as? Load.Ready)?.value?.let { list -> snapshot.saveNextUp(list.map { it.id }) } }
    RefreshOnResume(libraries, resume, nextUp)
    // They change only when the server works them out again, which takes a while.
    RefreshOnResume(recommendations, maxAgeMs = 10 * 60_000L)
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        listOf(featured, recommendations).forEach { if (it.state is Load.Failed) it.refreshIfStale() }
    }
    return remember(libraries, resume, nextUp, featured, recommendations) {
        HomeLoaders(libraries, resume, nextUp, featured, recommendations)
    }
}

/** A library's newest titles, refreshed when Home comes back or the shelf scrolls back into view. */
@Composable
fun rememberShelf(library: Library): Loader<List<ShelfEntry>> {
    val entries = rememberLoader("shelf-${library.id}") { media.shelf(library.id, 12) }
    RefreshOnResume(entries)
    return entries
}
