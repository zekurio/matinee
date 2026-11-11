package io.github.zekurio.matinee.ui.profile

import android.content.res.Resources
import android.text.format.DateFormat
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.Leaderboard
import io.github.zekurio.matinee.api.LeaderboardBoard
import io.github.zekurio.matinee.api.LeaderboardEntry
import io.github.zekurio.matinee.ui.Loader
import io.github.zekurio.matinee.ui.rememberLoader
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.roundToInt

/* What the statistics say and load, apart from how they're laid out, for the phone's profile and the TV's. */

/** "45 Min.", "3 Std. 20 Min.", "120 Std.", as the web's formatWatchTime. */
fun formatWatchTime(seconds: Double, res: Resources): String {
    val minutes = (seconds / 60).roundToInt()
    if (minutes < 60) return res.getString(R.string.format_minutes_short, minutes)
    val hours = minutes / 60
    val rest = minutes % 60
    return if (hours >= 100 || rest == 0) res.getString(R.string.format_hours_short, hours)
    else res.getString(R.string.format_hours_minutes_short, hours, rest)
}

@Composable
fun rangeName(range: String): String = stringResource(
    when (range) {
        "7d" -> R.string.stats_range_7d
        "30d" -> R.string.stats_range_30d
        "90d" -> R.string.stats_range_90d
        "365d" -> R.string.stats_range_365d
        else -> R.string.stats_range_all
    },
)

/** How a sentence ends for the range: "in the last 30 days". */
@Composable
fun rangePhrase(range: String): String = stringResource(
    when (range) {
        "7d" -> R.string.stats_period_7d
        "30d" -> R.string.stats_period_30d
        "90d" -> R.string.stats_period_90d
        "365d" -> R.string.stats_period_365d
        else -> R.string.stats_period_all
    },
)

/** "9. Nov.", "Woche vom 3. Nov.", "November 2026", for a bucket. */
fun bucketName(start: String, unit: String, res: Resources): String {
    val date = runCatching { LocalDate.parse(start) }.getOrNull() ?: return start
    val locale = Locale.getDefault()
    val thisYear = date.year == LocalDate.now().year
    fun format(skeleton: String) = DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, skeleton), locale).format(date)
    return when (unit) {
        "month" -> format("MMMMyyyy")
        "week" -> res.getString(R.string.stats_bucket_week, format(if (thisYear) "dMMM" else "dMMMyyyy"))
        else -> format(if (thisYear) "dMMM" else "dMMMyyyy")
    }
}

/** The top of the scale: whole minutes up to an hour, then hours, rounded up to a tidy number. */
fun scaleTop(seconds: Double): Double {
    fun nice(value: Double): Double {
        val steps = listOf(1.0, 2.0, 5.0, 10.0, 15.0, 20.0, 30.0, 45.0, 60.0)
        steps.firstOrNull { it >= value }?.let { return it }
        var magnitude = 10.0
        while (magnitude * 10 < value) magnitude *= 10
        return listOf(1.0, 2.0, 5.0, 10.0).map { it * magnitude }.first { it >= value }
    }
    val minutes = ceil(seconds / 60)
    return if (minutes <= 60) nice(maxOf(minutes, 1.0)) * 60 else nice(minutes / 60) * 3600
}

/** "18:00" or "6:00 PM", an hour in the device's way. */
fun hourName(hour: Int): String =
    DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(Locale.getDefault()).format(LocalTime.of(hour, 0))

/** A weekday's name, 1 being Monday, as the activity cells count them. */
fun weekdayName(weekday: Int, style: TextStyle): String = DayOfWeek.of(weekday).getDisplayName(style, Locale.getDefault())

/** A board's value as the leaderboard shows it: "4 Std.", "12 Wiedergaben", "3 Tage". */
fun metricValue(metric: String, value: Double, res: Resources): String {
    val count = value.toInt()
    return when (metric) {
        "watchTime" -> formatWatchTime(value, res)
        "plays" -> res.getQuantityString(R.plurals.stats_play_count, count, count)
        "currentStreak", "longestStreak" -> res.getQuantityString(R.plurals.stats_day_count, count, count)
        "movies" -> res.getQuantityString(R.plurals.stats_movie_count, count, count)
        "episodes" -> res.getQuantityString(R.plurals.stats_episode_count, count, count)
        else -> count.toString()
    }
}

@Composable
fun metricName(metric: String): String = stringResource(
    when (metric) {
        "plays" -> R.string.stats_metric_plays
        "currentStreak" -> R.string.stats_metric_currentStreak
        "longestStreak" -> R.string.stats_metric_longestStreak
        "movies" -> R.string.stats_metric_movies
        "episodes" -> R.string.stats_metric_episodes
        else -> R.string.stats_metric_watchTime
    },
)

/** The leaderboard for [range], each board's days counted in [zone]. */
@Composable
fun rememberLeaderboard(range: String, zone: String): Loader<Leaderboard> =
    rememberLoader("leaderboard-$range") { stats.leaderboard(range, zone) }

/** Where the user stands on a board: their place between the people just above and below them. */
data class BoardStanding(val board: LeaderboardBoard, val places: List<LeaderboardEntry>)

/** The user's standing on each board they're on, in the server's order. */
fun standings(leaderboard: Leaderboard?): List<BoardStanding> = leaderboard?.boards.orEmpty().mapNotNull { board ->
    val at = board.entries.indexOfFirst { it.self }
    if (at < 0) null else BoardStanding(board, board.entries.subList(maxOf(0, at - 1), minOf(board.entries.size, at + 2)))
}

/** Places shown at the top of a board; the viewer's neighborhood comes after. */
private const val TOP_PLACES = 10

/** Whether the place at [index] starts the viewer's neighborhood, apart from the top places, so it's set off. */
fun startsNeighborhood(board: LeaderboardBoard, index: Int): Boolean =
    index == TOP_PLACES && board.entries[index].rank > (board.entries.getOrNull(TOP_PLACES - 1)?.rank ?: 0) + 1
