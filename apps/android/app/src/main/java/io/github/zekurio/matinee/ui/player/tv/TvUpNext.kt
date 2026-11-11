package io.github.zekurio.matinee.ui.player.tv

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.episodeCode
import io.github.zekurio.matinee.ui.itemLabel
import io.github.zekurio.matinee.ui.player.LocalPlayerHost
import io.github.zekurio.matinee.ui.player.PlayerController
import io.github.zekurio.matinee.ui.player.rememberUpNext
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * The next episode once one ended: a card above the controls whose Play
 * button takes focus as it appears, unless a menu is open, counting down
 * as the phone's does. [onShown] says while it shows, so the controls
 * leave focus to it.
 */
@Composable
internal fun TvUpNext(controller: PlayerController, autoplay: Boolean, menuOpen: Boolean, onShown: (Boolean) -> Unit, modifier: Modifier) {
    val host = LocalPlayerHost.current
    val res = LocalResources.current
    val next = rememberUpNext(controller, autoplay) ?: return
    val shown by rememberUpdatedState(onShown)
    DisposableEffect(Unit) {
        shown(true)
        onDispose { shown(false) }
    }
    val play = remember { FocusRequester() }
    LaunchedEffect(next.item.id) {
        withFrameNanos {}
        if (!menuOpen) runCatching { play.requestFocus() }
    }
    val label = itemLabel(next.item, res)
    Column(
        modifier.width(380.dp).clip(RoundedCornerShape(16.dp)).background(Palette.Raised.copy(alpha = 0.96f)).padding(20.dp),
    ) {
        Text(stringResource(R.string.player_up_next), style = MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp), color = Palette.Muted)
        Box(Modifier.height(4.dp))
        val code = episodeCode(next.item, res)
        Text(
            if (code != null) stringResource(R.string.media_code_title, code, label.title) else label.title,
            style = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp, fontWeight = FontWeight.SemiBold),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Box(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            TvButton(
                { host.playInstead(next.item.id) },
                Modifier.focusRequester(play),
                shape = RoundedCornerShape(26.dp),
                size = 52.dp,
                padding = PaddingValues(horizontal = 20.dp),
            ) { tint ->
                LucideIcon(Lucide.Play, null, size = 20.dp, tint = tint)
                Text(
                    if (next.cancelled) stringResource(R.string.player_play) else stringResource(R.string.player_up_next_in, next.left),
                    style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp),
                    color = tint,
                )
            }
            if (!next.cancelled) {
                TvButton(
                    {
                        next.cancelled = true
                        // The button goes, so focus stays on the card.
                        runCatching { play.requestFocus() }
                    },
                    shape = RoundedCornerShape(26.dp),
                    size = 52.dp,
                    padding = PaddingValues(horizontal = 20.dp),
                ) { tint ->
                    Text(stringResource(R.string.player_up_next_cancel), style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp), color = tint)
                }
            }
        }
    }
}
