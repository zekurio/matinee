package io.github.zekurio.matinee.ui.requests

import android.content.res.Resources
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.CatalogInput
import io.github.zekurio.matinee.api.CatalogFilters
import io.github.zekurio.matinee.api.DiscoverRow
import io.github.zekurio.matinee.api.MatineeJson
import io.github.zekurio.matinee.api.CatalogTitleSummary
import io.github.zekurio.matinee.api.DiscoverRail
import io.github.zekurio.matinee.api.DiscoverRailId
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.components.ErrorState
import io.github.zekurio.matinee.ui.components.LocalActions
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.components.RailFailed
import io.github.zekurio.matinee.ui.components.Rail
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.Sheet
import io.github.zekurio.matinee.ui.kit.SheetHeader
import io.github.zekurio.matinee.ui.kit.SheetItem
import io.github.zekurio.matinee.ui.kit.rememberSheetCloser
import io.github.zekurio.matinee.ui.kit.rememberSheetState
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.theme.Palette

/*
 * Discover, for when there's nothing in mind yet: on a phone, rows of
 * titles under the search field until something's typed, as the web's
 * phone has them. Each row but "Because you watched" is the start of a
 * browse, which its heading opens with the row's filters and sort.
 * Nothing of it shows when the server says Discover is off.
 */

/** How many cards a row shows. Its heading leads to the rest. */
private const val RAIL_CARDS = 20

/** "Popular movies", or "Because you watched Dune". */
fun railName(rail: DiscoverRail, res: Resources): String = when (rail.id) {
    "popularFilms" -> res.getString(R.string.web_discover_rail_popularFilms)
    "popularShows" -> res.getString(R.string.web_discover_rail_popularShows)
    "forYou" -> res.getString(R.string.web_discover_rail_forYou)
    "becauseWatched" -> res.getString(R.string.web_discover_rail_becauseWatched, rail.seed?.name.orEmpty())
    else -> res.getString(R.string.web_discover_rail_comingSoon)
}

/** Tells rows apart, for keys and the row's own screen: there can be several "Because you watched". */
fun railKey(rail: DiscoverRail): String = rail.seed?.let { "${rail.id}:${it.ref.key}" } ?: rail.id

/** Whether the row holds the viewer's recommendations, whose cards offer "Not interested". */
private fun recommended(rail: DiscoverRail) = rail.id == DiscoverRailId.FOR_YOU || rail.id == DiscoverRailId.BECAUSE_WATCHED

/** Whether Discover is on for this viewer and its rows, kept by the search tab. */
@Composable
fun rememberDiscover(): Loader<io.github.zekurio.matinee.api.DiscoverRails> = rememberLoader("discover-rails") { discover.rails() }

/**
 * Discover's rows in the order the server sends them, each loading on its
 * own, for the search tab's list. Rows whose titles are all here already
 * leave nothing to show and stay out. One that failed says so in its place.
 */
fun LazyListScope.discoverRails(rails: List<DiscoverRail>, pages: Map<String, Loader<DiscoverRow>>) {
    rails.forEach { rail ->
        val page = pages[railKey(rail)] ?: return@forEach
        item(key = "discover-${railKey(rail)}") { DiscoverRailRow(rail, page) }
    }
}

/** The first page of each of [rails], kept while the search tab is. */
@Composable
fun rememberRailPages(rails: List<DiscoverRail>): Map<String, Loader<DiscoverRow>> =
    rails.associate { rail -> railKey(rail) to rememberLoader("discover-${railKey(rail)}") { discover.row(rail.id, rail.seed) } }

/** Follows the titles the rows show, once each, under the stream's hundred. Library cards play, so only the rest. */
@Composable
fun FollowRails(pages: Collection<Loader<DiscoverRow>>) {
    val refs = pages.flatMap { (it.state as? Load.Ready)?.value?.items?.take(RAIL_CARDS).orEmpty() }
        .filter { it.title == null }
        .map { CatalogInput(it.ref) }
    FollowTitles(refs)
}

@Composable
private fun DiscoverRailRow(rail: DiscoverRail, page: Loader<DiscoverRow>) {
    val nav = LocalNavigator.current
    val res = LocalResources.current
    val title = railName(rail, res)
    when (val state = page.state) {
        Load.Loading -> io.github.zekurio.matinee.ui.home.RailSkeleton(title, RailArt.Poster)
        is Load.Failed -> RailFailed(title, page::reload, page.refreshing, state.disconnected)
        is Load.Ready -> {
            val hidden = LocalActions.current.hidden
            val items = state.value.items.filter { !recommended(rail) || it.ref.key !in hidden }.take(RAIL_CARDS)
            if (items.isEmpty()) return
            // The heading opens the row's browse, of its first kind, as the web's does. A row without one has none.
            val browse = rail.browse
            Rail(
                title,
                onTitleClick = browse?.let {
                    {
                        nav.catalogBrowse(
                            it.kinds.firstOrNull() ?: TitleKind.MOVIE,
                            MatineeJson.encodeToString(CatalogFilters.serializer(), it.filters),
                            it.sort,
                        )
                    }
                },
            ) {
                items(items, key = { it.ref.key }) { item ->
                    BrowseCard(
                        item,
                        // Without a date or a score to say, the year and the kind, since a row can hold both.
                        state.value.detail?.let { browseDetail(it, item, res) },
                        recommended(rail),
                        Modifier.width(railItemWidth(RailArt.Poster)),
                    )
                }
            }
        }
    }
}

/** The sheet a recommended title's long press opens, with "Not interested". The app's root holds it. */
@Composable
fun NotInterestedSheet(item: CatalogTitleSummary, onDismiss: () -> Unit) {
    val api = LocalApi.current
    val actions = LocalActions.current
    val snackbar = LocalSnackbar.current
    val sheet = rememberSheetState()
    val close = rememberSheetCloser(sheet, onDismiss)
    val done = stringResource(R.string.web_discover_dismissed, item.name)
    val failure = stringResource(R.string.web_discover_dismissFailed, item.name)
    Sheet(onDismissRequest = onDismiss, state = sheet) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 12.dp)) {
            SheetHeader(item.name, item.year?.toString())
            SheetItem(Lucide.EyeOff, stringResource(R.string.web_discover_notInterested)) {
                close { actions.hideRecommendation(api, snackbar, item.ref, done, failure) }
            }
        }
    }
}

/** Discover's whole answer couldn't be had: the catalog is down and nothing was kept. */
@Composable
fun DiscoverFailed(modifier: Modifier = Modifier, onHome: (() -> Unit)? = null, onRetry: () -> Unit) {
    ErrorState(
        stringResource(R.string.discover_failed),
        stringResource(R.string.web_discover_failedHint),
        onRetry,
        modifier,
        icon = Lucide.CloudOff,
        onHome = onHome,
    )
}

/** Every row came back without a title this viewer lacks. */
@Composable
fun DiscoverNothing() {
    Column(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        LucideIcon(Lucide.Compass, null, size = 28.dp, tint = Palette.Muted)
        Gap(12.dp)
        Text(stringResource(R.string.web_discover_empty), style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Gap(4.dp)
        Text(stringResource(R.string.web_discover_emptyHint), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted, textAlign = TextAlign.Center)
    }
}
