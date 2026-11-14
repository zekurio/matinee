package io.github.zekurio.matinee.ui.kit

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R

/**
 * Something loading, as the web's Spinner: lucide's loader circle turning
 * once a second (`animate-spin`), not Material's growing arc.
 */
@Composable
fun Spinner(modifier: Modifier = Modifier, size: Dp = 24.dp, color: Color = LocalContentColor.current) {
    val turn by rememberInfiniteTransition("spinner").animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(1000, easing = LinearEasing), RepeatMode.Restart),
        label = "turn",
    )
    LucideIcon(
        Lucide.LoaderCircle,
        stringResource(R.string.loading_in_progress),
        modifier.graphicsLayer { rotationZ = turn },
        size = size,
        tint = color,
    )
}
