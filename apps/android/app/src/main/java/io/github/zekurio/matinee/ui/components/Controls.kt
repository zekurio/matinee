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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import io.github.zekurio.matinee.ui.theme.Palette

/** The web's 0.625rem radius. */
val ControlShape = RoundedCornerShape(10.dp)
val CardShape = RoundedCornerShape(6.dp)

/** The page gutter on phones. */
val Gutter = 16.dp

enum class ButtonLook { Primary, Secondary, Frosted, Outline, Ghost }

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
    content: @Composable RowScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val (background, foreground) = when (look) {
        ButtonLook.Primary -> Palette.Accent to Color.Black
        ButtonLook.Secondary -> Palette.Secondary to Palette.Foreground
        ButtonLook.Frosted -> Palette.Foreground.copy(alpha = 0.15f) to Palette.Foreground
        ButtonLook.Outline -> Color.Transparent to Palette.Foreground
        ButtonLook.Ghost -> Color.Transparent to Palette.Foreground
    }
    Row(
        modifier
            .heightIn(min = height)
            .clip(ControlShape)
            .background(if (enabled) background else background.copy(alpha = background.alpha * 0.5f))
            .then(if (look == ButtonLook.Outline) Modifier.border(1.dp, Palette.Border, ControlShape) else Modifier)
            .then(if (look == ButtonLook.Frosted) Modifier.border(1.dp, Palette.Foreground.copy(alpha = 0.1f), ControlShape) else Modifier)
            .focusRing(interaction, ControlShape)
            .clickable(interaction, indication = androidx.compose.material3.ripple(), enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(contentPadding),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OnColor(if (enabled) foreground else foreground.copy(alpha = 0.5f)) {
            androidx.compose.material3.ProvideTextStyle(MaterialTheme.typography.labelLarge) { content() }
        }
    }
}

/** A round button with one icon, like the watched and favorite buttons on a title. */
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

/** A filter or library chip: filled when it's the current one. */
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
            .clickable(interaction, indication = androidx.compose.material3.ripple(), role = Role.Tab, onClick = onClick)
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
        LucideIcon(Lucide.Check, stringResource(R.string.media_watched), size = size * 0.6f, tint = Color.Black)
    }
}

/** A thin bar of how much of a file was watched, along the bottom of its picture. */
@Composable
fun ProgressBar(progress: Float, modifier: Modifier = Modifier, height: Dp = 4.dp) {
    Box(modifier.fillMaxWidth().height(height).background(Color.White.copy(alpha = 0.25f))) {
        Box(Modifier.fillMaxWidth(progress.coerceIn(0f, 1f)).fillMaxSize().background(Color.White))
    }
}

@Composable
fun LoadingBox(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = Palette.Accent, strokeWidth = 3.dp, modifier = Modifier.size(32.dp))
    }
}

/** What failed, with a way to try again. */
@Composable
fun ErrorBox(title: String, message: String?, onRetry: (() -> Unit)?, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxSize().padding(32.dp),
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

@Composable
fun HGap(size: Dp) = Spacer(Modifier.width(size))
