package io.github.zekurio.matinee.ui.profile

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
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
import io.github.zekurio.matinee.api.StatsRange
import io.github.zekurio.matinee.api.WatchStats
import io.github.zekurio.matinee.api.name
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalOffline
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.PosterArt
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.kit.CardShape
import io.github.zekurio.matinee.ui.kit.Chip
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.Sheet
import io.github.zekurio.matinee.ui.kit.rememberSheetState
import io.github.zekurio.matinee.ui.theme.Palette
import java.text.NumberFormat

/* A profile's statistics, as the web's watch-stats: the range chips, the
 * headline figures, watch time per day, week, or month, the most watched
 * titles, and the genres. */

/** The ranges as chips, scrolling sideways past the page's edge. */
@Composable
fun RangeChips(current: String, onPick: (String) -> Unit) {
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = Gutter),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        StatsRange.all.forEach { range -> Chip(rangeName(range), range == current, { onPick(range) }) }
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
    // Offline, a title's page is the server's.
    val offline = LocalOffline.current
    StatsCard(stringResource(R.string.stats_top), modifier) {
        stats.titles.forEachIndexed { index, entry ->
            if (index > 0) HorizontalDivider(Modifier.padding(start = 16.dp), color = Palette.Border)
            Row(
                Modifier.fillMaxWidth().clickable(enabled = !offline) { nav.title(entry.title) }.padding(horizontal = 16.dp, vertical = 12.dp),
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
    val offline = LocalOffline.current
    StatsCard(stringResource(R.string.stats_genres), modifier) {
        stats.genres.forEachIndexed { index, genre ->
            if (index > 0) HorizontalDivider(Modifier.padding(start = 16.dp), color = Palette.Border)
            Row(
                Modifier.fillMaxWidth().clickable(enabled = !offline) { nav.genre(genre.name) }.padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(genre.name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                Text(formatWatchTime(genre.watchSeconds, res), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

/**
 * Where the signed-in user stands on each board of the leaderboard for the
 * range, as the web's profile shows it: their place between the people
 * just above and below them. A board's name opens it whole. Boards they
 * aren't on are left out.
 */
@Composable
fun Standing(range: String, zone: String, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf<io.github.zekurio.matinee.api.LeaderboardBoard?>(null) }
    val loader = rememberLeaderboard(range, zone)
    val standings = standings((loader.state as? io.github.zekurio.matinee.ui.Load.Ready)?.value)
    if (standings.isEmpty()) return
    val res = LocalResources.current
    StatsCard(stringResource(R.string.stats_standing_title), modifier) {
        standings.forEachIndexed { index, (board, places) ->
            if (index > 0) HorizontalDivider(Modifier.padding(start = 16.dp), color = Palette.Border)
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(
                    Modifier.clip(RoundedCornerShape(4.dp)).clickable { open = board },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(metricName(board.metric), style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
                    LucideIcon(Lucide.ChevronRight, null, size = 14.dp, tint = Palette.Muted)
                }
                places.forEach { place -> PlaceRow(place, metricValue(board.metric, place.value, res)) }
            }
        }
    }
    open?.let { board -> BoardSheet(board, range) { open = null } }
}

/** A whole board, as the leaderboard has it: the top places, then the viewer's neighborhood, set off. */
@Composable
private fun BoardSheet(board: io.github.zekurio.matinee.api.LeaderboardBoard, range: String, onDismiss: () -> Unit) {
    val res = LocalResources.current
    Sheet(onDismissRequest = onDismiss, state = rememberSheetState(skipPartiallyExpanded = false)) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 12.dp)
                .verticalScroll(androidx.compose.foundation.rememberScrollState()),
        ) {
            io.github.zekurio.matinee.ui.kit.SheetHeader(metricName(board.metric), rangeName(range))
            Column(Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                board.entries.forEachIndexed { index, place ->
                    // Set off when it doesn't carry straight on from the top places.
                    if (startsNeighborhood(board, index)) Gap(10.dp)
                    PlaceRow(place, metricValue(board.metric, place.value, res))
                }
            }
        }
    }
}

/** A place: the rank, the podium's in the accent, the person, and the value; the user's own lit. */
@Composable
private fun PlaceRow(place: io.github.zekurio.matinee.api.LeaderboardEntry, value: String) {
    val api = LocalApi.current
    val user = place.user
    val podium = when (place.rank) {
        1 -> Palette.Accent
        2 -> Palette.Accent.copy(alpha = 0.6f)
        3 -> Palette.Accent.copy(alpha = 0.3f)
        else -> androidx.compose.ui.graphics.Color.Transparent
    }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
            .background(if (place.self) Palette.Accent.copy(alpha = 0.12f) else androidx.compose.ui.graphics.Color.Transparent)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(24.dp).clip(androidx.compose.foundation.shape.CircleShape).background(podium), contentAlignment = Alignment.Center) {
            Text(
                place.rank.toString(),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = if (place.rank == 1) androidx.compose.ui.graphics.Color.Black else if (place.rank <= 3) Palette.Foreground else Palette.Muted,
            )
        }
        io.github.zekurio.matinee.ui.components.Avatar(user.name, user.avatarId?.let(api.paths::avatar), size = 28.dp)
        Text(
            if (place.self) "${user.name} ${stringResource(R.string.stats_you)}" else user.name,
            style = MaterialTheme.typography.bodyLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}

/**
 * When in the week watching starts, as the web's heatmap draws it: a
 * square per hour of each weekday, deeper for more, and the busiest time
 * under it.
 */
@Composable
fun Activity(stats: WatchStats, modifier: Modifier = Modifier) {
    if (stats.activity.isEmpty()) return
    val seconds = stats.activity.associate { (it.weekday to it.hour) to it.watchSeconds }
    val max = maxOf(1.0, stats.activity.maxOf { it.watchSeconds })
    val peak = stats.activity.maxBy { it.watchSeconds }
    val accent = Palette.Accent
    val empty = Palette.Foreground.copy(alpha = 0.06f)
    StatsCard(stringResource(R.string.stats_heatmap_title), modifier) {
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            (1..7).forEach { weekday ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        weekdayName(weekday, java.time.format.TextStyle.SHORT),
                        style = MaterialTheme.typography.labelSmall,
                        color = Palette.Muted,
                        modifier = Modifier.width(30.dp),
                    )
                    Canvas(Modifier.weight(1f).height(12.dp)) {
                        val gap = 2.dp.toPx()
                        val cell = (size.width - gap * 23) / 24
                        for (hour in 0 until 24) {
                            val value = seconds[weekday to hour] ?: 0.0
                            drawRoundRect(
                                if (value > 0) accent.copy(alpha = (0.3 + 0.7 * value / max).toFloat()) else empty,
                                Offset(hour * (cell + gap), 0f),
                                Size(cell, size.height),
                                CornerRadius(2.dp.toPx()),
                            )
                        }
                    }
                }
            }
            // The hours under the squares, every six.
            Row {
                Box(Modifier.width(30.dp))
                Row(Modifier.weight(1f)) {
                    listOf(0, 6, 12, 18).forEach { hour ->
                        Text(hourName(hour), style = MaterialTheme.typography.labelSmall, color = Palette.Muted, modifier = Modifier.weight(1f))
                    }
                }
            }
            Gap(6.dp)
            Text(
                stringResource(R.string.stats_heatmap_peak, weekdayName(peak.weekday, java.time.format.TextStyle.FULL), hourName(peak.hour)),
                style = MaterialTheme.typography.bodySmall,
                color = Palette.Muted,
            )
        }
    }
}
