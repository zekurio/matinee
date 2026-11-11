package io.github.zekurio.matinee.ui.player.tv

import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.TvButton

/**
 * The one thing to do now that the player offers by itself, like the next
 * episode once one ended: [label], and [countdown], the seconds until it
 * happens without a press, if it will. Shown by [TvPictureButton].
 */
internal class TvPictureAction(val label: String, val countdown: Int?, val onClick: () -> Unit)

/**
 * A single button on the picture, with no card or controls around it, as
 * Wholphin offers to skip an intro: [label], then [countdown] dimmer, like
 * "Next episode · 7". Select runs [onClick].
 *
 * The picture behind it can be any frame, so it rests dark rather than in
 * the faint white of other controls, and a shadow keeps its edge on a
 * white frame once focus fills it white.
 */
@Composable
internal fun TvPictureButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier, countdown: Int? = null) {
    TvButton(
        label,
        onClick,
        modifier.shadow(12.dp, CircleShape, ambientColor = Color.Black, spotColor = Color.Black),
        detail = countdown?.let { "· $it" },
        rest = Palette.Background.copy(alpha = 0.72f),
    )
}

/** [action] as a [TvPictureButton]. */
@Composable
internal fun TvPictureButton(action: TvPictureAction, modifier: Modifier = Modifier) {
    TvPictureButton(action.label, action.onClick, modifier, action.countdown)
}
