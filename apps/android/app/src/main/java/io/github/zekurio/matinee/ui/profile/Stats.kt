package io.github.zekurio.matinee.ui.profile

import android.content.res.Resources
import android.text.format.DateFormat
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.material3.HorizontalDivider
import io.github.zekurio.matinee.ui.components.CardShape
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.STATS_RANGES
import io.github.zekurio.matinee.api.WatchStats
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.components.Chip
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.PosterArt
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.theme.Palette
import java.text.NumberFormat
import java.time.LocalDate
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.roundToInt

/* A profile's statistics, as the web's watch-stats: the range chips, the
 * headline figures, watch time per day, week, or month, the most watched
 * titles, and the genres. */

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

/** The ranges as chips, scrolling sideways past the page's edge. */
@Composable
fun RangeChips(current: String, onPick: (String) -> Unit) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Gutter),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        STATS_RANGES.forEach { range -> Chip(rangeName(range), range == current, { onPick(range) }) }
    }
}

/**
 * Plays and what was finished, a row each as Settings lists its rows: an
 * icon, what it counts, and the number at the end.
 */
@Composable
fun StatList(stats: WatchStats, modifier: Modifier = Modifier) {
    val count = remember { NumberFormat.getIntegerInstance() }
    val totals = stats.totals
    val rows = listOf(
        Triple(Lucide.PlayOutline, stringResource(R.string.stats_plays), totals.plays),
        Triple(Lucide.Film, stringResource(R.string.stats_movies_finished), totals.movies),
        Triple(Lucide.Tv, stringResource(R.string.stats_episodes_finished), totals.episodes),
        Triple(Lucide.TvPlay, stringResource(R.string.stats_shows_watched), totals.shows),
    )
    Column(modifier.fillMaxWidth().clip(CardShape).background(Palette.Card).border(1.dp, Palette.Border, CardShape)) {
        rows.forEachIndexed { index, (icon, label, value) ->
            if (index > 0) HorizontalDivider(color = Palette.Border)
            Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                LucideIcon(icon, null, size = 20.dp, tint = Palette.Muted)
                Gap(14.dp)
                Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                Text(count.format(value), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

/** "9. Nov.", "Woche vom 3. Nov.", "November 2026", for a bucket. */
private fun bucketName(start: String, unit: String, res: Resources): String {
    val date = runCatching { LocalDate.parse(start) }.getOrNull() ?: return start
    val locale = Locale.getDefault()
    val thisYear = date.year == LocalDate.now().year
    fun format(skeleton: String) = java.time.format.DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, skeleton), locale).format(date)
    return when (unit) {
        "month" -> format("MMMMyyyy")
        "week" -> res.getString(R.string.stats_bucket_week, format(if (thisYear) "dMMM" else "dMMMyyyy"))
        else -> format(if (thisYear) "dMMM" else "dMMMyyyy")
    }
}

/** The top of the scale: whole minutes up to an hour, then hours, rounded up to a tidy number. */
private fun scaleTop(seconds: Double): Double {
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

/**
 * The range's watch time as a card, as the web shows it: the total, big,
 * over watch time per day, week, or month as bars. Touching a bar reads
 * that day, week, or month out in the total's place.
 */
@Composable
fun WatchTimeCard(stats: WatchStats, modifier: Modifier = Modifier) {
    val res = LocalResources.current
    val buckets = stats.buckets
    var active by remember(stats) { mutableStateOf<Int?>(null) }
    val top = scaleTop(buckets.maxOfOrNull { it.watchSeconds } ?: 0.0)
    val shown = active?.let(buckets::getOrNull)
    val accent = Palette.Accent
    val baseline = Palette.Border
    Column(
        modifier.fillMaxWidth().clip(CardShape).background(Palette.Card).border(1.dp, Palette.Border, CardShape).padding(16.dp),
    ) {
        Text(
            shown?.let { bucketName(it.start, stats.unit, res) } ?: "${stringResource(R.string.stats_watch_time)} · ${rangeName(stats.range)}",
            style = MaterialTheme.typography.bodyMedium,
            color = Palette.Muted,
        )
        Text(formatWatchTime(shown?.watchSeconds ?: stats.totals.watchSeconds, res), style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
        if (buckets.isEmpty()) return@Column
        Gap(16.dp)
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(120.dp)
                .pointerInput(buckets) {
                    fun pick(x: Float) = ((x / size.width) * buckets.size).toInt().coerceIn(0, buckets.lastIndex)
                    awaitPointerEventScope {
                        while (true) {
                            val event = awaitPointerEvent()
                            val change = event.changes.firstOrNull() ?: continue
                            active = if (change.pressed) pick(change.position.x) else null
                        }
                    }
                },
        ) {
            // All time can hold hundreds of months, so the bars thin out to
            // lines rather than leave the chart; a baseline holds them up.
            val slot = size.width / buckets.size
            val gap = (slot * 0.25f).coerceAtMost(4.dp.toPx())
            val radius = CornerRadius(minOf(2.dp.toPx(), (slot - gap) / 2))
            drawLine(baseline, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx())
            buckets.forEachIndexed { index, bucket ->
                val x = index * slot + gap / 2
                val width = slot - gap
                if (bucket.watchSeconds > 0) {
                    val height = (bucket.watchSeconds / top * size.height).toFloat().coerceAtLeast(2.dp.toPx())
                    val color = if (active == null || active == index) accent else accent.copy(alpha = 0.45f)
                    drawRoundRect(color, Offset(x, size.height - height), Size(width, height), radius)
                }
            }
        }
    }
}

/**
 * The card statistics sit in: the app's card color with its rim, and the
 * section's name in small type at the top, as the watch time card has it.
 */
@Composable
private fun StatsCard(label: String?, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(modifier.fillMaxWidth().clip(CardShape).background(Palette.Card).border(1.dp, Palette.Border, CardShape)) {
        if (label != null) {
            Text(
                label,
                style = MaterialTheme.typography.bodyMedium,
                color = Palette.Muted,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 4.dp),
            )
        }
        content()
    }
}

/**
 * The most watched titles in a card, ranked: the poster, the name, how
 * often it was played, and its watch time at the end.
 */
@Composable
fun TopTitles(stats: WatchStats, modifier: Modifier = Modifier) {
    if (stats.titles.isEmpty()) return
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val res = LocalResources.current
    StatsCard(stringResource(R.string.stats_top), modifier) {
        stats.titles.forEachIndexed { index, entry ->
            if (index > 0) HorizontalDivider(Modifier.padding(start = 16.dp), color = Palette.Border)
            Row(
                Modifier.fillMaxWidth().clickable { nav.title(entry.title) }.padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "${index + 1}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = if (index < 3) Palette.Foreground else Palette.Muted,
                    modifier = Modifier.width(26.dp),
                )
                Box(Modifier.width(40.dp)) { PosterArt(entry.title.name, api.art(entry.title.images.poster)) }
                Gap(14.dp)
                Column(Modifier.weight(1f)) {
                    Text(entry.title.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        res.getQuantityString(R.plurals.stats_play_count, entry.plays, entry.plays),
                        style = MaterialTheme.typography.bodySmall,
                        color = Palette.Muted,
                    )
                }
                Gap(14.dp)
                Text(formatWatchTime(entry.watchSeconds, res), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

/**
 * Watch time per genre in a card. A title can have several genres, so
 * their times add up to more than the whole.
 */
@Composable
fun Genres(stats: WatchStats, modifier: Modifier = Modifier) {
    if (stats.genres.isEmpty()) return
    val nav = LocalNavigator.current
    val res = LocalResources.current
    StatsCard(stringResource(R.string.stats_genres), modifier) {
        stats.genres.forEachIndexed { index, genre ->
            if (index > 0) HorizontalDivider(Modifier.padding(start = 16.dp), color = Palette.Border)
            Row(
                Modifier.fillMaxWidth().clickable { nav.genre(genre.name) }.padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(genre.name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                Text(formatWatchTime(genre.watchSeconds, res), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
