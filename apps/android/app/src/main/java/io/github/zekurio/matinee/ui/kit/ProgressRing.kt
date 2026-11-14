package io.github.zekurio.matinee.ui.kit

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * A ring that fills clockwise in the accent, for how much of a title is
 * in, as the web's catalog card draws it (apps/web's `ProgressRing`): a
 * 24-unit box, a 9-unit radius and a 2.5 stroke over a faint track.
 * Without a share yet, [progress] null, it's dotted: on its way, nothing
 * to count.
 */
@Composable
fun ProgressRing(progress: Double?, modifier: Modifier = Modifier, size: Dp = 20.dp) {
    val accent = Palette.Accent
    val track = Palette.Foreground.copy(alpha = 0.2f)
    val shown by animateFloatAsState((progress ?: 0.0).toFloat().coerceIn(0f, 1f), tween(700), label = "ring")
    Canvas(modifier.size(size)) {
        val stroke = this.size.minDimension * 2.5f / 24f
        val inset = this.size.minDimension * 3f / 24f
        val box = Size(this.size.width - 2 * inset, this.size.height - 2 * inset)
        val at = Offset(inset, inset)
        drawArc(track, 0f, 360f, false, at, box, style = Stroke(stroke))
        if (progress == null) {
            val circumference = (Math.PI * box.width).toFloat()
            drawArc(
                accent, -90f, 360f, false, at, box,
                style = Stroke(stroke, cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(0.1f, circumference / 12f))),
            )
        } else {
            drawArc(accent, -90f, 360f * shown, false, at, box, style = Stroke(stroke, cap = StrokeCap.Round))
        }
    }
}
