package io.github.zekurio.matinee.ui.tv.home

import android.content.res.Resources
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.Artwork
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.FeaturedTitle
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.ShelfEntry
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.isShow
import io.github.zekurio.matinee.ui.components.ImageSource
import io.github.zekurio.matinee.ui.components.ShelfCardModel
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.frame
import io.github.zekurio.matinee.ui.formatRuntime
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.runtimeMinutes
import io.github.zekurio.matinee.ui.timeLeft

/**
 * What Home's header says about the focused card, and the backdrop behind
 * it: the facts the phone's Home shows for the same item.
 */
class FocusedItem(
    val name: String,
    /** The title's logo, a show's for an episode, shown in place of [name]. */
    val logo: Artwork?,
    /** The episode, or what a show got last. */
    val subtitle: String?,
    val facts: List<String>,
    val contentRating: String?,
    val rating: Double?,
    val overview: String?,
    val backdrop: List<ImageSource>,
)

/** The art behind a file, best first, as the phone's banner has it. */
private fun backdropOf(api: MatineeApi, item: MediaItem, backdrop: Artwork?): List<ImageSource> = listOfNotNull(
    api.art(backdrop, ArtworkSize.Large),
    api.art(item.episode?.still, ArtworkSize.Large),
    api.frame(item.id, large = true),
)

fun featuredInfo(slide: FeaturedTitle, api: MatineeApi, res: Resources): FocusedItem {
    val (title, item, count) = slide
    return FocusedItem(
        name = title.name,
        logo = title.images.logo,
        subtitle = null,
        facts = listOfNotNull(
            title.year?.toString(),
            if (title.isShow && count > 1) res.getQuantityString(R.plurals.media_episode_count, count, count) else null,
            timeLeft(item, res),
        ),
        contentRating = title.contentRating,
        rating = title.rating,
        overview = title.overview,
        backdrop = backdropOf(api, item, title.images.backdrop),
    )
}

/** A file in Continue watching or Next up. */
fun itemInfo(item: MediaItem, api: MatineeApi, res: Resources): FocusedItem {
    val label = itemLabel(item, res)
    val code = io.github.zekurio.matinee.ui.episodeCode(item, res)
    val left = if (item.progress?.completed == false) timeLeft(item, res) else null
    return FocusedItem(
        name = label.showName,
        logo = item.title?.images?.logo,
        subtitle = if (code != null) res.getString(R.string.media_code_title, code, label.title) else null,
        facts = listOfNotNull(label.year, formatRuntime(runtimeMinutes(item), res), left),
        contentRating = item.title?.contentRating,
        rating = item.title?.rating,
        overview = item.episode?.overview ?: item.title?.overview,
        backdrop = backdropOf(api, item, item.title?.images?.backdrop),
    )
}

/** A title on a library's shelf, with what its card says. */
fun shelfInfo(entry: ShelfEntry, card: ShelfCardModel, api: MatineeApi, res: Resources): FocusedItem {
    val title = entry.title
    val movie = title.kind == TitleKind.MOVIE
    return FocusedItem(
        name = title.name,
        logo = title.images.logo,
        subtitle = if (movie) null else card.detail,
        facts = listOfNotNull(
            title.year?.toString(),
            if (movie) formatRuntime(runtimeMinutes(entry.item), res) else null,
        ),
        contentRating = title.contentRating,
        rating = title.rating,
        overview = title.overview,
        backdrop = listOfNotNull(api.art(title.images.backdrop, ArtworkSize.Large), api.frame(entry.item.id, large = true)),
    )
}
