package io.github.zekurio.matinee.ui.kit

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.Motion
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * An on and off switch in the web's look: the accent when on and
 * `--input-hover` when off, with a thumb that slides across. It's larger
 * than the web's 36 by 20, a 44 by 24 track with a 20dp thumb, since a
 * finger reads and hits it rather than a pointer. It still takes a
 * finger's room. With no [onCheckedChange] it only shows, for a row that
 * toggles it itself.
 */
@Composable
fun Switch(checked: Boolean, onCheckedChange: ((Boolean) -> Unit)?, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val track by animateColorAsState(if (checked) Palette.Accent else Palette.InputHover, Motion.color(), label = "track")
    val thumb by animateColorAsState(if (checked) Palette.AccentForeground else Palette.Foreground, Motion.color(), label = "thumb")
    // A 2dp inset at either end of the track.
    val x by animateDpAsState(if (checked) TrackWidth - ThumbSize - ThumbInset else ThumbInset, Motion.enter(), label = "thumb position")
    Box(
        modifier
            .then(
                if (onCheckedChange != null) {
                    Modifier
                        .minimumInteractiveComponentSize()
                        // No wash: it would fill the square around the track.
                        .toggleable(checked, interactionSource = null, indication = null, enabled = enabled, role = Role.Switch, onValueChange = onCheckedChange)
                } else {
                    Modifier
                },
            )
            .alpha(if (enabled) 1f else 0.5f),
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(width = TrackWidth, height = TrackHeight).clip(CircleShape).background(track)) {
            Box(
                Modifier
                    .align(Alignment.CenterStart)
                    .offset(x = x)
                    .size(ThumbSize)
                    .clip(CircleShape)
                    .background(thumb),
            )
        }
    }
}

private val TrackWidth = 44.dp
private val TrackHeight = 24.dp
private val ThumbSize = 20.dp
private val ThumbInset = 2.dp
