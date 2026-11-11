package io.github.zekurio.matinee.ui.tv.profile

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.WatchStats
import io.github.zekurio.matinee.ui.profile.bucketName
import io.github.zekurio.matinee.ui.profile.formatWatchTime
import io.github.zekurio.matinee.ui.profile.hourName
import io.github.zekurio.matinee.ui.profile.rangeName
import io.github.zekurio.matinee.ui.profile.scaleTop
import io.github.zekurio.matinee.ui.profile.weekdayName
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.TvFocusMemory
import io.github.zekurio.matinee.ui.tv.TvPage
import io.github.zekurio.matinee.ui.tv.TvType
import io.github.zekurio.matinee.ui.tv.tvFocusOnTap
import java.time.format.TextStyle

/*
 * The profile's two charts on a TV. Each is one focus stop, so the page
 * scrolls to it and passes it with one press. Focused, the arrows move a
 * mark across its bars or squares, and the line above the chart reads out
 * the one marked, as touching it does on the phone. The mark is the text
 * color, as a focused control fills with it; an arrow past the chart's
 * edge leaves it.
 */

private const val WATCH_TIME = "watchTime"
private const val VIEWING_TIMES = "viewingTimes"

/** How tall the watch-time bars can grow. */
private val BarsHeight = 180.dp

/** Beside the bars, for the scale's figures. */
private val ScaleWidth = 88.dp

/**
 * The range's watch time: the total, large, over watch time per day,
 * week, or month as bars. Focused, a bar is marked, the newest first, and
 * the total's place reads that day, week, or month out instead.
 */
@Composable
internal fun WatchTimeChart(stats: WatchStats, memory: TvFocusMemory) {
    val res = LocalResources.current
    val buckets = stats.buckets
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    var picked by remember(stats) { mutableIntStateOf(buckets.lastIndex) }
    val shown = if (focused) buckets.getOrNull(picked) else null
    val top = scaleTop(buckets.maxOfOrNull { it.watchSeconds } ?: 0.0)
    val accent = Palette.Accent
    val mark = Palette.Foreground
    val line = Palette.Border

    Column(
        with(memory) { Modifier.item(WATCH_TIME, WATCH_TIME) }
            .onKeyEvent { event -> event.across(buckets.size, picked) { picked = it } }
            .tvFocusOnTap()
            .focusable(interactionSource = interaction)
            .fillMaxWidth()
            .padding(start = TvPage.Start, end = TvPage.End),
    ) {
        Text(
            shown?.let {
                "${bucketName(it.start, stats.unit, res)}  ·  ${res.getQuantityString(R.plurals.stats_play_count, it.plays, it.plays)}"
            } ?: "${stringResource(R.string.stats_watch_time)}  ·  ${rangeName(stats.range)}",
            style = TvType.Facts,
            color = Palette.Muted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(formatWatchTime(shown?.watchSeconds ?: stats.totals.watchSeconds, res), style = TvType.Display, maxLines = 1)
        if (buckets.isEmpty()) return@Column
        Row(Modifier.padding(top = 20.dp)) {
            Canvas(
                Modifier
                    .weight(1f)
                    .height(BarsHeight)
                    .onTapAt { at, size -> picked = (at.x / size.width * buckets.size).toInt().coerceIn(0, buckets.lastIndex) },
            ) {
                // All time can hold hundreds of months, so the bars thin out
                // to lines rather than leave the chart.
                val slot = size.width / buckets.size
                val gap = (slot * 0.25f).coerceAtMost(8.dp.toPx())
                val radius = CornerRadius(minOf(4.dp.toPx(), (slot - gap) / 2))
                val stroke = 1.dp.toPx()
                drawLine(line, Offset(0f, 0f), Offset(size.width, 0f), stroke)
                drawLine(line, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), stroke)
                drawLine(line, Offset(0f, size.height), Offset(size.width, size.height), stroke)
                // The marked slot shows even where nothing was watched.
                if (shown != null) {
                    drawRoundRect(mark.copy(alpha = 0.1f), Offset(picked * slot, 0f), Size(slot, size.height), CornerRadius(6.dp.toPx()))
                }
                buckets.forEachIndexed { index, bucket ->
                    if (bucket.watchSeconds <= 0) return@forEachIndexed
                    val height = (bucket.watchSeconds / top * size.height).toFloat().coerceAtLeast(3.dp.toPx())
                    val color = when {
                        shown == null -> accent
                        index == picked -> mark
                        else -> accent.copy(alpha = 0.45f)
                    }
                    drawRoundRect(color, Offset(index * slot + gap / 2, size.height - height), Size(slot - gap, height), radius)
                }
            }
            // The scale's figures, each under its line.
            Box(Modifier.width(ScaleWidth).height(BarsHeight).padding(start = 14.dp)) {
                ScaleFigure(formatWatchTime(top, res), 0.dp)
                ScaleFigure(formatWatchTime(top / 2, res), BarsHeight / 2)
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 8.dp, end = ScaleWidth)) {
            Text(bucketName(buckets.first().start, stats.unit, res), style = TvType.Caption, color = Palette.Muted, maxLines = 1, modifier = Modifier.weight(1f))
            if (buckets.size > 1) Text(bucketName(buckets.last().start, stats.unit, res), style = TvType.Caption, color = Palette.Muted, maxLines = 1)
        }
    }
}

@Composable
private fun ScaleFigure(text: String, y: Dp) {
    Text(text, style = TvType.Caption, color = Palette.Muted, maxLines = 1, modifier = Modifier.offset(y = y + 4.dp))
}

/** A square of the viewing times, and the room between them. */
private val CellHeight = 24.dp
private val CellGap = 4.dp

