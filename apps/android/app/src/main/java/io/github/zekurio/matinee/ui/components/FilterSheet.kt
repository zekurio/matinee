package io.github.zekurio.matinee.ui.components

import android.content.res.Resources
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.systemGestureExclusion
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RangeSlider
import androidx.compose.material3.RangeSliderState
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.formatRuntime
import io.github.zekurio.matinee.ui.theme.Palette
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

/*
 * The filter sheet Discover's browse and the libraries share, as the web
 * shares its panel: the Filter button with whether any are on, a bottom
 * sheet with Clear and Show titles, and the parts each page fills it
 * with. Each change applies at once; a range applies when its handle is
 * let go.
 */

/** A choice among chips or in a list, with how many titles have it, where known. */
class FilterChoice<T>(val value: T, val label: String, val count: Int? = null)

/** A filter in use, as its chip names it. */
class ActiveFilter(val key: String, val label: String, val remove: () -> Unit)

/** The bar's Filter button: the accent when any filter is on. */
@Composable
fun FilterButton(active: Int, onClick: () -> Unit) {
    val res = LocalResources.current
    RoundIconButton(
        Lucide.ListFilter,
        if (active > 0) res.getQuantityString(R.plurals.browse_filters_on, active, active) else stringResource(R.string.web_filters_title),
        onClick,
        size = 48.dp,
        iconSize = 22.dp,
        background = Color.Transparent,
        tint = if (active > 0) Palette.Accent else Palette.Foreground,
    )
}

/** The filters in use as chips that take themselves off, and Clear all once there are two. */
@Composable
fun ActiveFilterChips(chips: List<ActiveFilter>, onClear: () -> Unit) {
    val res = LocalResources.current
    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp), contentPadding = PaddingValues(vertical = 2.dp)) {
        items(chips, key = { it.key }) { chip ->
            Chip(
                chip.label,
                selected = true,
                trailingIcon = Lucide.X,
                onClick = chip.remove,
                modifier = Modifier.semantics { contentDescription = res.getString(R.string.browse_remove_filter, chip.label) },
            )
        }
        if (chips.size > 1) {
            item(key = "clear") { Chip(stringResource(R.string.browse_clear_all), selected = false, onClick = onClear) }
        }
    }
}

/** The sheet the filters open in, with Clear filters while any is on, and Show titles. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FilterSheet(active: Int, onClear: () -> Unit, onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val close: () -> Unit = { scope.launch { sheet.hide() }.invokeOnCompletion { onDismiss() } }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet, containerColor = Palette.Raised) {
        Text(
            stringResource(R.string.web_filters_title),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(horizontal = Gutter, vertical = 8.dp),
        )
        Column(
            Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(horizontal = Gutter, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
            content = content,
        )
        HorizontalDivider(color = Palette.Border)
        Row(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = Gutter, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (active > 0) {
                MatineeButton(onClick = onClear, look = ButtonLook.Ghost) {
                    LucideIcon(Lucide.X, null, size = 16.dp)
                    Text(stringResource(R.string.browse_clear_filters))
                }
            }
            Box(Modifier.weight(1f))
            MatineeButton(onClick = close) { Text(stringResource(R.string.web_filters_done)) }
        }
    }
}

/** A filter's heading, a line about it, what it's set to, and its control. `small` is a part under a filter's own heading. */
@Composable
fun FilterSection(title: String, hint: String? = null, value: String? = null, small: Boolean = false, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(if (small) 8.dp else 10.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                if (small) {
                    Text(title, style = MaterialTheme.typography.bodySmall, color = Palette.Muted, fontWeight = FontWeight.Medium)
                } else {
                    Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                }
                if (hint != null) Text(hint, style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
            }
            if (value != null) Text(value, style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
        }
        content()
    }
}

