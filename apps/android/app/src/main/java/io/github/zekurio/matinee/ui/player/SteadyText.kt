package io.github.zekurio.matinee.ui.player

import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import io.github.zekurio.matinee.ui.formatClock

/**
 * A number that changes while the user watches it, like a time or a level.
 * Its digits are tabular and it keeps at least the width of [longest], so
 * neither it nor what sits beside it moves as the number counts.
 */
@Composable
internal fun SteadyText(
    text: String,
    longest: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    textAlign: TextAlign? = null,
) {
    val tabular = remember(style) { style.copy(fontFeatureSettings = "tnum") }
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val width = remember(longest, tabular, density) {
        with(density) { measurer.measure(longest, tabular).size.width.toDp() }
    }
    Text(
        text,
        style = tabular,
        color = color,
        textAlign = textAlign,
        maxLines = 1,
        softWrap = false,
        modifier = modifier.widthIn(min = width),
    )
}

/** The widest a time up to [duration] gets: with tabular figures every digit is as wide as a 0. */
internal fun longestClock(duration: Double): String = formatClock(duration).replace(Regex("[0-9]"), "0")

/** A time beside the seek bar, as wide as the longest time [duration] can show. [prefix] goes before both. */
@Composable
internal fun SeekClock(
    seconds: Double,
    duration: Double,
    style: TextStyle,
    modifier: Modifier = Modifier,
    prefix: String = "",
    textAlign: TextAlign? = null,
) {
    SteadyText(prefix + formatClock(seconds), prefix + longestClock(duration), style, modifier, textAlign = textAlign)
}