/** Beside the squares, for the weekdays' names. */
private val WeekdayWidth = 64.dp

/**
 * When in the week watching starts, as the phone's heatmap draws it: a
 * square per hour of each weekday, deeper for more. Under the title the
 * busiest time; focused, a square is marked, the busiest first, and the
 * line reads that hour and its watch time out instead.
 */
@Composable
internal fun ViewingTimes(stats: WatchStats, memory: TvFocusMemory) {
    if (stats.activity.isEmpty()) return
    val res = LocalResources.current
    val seconds = remember(stats) { stats.activity.associate { (it.weekday to it.hour) to it.watchSeconds } }
    val max = maxOf(1.0, stats.activity.maxOf { it.watchSeconds })
    val peak = stats.activity.maxBy { it.watchSeconds }
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    // Weekdays count 1 to 7 from Monday, hours 0 to 23, as the server sends them.
    var day by remember(stats) { mutableIntStateOf(peak.weekday) }
    var hour by remember(stats) { mutableIntStateOf(peak.hour) }
    val accent = Palette.Accent
    val mark = Palette.Foreground
    val empty = Palette.Foreground.copy(alpha = 0.06f)

    Column(
        with(memory) { Modifier.item(VIEWING_TIMES, VIEWING_TIMES) }
            .onKeyEvent { event ->
                event.across(24, hour) { hour = it } || event.down(7, day - 1) { day = it + 1 }
            }
            .tvFocusOnTap()
            .focusable(interactionSource = interaction)
            .fillMaxWidth()
            .padding(start = TvPage.Start, end = TvPage.End),
    ) {
        Text(stringResource(R.string.stats_heatmap_title), style = TvType.Title, maxLines = 1)
        Text(
            if (focused) {
                val cell = stringResource(R.string.tv_stats_heatmap_cell, weekdayName(day, TextStyle.FULL), hourName(hour), hourName((hour + 1) % 24))
                "$cell  ·  ${formatWatchTime(seconds[day to hour] ?: 0.0, res)}"
            } else {
                stringResource(R.string.stats_heatmap_peak, weekdayName(peak.weekday, TextStyle.FULL), hourName(peak.hour))
            },
            style = TvType.Facts,
            color = if (focused) Palette.Foreground else Palette.Muted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 4.dp, bottom = 16.dp),
        )
        Row {
            Column(Modifier.width(WeekdayWidth), verticalArrangement = Arrangement.spacedBy(CellGap)) {
                (1..7).forEach { weekday ->
                    Box(Modifier.height(CellHeight), contentAlignment = Alignment.CenterStart) {
                        Text(
                            weekdayName(weekday, TextStyle.SHORT),
                            style = TvType.Caption,
                            color = if (focused && weekday == day) Palette.Foreground else Palette.Muted,
                            maxLines = 1,
                        )
                    }
                }
            }
            Canvas(
                Modifier
                    .weight(1f)
                    .height(CellHeight * 7 + CellGap * 6)
                    .onTapAt { at, size ->
                        hour = (at.x / size.width * 24).toInt().coerceIn(0, 23)
                        day = (at.y / size.height * 7).toInt().coerceIn(0, 6) + 1
                    },
            ) {
                val gap = CellGap.toPx()
                val width = (size.width - gap * 23) / 24
                val height = CellHeight.toPx()
                val radius = CornerRadius(4.dp.toPx())
                for (weekday in 1..7) {
                    for (h in 0 until 24) {
                        val value = seconds[weekday to h] ?: 0.0
                        val color = when {
                            focused && weekday == day && h == hour -> mark
                            value > 0 -> accent.copy(alpha = (0.3 + 0.7 * value / max).toFloat())
                            else -> empty
                        }
                        drawRoundRect(color, Offset(h * (width + gap), (weekday - 1) * (height + gap)), Size(width, height), radius)
                    }
                }
            }
        }
        // The hours under the squares, every three.
        Row(Modifier.padding(top = 8.dp)) {
            Box(Modifier.width(WeekdayWidth))
            Row(Modifier.weight(1f)) {
                (0 until 24 step 3).forEach { h ->
                    Text(hourName(h), style = TvType.Caption, color = Palette.Muted, maxLines = 1, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

/**
 * A click or a touch here marks the place under it, through [onTap] with
 * where it landed and this one's size. It leaves the press unconsumed, so
 * the chart's [tvFocusOnTap] still focuses the chart.
 */
private fun Modifier.onTapAt(onTap: (Offset, IntSize) -> Unit): Modifier = pointerInput(onTap) {
    awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false)
        val up = waitForUpOrCancellation() ?: return@awaitEachGesture
        onTap(up.position, size)
    }
}

/**
 * Left and Right move a mark among [count] places from [at], through
 * [move]. True when the mark moved, so focus stays; false at an end, so
 * the press moves focus on as usual.
 */
private fun KeyEvent.across(count: Int, at: Int, move: (Int) -> Unit): Boolean = step(Key.DirectionLeft, Key.DirectionRight, count, at, move)

/** Up and Down, as [across] does Left and Right. */
private fun KeyEvent.down(count: Int, at: Int, move: (Int) -> Unit): Boolean = step(Key.DirectionUp, Key.DirectionDown, count, at, move)

private fun KeyEvent.step(back: Key, forward: Key, count: Int, at: Int, move: (Int) -> Unit): Boolean {
    val next = when (key) {
        back -> at - 1
        forward -> at + 1
        else -> return false
    }
    if (next !in 0 until count) return false
    if (type == KeyEventType.KeyDown) move(next)
    return true
}