/** One of a few values, or none: "Any" first, then each. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun <T> ChoiceChips(choices: List<FilterChoice<T>>, value: T?, onChange: (T?) -> Unit) {
    val res = LocalResources.current
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Chip(stringResource(R.string.web_filters_any), selected = value == null, onClick = { onChange(null) })
        choices.forEach { choice ->
            Chip(choice.label, selected = choice.value == value, onClick = { onChange(choice.value) }, count = choice.count?.let { formatCount(it, res) })
        }
    }
}

/**
 * Any number of choices, each a chip that turns on and off. Past [limit]
 * choices, a field finds the rest by name, and only the first [limit]
 * that match show, with those that are on.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ToggleChips(
    choices: List<FilterChoice<String>>,
    value: List<String>,
    onChange: (List<String>) -> Unit,
    limit: Int? = null,
    @StringRes findPlaceholder: Int? = null,
    @StringRes noMatch: Int? = null,
) {
    val res = LocalResources.current
    var query by remember { mutableStateOf("") }
    val finding = limit != null && choices.size > limit
    val matching = choices.filter { query.isBlank() || it.label.contains(query.trim(), ignoreCase = true) }
    val shown = if (finding) {
        val first = matching.take(limit ?: 0)
        choices.filter { it.value in value && it !in first } + first
    } else {
        choices
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (finding && findPlaceholder != null) {
            MatineeTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = stringResource(findPlaceholder),
                leadingIcon = Lucide.Search,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            shown.forEach { choice ->
                val on = choice.value in value
                Chip(
                    choice.label,
                    selected = on,
                    onClick = { onChange(if (on) value - choice.value else value + choice.value) },
                    count = choice.count?.let { formatCount(it, res) },
                )
            }
        }
        if (shown.isEmpty() && noMatch != null) {
            Text(stringResource(noMatch), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
        }
    }
}

/** The span a range's handles move in, by [step]. */
class FilterSpan(val min: Double, val max: Double, val step: Double)

/**
 * Two handles on a range, each open at its end. What it says follows the
 * handles; the list changes once they're let go.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RangeField(
    title: String,
    hint: String?,
    range: FilterSpan,
    low: Double?,
    high: Double?,
    words: (Double?, Double?) -> String,
    onCommit: (Double?, Double?) -> Unit,
) {
    val min = range.min.toFloat()
    val max = range.max.toFloat()
    var moving by remember(low, high, range.min, range.max) { mutableStateOf((low?.toFloat() ?: min)..(high?.toFloat() ?: max)) }
    val open = { values: ClosedFloatingPointRange<Float> ->
        val step = range.step
        fun snap(value: Float) = range.min + ((value - range.min) / step).roundToInt() * step
        val a = snap(values.start)
        val b = snap(values.endInclusive)
        (if (a <= range.min) null else a) to (if (b >= range.max) null else b)
    }
    val (shownLow, shownHigh) = open(moving)
    val said = words(shownLow, shownHigh)
    FilterSection(title, hint, said) {
        val colors = SliderDefaults.colors(
            thumbColor = Palette.Accent,
            activeTrackColor = Palette.Accent,
            inactiveTrackColor = Palette.Border,
            activeTickColor = Color.Transparent,
            inactiveTickColor = Color.Transparent,
        )
        // A thin track and round handles, as the web's range has them.
        val thumb: @Composable (RangeSliderState) -> Unit = {
            Box(
                Modifier.size(20.dp)
                    .shadow(1.dp, CircleShape)
                    .background(Color.White, CircleShape)
                    .border(1.5.dp, Palette.Accent, CircleShape),
            )
        }
        RangeSlider(
            value = moving,
            onValueChange = { moving = it },
            valueRange = min..max,
            steps = (((range.max - range.min) / range.step).roundToInt() - 1).coerceAtLeast(0),
            onValueChangeFinished = {
                val (a, b) = open(moving)
                onCommit(a, b)
            },
            colors = colors,
            startThumb = thumb,
            endThumb = thumb,
            track = { state ->
                SliderDefaults.Track(
                    rangeSliderState = state,
                    modifier = Modifier.height(4.dp),
                    colors = colors,
                    drawStopIndicator = null,
                    thumbTrackGapSize = 0.dp,
                )
            },
            // The handles sit at the screen's edges, where a swipe would
            // otherwise go back and close the sheet.
            modifier = Modifier.systemGestureExclusion().semantics { stateDescription = said },
        )
    }
}

/** A row naming what's picked from a long list, which opens [OptionSheet]. */
@Composable
fun OptionRow(label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        LucideIcon(Lucide.ChevronRight, null, size = 18.dp, tint = Palette.Muted)
    }
}

