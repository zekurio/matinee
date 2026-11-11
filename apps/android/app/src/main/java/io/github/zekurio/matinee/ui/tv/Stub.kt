package io.github.zekurio.matinee.ui.tv

import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.first

/**
 * The place of a TV page that isn't written yet: its name and nothing
 * else, focusable, so Back and the drawer work from it. A later task
 * replaces each use with the page itself.
 */
@Composable
fun TvPageStub(name: String) {
    val requester = remember { FocusRequester() }
    val interaction = remember { MutableInteractionSource() }
    val shape = RoundedCornerShape(12.dp)
    Box(Modifier.fillMaxSize().padding(start = TvPage.Start - STUB_PAD, end = TvPage.End), contentAlignment = Alignment.CenterStart) {
        Text(
            name,
            style = TvType.Headline,
            modifier = Modifier
                .focusRequester(requester)
                .tvFocus(interaction, shape, scale = 1f)
                .focusable(interactionSource = interaction)
                .padding(horizontal = STUB_PAD, vertical = 8.dp),
        )
    }
    val window = androidx.compose.ui.platform.LocalWindowInfo.current
    LaunchedEffect(Unit) {
        androidx.compose.runtime.snapshotFlow { window.isWindowFocused }.first { it }
        androidx.compose.runtime.withFrameNanos { }
        runCatching { requester.requestFocus() }
    }
}

/** Room inside the focus ring, taken back from the page's start so the name lines up with other pages. */
private val STUB_PAD = 16.dp
