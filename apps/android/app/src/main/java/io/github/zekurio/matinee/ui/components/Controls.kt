package io.github.zekurio.matinee.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.tabBarPadding
import io.github.zekurio.matinee.ui.theme.Palette

/** The web's 0.625rem radius. */
val ControlShape = RoundedCornerShape(10.dp)
val CardShape = RoundedCornerShape(6.dp)

/** The page gutter on phones. */
val Gutter = 16.dp

/** [Glass] is white over a dark shade on a picture, whatever the theme. */
enum class ButtonLook { Primary, Secondary, Frosted, Glass, Outline, Ghost }

/**
 * A ring for the D-pad on TVs, where focus moves instead of a finger. Phones
 * rarely see it.
 */
@Composable
fun Modifier.focusRing(interaction: MutableInteractionSource, shape: Shape): Modifier {
    val focused by interaction.collectIsFocusedAsState()
    return if (focused) border(2.dp, MaterialTheme.colorScheme.primary, shape) else this
}

@Composable
fun MatineeButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    look: ButtonLook = ButtonLook.Primary,
    enabled: Boolean = true,
    height: Dp = 44.dp,
    contentPadding: PaddingValues = PaddingValues(horizontal = 16.dp),
    /** Rounded all round, or on one side for half of a split button. */
    shape: Shape = ControlShape,
    /** Drawn as disabled while still taking a tap, for a button whose tap says why it can't do its job. */
    dimmed: Boolean = !enabled,
    content: @Composable RowScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val (background, foreground) = when (look) {
        ButtonLook.Primary -> Palette.Accent to Palette.AccentForeground
        ButtonLook.Secondary -> Palette.Secondary to Palette.Foreground
        ButtonLook.Frosted -> Palette.Foreground.copy(alpha = 0.15f) to Palette.Foreground
        ButtonLook.Glass -> Color.White.copy(alpha = 0.18f) to Color.White
        ButtonLook.Outline -> Color.Transparent to Palette.Foreground
        ButtonLook.Ghost -> Color.Transparent to Palette.Foreground
    }
    Row(
        modifier
            .heightIn(min = height)
            .clip(shape)
            .background(if (dimmed) background.copy(alpha = background.alpha * 0.5f) else background)
            .then(if (look == ButtonLook.Outline) Modifier.border(1.dp, Palette.Border, shape) else Modifier)
            .then(if (look == ButtonLook.Frosted) Modifier.border(1.dp, Palette.Foreground.copy(alpha = 0.1f), shape) else Modifier)
            .then(if (look == ButtonLook.Glass) Modifier.border(1.dp, Color.White.copy(alpha = 0.15f), shape) else Modifier)
            .focusRing(interaction, shape)
            .clickable(interaction, indication = androidx.compose.material3.ripple(), enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(contentPadding),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OnColor(if (dimmed) foreground.copy(alpha = 0.5f) else foreground) {
            androidx.compose.material3.ProvideTextStyle(MaterialTheme.typography.labelLarge) { content() }
        }
    }
}

/**
 * A round button with one icon, like the watched and favorite buttons on a
 * title. A circle smaller than 48dp still takes 48dp of layout, as
 * Material's icon buttons do, so its touch target never overlaps a
 * neighbour's.
 */
@Composable
fun RoundIconButton(
    @DrawableRes icon: Int,
    contentDescription: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 44.dp,
    iconSize: Dp = 20.dp,
    tint: Color = Palette.Foreground,
    background: Color = Palette.Secondary,
    enabled: Boolean = true,
) {
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier
            .minimumInteractiveComponentSize()
            .size(size)
            .clip(CircleShape)
            .background(background)
            .focusRing(interaction, CircleShape)
            .clickable(interaction, indication = androidx.compose.material3.ripple(), enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        LucideIcon(icon, contentDescription, size = iconSize, tint = tint)
    }
}

/**
 * A filter or library chip: filled when it's the current one, which screen
 * readers hear as selected. One with a [trailingIcon] acts, as removing a
 * filter does, so it's a plain button.
 */