/** A long list to pick one from, or none with [any], with a field to find one. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OptionSheet(
    title: String,
    any: String,
    @StringRes findPlaceholder: Int,
    choices: List<FilterChoice<String>>,
    current: String?,
    onPick: (String?) -> Unit,
    onDismiss: () -> Unit,
) {
    val res = LocalResources.current
    var query by remember { mutableStateOf("") }
    val shown = choices.filter { query.isBlank() || it.label.contains(query.trim(), ignoreCase = true) }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Palette.Raised) {
        Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = Gutter, vertical = 8.dp))
        MatineeTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = stringResource(findPlaceholder),
            leadingIcon = Lucide.Search,
            modifier = Modifier.fillMaxWidth().padding(horizontal = Gutter, vertical = 8.dp),
        )
        HorizontalDivider(color = Palette.Border)
        LazyColumn(Modifier.fillMaxWidth().heightIn(max = 480.dp).navigationBarsPadding()) {
            if (query.isBlank()) {
                item(key = "any") { PickRow(any, null, current == null) { onPick(null) } }
            }
            items(shown, key = { it.value }) { choice ->
                PickRow(choice.label, choice.count?.let { formatCount(it, res) }, current == choice.value) { onPick(choice.value) }
            }
        }
    }
}

@Composable
private fun PickRow(name: String, count: String?, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = Gutter, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        if (count != null) Text(count, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
        if (selected) {
            Gap(12.dp)
            LucideIcon(Lucide.Check, null, size = 18.dp, tint = Palette.Accent)
        }
    }
}

/** The keys that word a range: both ends, the low one, the high one. */
class RangeWords(@StringRes val between: Int, @StringRes val low: Int, @StringRes val high: Int)

val PANEL_WORDS = RangeWords(R.string.web_filters_between, R.string.web_filters_atLeast, R.string.web_filters_upTo)
val YEAR_WORDS = RangeWords(R.string.web_filters_between, R.string.web_filters_from, R.string.web_filters_upTo)
val SCORE_CHIP_WORDS = RangeWords(R.string.web_filters_chip_scoreBetween, R.string.web_filters_chip_scoreAtLeast, R.string.web_filters_chip_scoreUpTo)
val RUNTIME_CHIP_WORDS = RangeWords(R.string.web_filters_chip_runtimeBetween, R.string.web_filters_chip_runtimeAtLeast, R.string.web_filters_chip_runtimeUpTo)

/** "1980 to 1989", "At least 7.5", or [any] with both ends open. */
fun rangeText(low: Double?, high: Double?, format: (Double) -> String, any: String, words: RangeWords, res: Resources): String = when {
    low != null && high != null && low == high -> format(low)
    low != null && high != null -> res.getString(words.between, format(low), format(high))
    low != null -> res.getString(words.low, format(low))
    high != null -> res.getString(words.high, format(high))
    else -> any
}

fun yearText(value: Double) = value.roundToInt().toString()

fun runtimeText(value: Double, res: Resources) = formatRuntime(value.roundToInt(), res) ?: "0"

fun formatCount(count: Int, res: Resources): String =
    NumberFormat.getIntegerInstance(res.configuration.locales[0] ?: Locale.getDefault()).format(count)

/** A country's name for its ISO code, in the app's language. */
fun countryName(code: String, res: Resources): String =
    runCatching { Locale.Builder().setRegion(code).build().getDisplayCountry(res.configuration.locales[0] ?: Locale.getDefault()) }
        .getOrNull()?.ifEmpty { null } ?: code
