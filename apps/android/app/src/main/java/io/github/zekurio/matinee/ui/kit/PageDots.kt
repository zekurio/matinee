package io.github.zekurio.matinee.ui.kit

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * Where a row of pages rests, as the web's carousel dots: a dot for each
 * place it can rest at, the current one drawn long. It only shows; the row
 * itself is what's swiped, and each page tells TalkBack where it is, so the
 * dots are hidden from it. The iPhone kit's PageDots.
 *
 *     PageDots(count = stops, current = stop)
 *
 * [tint] is the dots' color, the text's by default, the current one solid
 * and the others faint.
 */
@Composable
fun PageDots(count: Int, current: Int, modifier: Modifier = Modifier, tint: Color = Palette.Foreground) {
    Row(
        modifier.clearAndSetSemantics {},
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(count.coerceAtLeast(0)) { index ->
            val on = index == current
            val width by animateDpAsState(if (on) 20.dp else 6.dp, Motion.move(), label = "page dot")
            val color by animateColorAsState(if (on) tint else tint.copy(alpha = 0.25f), Motion.move(), label = "page dot color")
            Box(
                Modifier
                    .height(6.dp)
                    .width(width)
                    .clip(CircleShape)
                    .background(color),
            )
        }
    }
}
