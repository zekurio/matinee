package io.github.zekurio.matinee.ui.home

import android.content.res.Resources
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalResources
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.HomeRecommendationRail
import io.github.zekurio.matinee.api.HomeRecommendations
import io.github.zekurio.matinee.api.RecommendationRailId
import io.github.zekurio.matinee.api.RecommendationReason
import io.github.zekurio.matinee.api.RecommendedTitle
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.components.PosterCard
import io.github.zekurio.matinee.ui.components.Rail
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.requests.key

/*
 * Home's recommendation rows, of titles on the server the viewer hasn't
 * watched, as the server works them out: "Recommended for you", then a
 * row or two of what's like something they watched. A long press on a
 * card offers "Not interested".
 */

/** "Recommended for you", or "Because you watched Dune". */
fun recommendationRailName(id: String, seedName: String?, res: Resources): String = when (id) {
    RecommendationRailId.BECAUSE_WATCHED -> res.getString(R.string.web_discover_rail_becauseWatched, seedName.orEmpty())
    else -> res.getString(R.string.web_discover_rail_forYou)
}

/** Why a title is recommended. */
fun reasonLine(reason: RecommendationReason?, res: Resources): String = when (reason?.kind) {
    "watched" -> res.getString(R.string.web_discover_reason_watched, reason.name.orEmpty())
    "person" -> res.getString(R.string.web_discover_reason_person, reason.name.orEmpty())
    else -> res.getString(R.string.web_discover_reason_taste)
}

/** Tells rows apart: there can be several "Because you watched". */
fun recommendationRailKey(rail: HomeRecommendationRail): String =
    rail.seed?.let { "${rail.id}:${it.ref.key}" } ?: rail.id

/** The rows' titles without those marked "Not interested" since the answer came. */
fun visibleItems(rail: HomeRecommendationRail, hidden: Collection<String>): List<RecommendedTitle> =
    rail.items.filter { it.ref.key !in hidden }

/**
 * The rows, once loaded. Loading, failing, and having none show nothing:
 * a new account has none, and a placeholder would only fold away. A row
 * whose every title is in [hidden] is left out as an item, not drawn as an
 * empty one, which would still take the list's gap on both sides.
 */
fun LazyListScope.recommendationRails(loader: Loader<HomeRecommendations>, hidden: Collection<String>) {
    val rails = (loader.state as? Load.Ready)?.value?.rails.orEmpty()
    rails.forEach { rail ->
        val shown = visibleItems(rail, hidden)
        if (shown.isEmpty()) return@forEach
        item(key = "recommended-${recommendationRailKey(rail)}") {
            val res = LocalResources.current
            Rail(recommendationRailName(rail.id, rail.seed?.name, res)) {
                items(shown, key = { it.title.id }) { item ->
                    PosterCard(
                        item.title,
                        item.title.year?.toString(),
                        Modifier.width(railItemWidth(RailArt.Poster)),
                        recommended = item.ref,
                    )
                }
            }
        }
    }
}
