package io.github.zekurio.matinee.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.theme.Palette

/**
 * The search bar's place at the top of a page: below the status bar, on
 * the gutter. Media's bar and the search page both sit here, so opening
 * one from the other looks like the bar opening.
 */
@Composable
fun SearchBarSlot(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = Gutter, vertical = 8.dp)) { content() }
}

/**
 * The search bar's pill: full width, with room for a button at each end.
 * Slim and see-through, so over Home's banner the art still shows, and
 * the same on Media and the search page.
 */
@Composable
fun SearchBarFrame(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable RowScope.() -> Unit) {
    Row(
        modifier
            .fillMaxWidth()
            .height(48.dp)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.3f))
            .border(1.dp, Palette.Foreground.copy(alpha = 0.12f), CircleShape)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}
