package io.github.zekurio.matinee.ui.home

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import io.github.zekurio.matinee.api.FeaturedTitle
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
) {
    val all: List<Loader<*>> get() = listOf(libraries, resume, nextUp, featured)
}

/**
 * Home's loads: the libraries, Continue watching, Next up, and featured.
 * Continue watching and Next up are kept for offline Home as they come.
 * Back on Home, what's in progress may have moved on, here or on another
 * device, so those refresh on resume. Featured stays: it's picked at
 * random, so fetching it again would swap it under the person.
 */
@Composable
fun rememberHomeLoaders(): HomeLoaders {
    val libraries = rememberLoader("libraries") { libraries.list() }
    val resume = rememberLoader("continue") { home.continueWatching(limit = 20) }
    val nextUp = rememberLoader("nextUp") { home.nextUp(limit = 20).map { it.item } }
    val featured = rememberLoader("featured") { home.featured() }
    val context = LocalContext.current
    val snapshot = remember { HomeSnapshot(context) }
    LaunchedEffect(resume.state) { (resume.state as? Load.Ready)?.value?.let { list -> snapshot.saveResume(list.map { it.id }) } }
    LaunchedEffect(nextUp.state) { (nextUp.state as? Load.Ready)?.value?.let { list -> snapshot.saveNextUp(list.map { it.id }) } }
    RefreshOnResume(libraries, resume, nextUp)
    return remember(libraries, resume, nextUp, featured) { HomeLoaders(libraries, resume, nextUp, featured) }
}

/** A library's newest titles, refreshed when Home comes back or the shelf scrolls back into view. */
@Composable
fun rememberShelf(library: Library): Loader<List<ShelfEntry>> {
    val entries = rememberLoader("shelf-${library.id}") { media.shelf(library.id, 12) }
    RefreshOnResume(entries)
    return entries
}
