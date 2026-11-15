package io.github.zekurio.matinee.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.Spinner
import io.github.zekurio.matinee.ui.kit.focusRing
import io.github.zekurio.matinee.ui.tabBarPadding
import io.github.zekurio.matinee.ui.theme.Palette

/** The round check on something watched, in the accent. */
@Composable
fun WatchedBadge(modifier: Modifier = Modifier, size: Dp = 20.dp) {
    Box(
        modifier.size(size).clip(CircleShape).background(Palette.Accent),
        contentAlignment = Alignment.Center,
    ) {
        LucideIcon(Lucide.Check, stringResource(R.string.media_watched), size = size * 0.6f, tint = Palette.AccentForeground)
    }
}

/** A thin bar of how much of a file was watched, along the bottom of its picture. */
/**
 * How far into a file the person is, over its picture, as the web's cards
 * draw it: clear of the edges by [inset], the accent on a dark track.
 * Flush white along the edge ran into light pictures.
 */
@Composable
fun ProgressBar(progress: Float, modifier: Modifier = Modifier, inset: Dp = 8.dp) {
    Box(
        modifier
            .padding(start = inset, end = inset, bottom = inset)
            .fillMaxWidth()
            .height(4.dp)
            .clip(CircleShape)
            .background(Color.Black.copy(alpha = 0.45f)),
    ) {
        Box(Modifier.fillMaxWidth(progress.coerceIn(0f, 1f)).fillMaxHeight().background(Palette.Accent))
    }
}

/**
 * The room a page's spinner or error centers in: down to the navigation
 * bar, or on a tab's page to the floating tab bar, so it sits in the
 * middle of what's visible rather than low behind the bar.
 */
@Composable
internal fun visibleBottom(aboveTabBar: Boolean): Dp =
    if (aboveTabBar) tabBarPadding() else WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

@Composable
fun LoadingBox(modifier: Modifier = Modifier, aboveTabBar: Boolean = false) {
    Box(modifier.fillMaxSize().padding(bottom = visibleBottom(aboveTabBar)), contentAlignment = Alignment.Center) {
        Spinner(size = 32.dp, color = Palette.Accent)
    }
}

/** A rail or page section's heading, optionally a link with a chevron. */
@Composable
fun SectionTitle(title: String, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    val interaction = remember { MutableInteractionSource() }
    Row(
        modifier
            .then(
                if (onClick != null) Modifier.clip(RoundedCornerShape(4.dp)).focusRing(interaction, RoundedCornerShape(4.dp))
                    .clickable(interaction, indication = null, role = Role.Button, onClick = onClick)
                else Modifier,
            ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            title,
            style = MaterialTheme.typography.titleLarge,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        if (onClick != null) LucideIcon(Lucide.ChevronRight, null, size = 20.dp, tint = Palette.Muted)
    }
}

/** A person's picture, or their initial on a neutral circle. */
@Composable
fun Avatar(name: String, url: String?, modifier: Modifier = Modifier, size: Dp = 36.dp) {
    Box(
        modifier.size(size).clip(CircleShape).background(Palette.Secondary),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initials(name),
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Medium),
            color = Palette.Muted,
            fontSize = MaterialTheme.typography.labelLarge.fontSize * (size.value / 36f),
        )
        if (url != null) Picture(listOf(ImageSource(url)), Modifier.fillMaxSize())
    }
}

/** "MO" for Masi Oka, "Z" for zekurio. */
fun initials(name: String): String {
    val words = name.split(' ', '-', '_', '.').filter { it.isNotBlank() }
    return when {
        words.size >= 2 -> "${words.first().first()}${words.last().first()}".uppercase()
        words.size == 1 -> words.first().take(1).uppercase()
        else -> "?"
    }
}