@Composable
fun Chip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    frosted: Boolean = false,
    @DrawableRes trailingIcon: Int? = null,
) {
    val interaction = remember { MutableInteractionSource() }
    val shape = CircleShape
    Row(
        modifier
            .heightIn(min = 36.dp)
            .clip(shape)
            .background(
                when {
                    selected -> Palette.Foreground
                    frosted -> Palette.Background.copy(alpha = 0.4f)
                    else -> Color.Transparent
                },
            )
            .then(if (selected) Modifier else Modifier.border(BorderStroke(1.dp, Palette.Foreground.copy(alpha = 0.1f)), shape))
            .focusRing(interaction, shape)
            .then(
                if (trailingIcon == null) {
                    Modifier.selectable(selected, interaction, androidx.compose.material3.ripple(), role = Role.Tab, onClick = onClick)
                } else {
                    Modifier.clickable(interaction, indication = androidx.compose.material3.ripple(), role = Role.Button, onClick = onClick)
                },
            )
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        val color = if (selected) Palette.Background else Palette.Foreground.copy(alpha = 0.75f)
        Text(label, style = MaterialTheme.typography.labelLarge, color = color, maxLines = 1)
        if (trailingIcon != null) LucideIcon(trailingIcon, null, size = 14.dp, tint = color)
    }
}

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
private fun visibleBottom(aboveTabBar: Boolean): Dp =
    if (aboveTabBar) tabBarPadding() else WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

@Composable
fun LoadingBox(modifier: Modifier = Modifier, aboveTabBar: Boolean = false) {
    Box(modifier.fillMaxSize().padding(bottom = visibleBottom(aboveTabBar)), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = Palette.Accent, strokeWidth = 3.dp, modifier = Modifier.size(32.dp))
    }
}

/**
 * What can't show without the server, while it can't be reached: the
 * disconnect icon and a way to try again, nothing more. Every page and
 * section shows the same, so being offline reads the same everywhere.
 */
@Composable
fun Disconnected(onRetry: (() -> Unit)?, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        LucideIcon(Lucide.CloudOff, stringResource(R.string.server_unreachable), size = 32.dp, tint = Palette.Muted)
        if (onRetry != null) {
            Spacer(Modifier.size(16.dp))
            MatineeButton(onClick = onRetry, look = ButtonLook.Outline) {
                LucideIcon(Lucide.RefreshCw, null, size = 16.dp)
                Text(stringResource(R.string.common_retry))
            }
        }
    }
}

/**
 * For a page still showing what loaded before: the disconnect icon in its
 * top bar while [loaders] can't reach the server, tapped to try again.
 */
@Composable
fun DisconnectedAction(vararg loaders: io.github.zekurio.matinee.ui.Loader<*>) {
    val cut = loaders.filter { it.refreshError != null && it.refreshDisconnected }
    if (cut.isEmpty()) return
    RoundIconButton(
        Lucide.CloudOff,
        stringResource(R.string.server_unreachable),
        { cut.forEach { it.reload() } },
        size = 40.dp,
        iconSize = 20.dp,
        tint = Palette.Muted,
        background = Color.Transparent,
        enabled = cut.none { it.refreshing },
    )
}

/** What failed, with a way to try again; while the server can't be reached, just [Disconnected]. */
@Composable
fun ErrorBox(
    title: String,
    message: String?,
    onRetry: (() -> Unit)?,
    modifier: Modifier = Modifier,
    aboveTabBar: Boolean = false,
    disconnected: Boolean = false,
) {
    if (disconnected) {
        Box(modifier.fillMaxSize().padding(bottom = visibleBottom(aboveTabBar)).padding(32.dp), contentAlignment = Alignment.Center) {
            Disconnected(onRetry)
        }
        return
    }
    Column(
        modifier.fillMaxSize().padding(bottom = visibleBottom(aboveTabBar)).padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier.size(48.dp).clip(RoundedCornerShape(12.dp)).background(Palette.Secondary),
            contentAlignment = Alignment.Center,
        ) {
            LucideIcon(Lucide.CircleAlert, null, size = 24.dp, tint = Palette.Muted)
        }
        Spacer(Modifier.size(16.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        if (message != null) {
            Spacer(Modifier.size(4.dp))
            Text(message, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted, textAlign = TextAlign.Center)
        }
        if (onRetry != null) {
            Spacer(Modifier.size(20.dp))
            MatineeButton(onClick = onRetry, look = ButtonLook.Outline) {
                LucideIcon(Lucide.RefreshCw, null, size = 16.dp)
                Text(stringResource(R.string.common_retry))
            }
        }
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

/** A small rounded box with a short fact, like an age rating or "1080p". */
@Composable
fun Badge(text: String, modifier: Modifier = Modifier, outlined: Boolean = false) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = Palette.Foreground.copy(alpha = 0.85f),
        maxLines = 1,
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .then(
                if (outlined) Modifier.border(1.dp, Palette.Foreground.copy(alpha = 0.3f), RoundedCornerShape(4.dp))
                else Modifier.background(Palette.Foreground.copy(alpha = 0.12f)),
            )
            .padding(horizontal = 6.dp, vertical = 1.dp),
    )
}

@Composable
fun Gap(size: Dp) = Spacer(Modifier.size(size))
