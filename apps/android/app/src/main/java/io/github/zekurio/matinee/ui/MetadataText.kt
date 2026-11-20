package io.github.zekurio.matinee.ui

import android.content.res.Resources
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.res.stringResource
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ClientAgent
import io.github.zekurio.matinee.api.TitleStatus

/*
 * The server's words for what metadata providers name in their own: genre
 * keys, title statuses, and a client's browser and system, in the app's
 * language. The messages are the web's, from strings_web_metadata.xml.
 */

/** A genre key's message, or null for a provider's own name the server has no key for. */
@StringRes
private fun genreRes(genre: String): Int? = when (genre) {
    "action" -> R.string.web_metadata_genre_action
    "adventure" -> R.string.web_metadata_genre_adventure
    "animation" -> R.string.web_metadata_genre_animation
    "anime" -> R.string.web_metadata_genre_anime
    "awards-show" -> R.string.web_metadata_genre_awards_show
    "children" -> R.string.web_metadata_genre_children
    "comedy" -> R.string.web_metadata_genre_comedy
    "crime" -> R.string.web_metadata_genre_crime
    "documentary" -> R.string.web_metadata_genre_documentary
    "drama" -> R.string.web_metadata_genre_drama
    "eastern" -> R.string.web_metadata_genre_eastern
    "family" -> R.string.web_metadata_genre_family
    "fantasy" -> R.string.web_metadata_genre_fantasy
    "food" -> R.string.web_metadata_genre_food
    "game-show" -> R.string.web_metadata_genre_game_show
    "history" -> R.string.web_metadata_genre_history
    "home-and-garden" -> R.string.web_metadata_genre_home_and_garden
    "horror" -> R.string.web_metadata_genre_horror
    "indie" -> R.string.web_metadata_genre_indie
    "martial-arts" -> R.string.web_metadata_genre_martial_arts
    "mini-series" -> R.string.web_metadata_genre_mini_series
    "music" -> R.string.web_metadata_genre_music
    "musical" -> R.string.web_metadata_genre_musical
    "mystery" -> R.string.web_metadata_genre_mystery
    "news" -> R.string.web_metadata_genre_news
    "podcast" -> R.string.web_metadata_genre_podcast
    "politics" -> R.string.web_metadata_genre_politics
    "reality" -> R.string.web_metadata_genre_reality
    "romance" -> R.string.web_metadata_genre_romance
    "science-fiction" -> R.string.web_metadata_genre_science_fiction
    "soap" -> R.string.web_metadata_genre_soap
    "special-interest" -> R.string.web_metadata_genre_special_interest
    "sport" -> R.string.web_metadata_genre_sport
    "suspense" -> R.string.web_metadata_genre_suspense
    "talk-show" -> R.string.web_metadata_genre_talk_show
    "thriller" -> R.string.web_metadata_genre_thriller
    "travel" -> R.string.web_metadata_genre_travel
    "tv-movie" -> R.string.web_metadata_genre_tv_movie
    "war" -> R.string.web_metadata_genre_war
    "western" -> R.string.web_metadata_genre_western
    else -> null
}

/** A genre's name: a key's in the app's language, or the provider's own. */
fun genreName(genre: String, res: Resources): String = genreRes(genre)?.let(res::getString) ?: genre

@Composable
@ReadOnlyComposable
fun genreName(genre: String): String = genreRes(genre)?.let { stringResource(it) } ?: genre

/** Genres in the app language's alphabetical order. */
fun <T> byGenreName(list: List<T>, res: Resources, genre: (T) -> String): List<T> =
    list.sortedBy { genreName(genre(it), res).lowercase() }

/** The genre keys whose names in the app's language contain [query], comma separated, for the search to send. */
fun genresNamed(query: String, res: Resources): String? {
    val wanted = query.trim().lowercase()
    if (wanted.isEmpty()) return null
    return GENRE_KEYS.filter { genreName(it, res).lowercase().contains(wanted) }.joinToString(",").ifEmpty { null }
}

private val GENRE_KEYS = listOf(
    "action",
    "adventure",
    "animation",
    "anime",
    "awards-show",
    "children",
    "comedy",
    "crime",
    "documentary",
    "drama",
    "eastern",
    "family",
    "fantasy",
    "food",
    "game-show",
    "history",
    "home-and-garden",
    "horror",
    "indie",
    "martial-arts",
    "mini-series",
    "music",
    "musical",
    "mystery",
    "news",
    "podcast",
    "politics",
    "reality",
    "romance",
    "science-fiction",
    "soap",
    "special-interest",
    "sport",
    "suspense",
    "talk-show",
    "thriller",
    "travel",
    "tv-movie",
    "war",
    "western",
)

/** A title's status in the app's language; null for one this app doesn't know. */
fun titleStatusName(status: String?, res: Resources): String? = when (status) {
    TitleStatus.CONTINUING -> R.string.web_metadata_status_continuing
    TitleStatus.ENDED -> R.string.web_metadata_status_ended
    TitleStatus.CANCELED -> R.string.web_metadata_status_canceled
    TitleStatus.UPCOMING -> R.string.web_metadata_status_upcoming
    TitleStatus.IN_PRODUCTION -> R.string.web_metadata_status_in_production
    TitleStatus.PILOT -> R.string.web_metadata_status_pilot
    TitleStatus.RELEASED -> R.string.web_metadata_status_released
    else -> null
}?.let(res::getString)

/** Like "Firefox on Linux", or whichever of the two is known. */
fun clientName(client: ClientAgent, res: Resources): String? {
    val browser = client.browser
    val system = client.system
    return if (browser != null && system != null) res.getString(R.string.web_metadata_client, browser, system) else browser ?: system
}
