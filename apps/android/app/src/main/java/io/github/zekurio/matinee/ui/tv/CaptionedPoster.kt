package io.github.zekurio.matinee.ui.tv

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.Credit
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.ui.components.ActionTarget
import io.github.zekurio.matinee.ui.components.ImageSource
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.components.initials
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * A [TvPosterCard] with a caption under it, as in a grid or a row of
 * seasons: [name] and a dimmer [detail]. [focus] goes on the poster,
 * which is what takes focus.
 */
@Composable
fun TvCaptionedPoster(
    name: String,
    poster: ImageSource?,
    detail: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    focus: Modifier = Modifier,
    watched: Boolean = false,
    badge: String? = null,
    menu: ActionTarget? = null,
    width: Dp = TvCards.PosterWidth,
) {
    Column(modifier.width(width)) {
        Box {
            TvPosterCard(name, poster, onClick, focus.width(width), watched = watched, menu = menu)
            if (badge != null && !watched) {
                Text(
                    badge,
                    style = TvType.Caption,
                    color = Palette.AccentForeground,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                        .clip(CircleShape)
                        .background(Palette.Accent)
                        .padding(horizontal = 8.dp),
                )
            }
        }
        Text(name, style = TvType.Label, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 12.dp))
        if (detail != null) Text(detail, style = TvType.Caption, color = Palette.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
