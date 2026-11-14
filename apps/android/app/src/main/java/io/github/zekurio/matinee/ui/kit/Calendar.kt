package io.github.zekurio.matinee.ui.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.theme.Palette
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.format.TextStyle
import java.time.temporal.WeekFields
import java.util.Locale

/**
 * A month of days to pick one from, as the web's Calendar: the month and
 * arrows over it, the weekdays in the locale's order, today on a muted
 * square and the picked day in the accent, `rounded-md` cells, and the days
 * of the months around it faint. Days after [latest] can't be picked.
 */
@Composable
fun Calendar(selected: LocalDate?, onSelect: (LocalDate) -> Unit, modifier: Modifier = Modifier, latest: LocalDate? = null) {
    val today = remember { LocalDate.now() }
    var shownMonth by rememberSaveable { mutableStateOf(YearMonth.from(selected ?: today)) }
    val locale = Locale.getDefault()
    val week = remember(locale) { WeekFields.of(locale) }
    val longDate = remember(locale) { DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(locale) }
    val monthName = remember(locale) { DateTimeFormatter.ofPattern("LLLL yyyy", locale) }
    val lastMonth = latest?.let(YearMonth::from)

    Column(modifier.widthIn(max = 320.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            RoundIconButton(
                Lucide.ChevronLeft,
                stringResource(R.string.calendar_previous_month),
                { shownMonth = shownMonth.minusMonths(1) },
                size = 36.dp,
                iconSize = 16.dp,
                background = Color.Transparent,
            )
            Text(
                shownMonth.format(monthName),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f),
            )
            RoundIconButton(
                Lucide.ChevronRight,
                stringResource(R.string.calendar_next_month),
                { shownMonth = shownMonth.plusMonths(1) },
                size = 36.dp,
                iconSize = 16.dp,
                background = Color.Transparent,
                enabled = lastMonth == null || shownMonth < lastMonth,
            )
        }
        val first = week.firstDayOfWeek
        Row(Modifier.fillMaxWidth()) {
            repeat(7) { i ->
                Text(
                    first.plus(i.toLong()).getDisplayName(TextStyle.SHORT_STANDALONE, locale).trimEnd('.'),
                    style = MaterialTheme.typography.labelSmall,
                    fontSize = 12.8.sp,
                    color = Palette.Muted,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        // From the start of the week the month starts in, whole weeks to its end.
        val lead = (shownMonth.atDay(1).dayOfWeek.value - first.value + 7) % 7
        val start = shownMonth.atDay(1).minusDays(lead.toLong())
        val weeks = (lead + shownMonth.lengthOfMonth() + 6) / 7
        repeat(weeks) { row ->
            Row(Modifier.fillMaxWidth()) {
                repeat(7) { column ->
                    val day = start.plusDays((row * 7 + column).toLong())
                    Day(
                        day,
                        picked = day == selected,
                        today = day == today,
                        outside = YearMonth.from(day) != shownMonth,
                        enabled = latest == null || !day.isAfter(latest),
                        description = day.format(longDate),
                        modifier = Modifier.weight(1f),
                    ) {
                        onSelect(day)
                        shownMonth = YearMonth.from(day)
                    }
                }
            }
        }
    }
}

@Composable
private fun Day(
    day: LocalDate,
    picked: Boolean,
    today: Boolean,
    outside: Boolean,
    enabled: Boolean,
    description: String,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val (background, color) = when {
        picked -> Palette.Accent to Palette.AccentForeground
        today -> Palette.Secondary to Palette.Foreground
        outside -> Color.Transparent to Palette.Muted
        else -> Color.Transparent to Palette.Foreground
    }
    Box(
        modifier
            .aspectRatio(1f)
            .padding(2.dp)
            .clip(Shapes.Md)
            .background(background)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .semantics {
                contentDescription = description
                selected = picked
            }
            .alpha(if (enabled) 1f else 0.5f),
        contentAlignment = Alignment.Center,
    ) {
        Text(day.dayOfMonth.toString(), style = MaterialTheme.typography.bodyMedium, color = color)
    }
}
