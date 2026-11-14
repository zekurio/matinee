package io.github.zekurio.matinee.ui.tv

import android.content.res.Resources
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.Season
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.api.TitleSummary
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.formatRating
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.home.FocusedItem

/**
 * What a page's header says about a focused title, and its backdrop: the
 * year, whether it's a movie or a show when [kind] is asked for, as on a
 * page that has both, and its first genres.
 */
fun titleInfo(title: TitleSummary, api: MatineeApi, res: Resources, kind: Boolean = false): FocusedItem = FocusedItem(
    name = title.name,
    logo = title.images.logo,
    subtitle = null,
    facts = listOfNotNull(
        title.year?.toString(),
        if (kind) res.getString(if (title.kind == TitleKind.MOVIE) R.string.tv_kind_movie else R.string.tv_kind_show) else null,
        title.genres.take(2).joinToString(", ").ifEmpty { null },
    ),
    contentRating = title.contentRating,
    rating = title.rating,
    overview = title.overview,
    backdrop = listOfNotNull(api.art(title.images.backdrop, ArtworkSize.Large)),
)

/**
 * As [titleInfo], for a season of a show: the show's name with the
 * season's, how many episodes it has, and its overview, or the show's.
 */
fun seasonInfo(title: TitleSummary, season: Season, api: MatineeApi, res: Resources): FocusedItem = FocusedItem(
    name = res.getString(R.string.title_season_of, title.name, seasonName(season.number, res)),
    logo = null,
    subtitle = null,
    facts = listOf(res.getQuantityString(R.plurals.media_episode_count, season.itemCount, season.itemCount)),
    contentRating = title.contentRating,
    rating = title.rating,
    overview = season.overview ?: title.overview,
    backdrop = listOfNotNull(api.art(title.images.backdrop, ArtworkSize.Large)),
)

/** Height of a [TvFocusLine], kept when nothing has focus so what's under it doesn't move. */
val TvFocusLineHeight = 30.dp

/**
 * The focused card's name and facts on one line, for a grid's header, so
 * the cards themselves stay pictures. Empty while nothing has focus.
 */
@Composable
fun TvFocusLine(item: FocusedItem?, modifier: Modifier = Modifier) {
    val color = Palette.Foreground.copy(alpha = 0.8f)
    Row(
        modifier.height(TvFocusLineHeight),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (item == null) return@Row
        Text(
            item.name,
            style = TvType.Title,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        if (item.facts.isNotEmpty()) Text(item.facts.joinToString("  ·  "), style = TvType.Facts, color = color, maxLines = 1)
        item.contentRating?.let {
            Text(
                it,
                style = TvType.Caption,
                color = color,
                maxLines = 1,
                modifier = Modifier
                    .border(1.dp, Palette.Foreground.copy(alpha = 0.4f), RoundedCornerShape(4.dp))
                    .padding(horizontal = 8.dp, vertical = 1.dp),
            )
        }
        item.rating?.let {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                LucideIcon(Lucide.Star, stringResource(R.string.media_hero_rated), size = 16.dp, tint = Palette.Star)
                Text(formatRating(it), style = TvType.Facts, color = color)
            }
        }
    }
}
