package io.github.zekurio.matinee.ui.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.RangeSliderState
import androidx.compose.material3.SliderDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * Two handles on a range, as the web's Slider with two thumbs: a thin
 * round track, the accent between the handles, and white round handles
 * ringed in the accent, 20dp as the web's are on a touch screen.
 * Material's range slider underneath does the dragging and the steps.
 * [onValueChangeFinished] runs once a handle is let go.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RangeSlider(
    value: ClosedFloatingPointRange<Float>,
    onValueChange: (ClosedFloatingPointRange<Float>) -> Unit,
    valueRange: ClosedFloatingPointRange<Float>,
    modifier: Modifier = Modifier,
    steps: Int = 0,
    onValueChangeFinished: (() -> Unit)? = null,
) {
    val colors = SliderDefaults.colors(
        thumbColor = Palette.Accent,
        activeTrackColor = Palette.Accent,
        inactiveTrackColor = Palette.Border,
        activeTickColor = Color.Transparent,
        inactiveTickColor = Color.Transparent,
    )
    val thumb: @Composable (RangeSliderState) -> Unit = {
        Box(
            Modifier.size(20.dp)
                .shadow(1.dp, CircleShape)
                .background(Color.White, CircleShape)
                .border(1.5.dp, Palette.Accent, CircleShape),
        )
    }
    androidx.compose.material3.RangeSlider(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        valueRange = valueRange,
        steps = steps,
        onValueChangeFinished = onValueChangeFinished,
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
    )
}
