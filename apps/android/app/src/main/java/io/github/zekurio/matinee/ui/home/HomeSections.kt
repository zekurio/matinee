package io.github.zekurio.matinee.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.components.ButtonLook
import io.github.zekurio.matinee.ui.components.CardShape
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.Gutter
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.MatineeButton
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.components.SectionTitle
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.theme.Palette

/** What a Home rail shows for its load: an empty answer is not a failure. */
internal sealed interface RailState<out T> {
    data object Loading : RailState<Nothing>

    data object Empty : RailState<Nothing>

    data class Failed(val message: String, val disconnected: Boolean = false) : RailState<Nothing>

    data class Shown<T>(val items: List<T>) : RailState<T>
}

internal fun <T> railState(load: Load<List<T>>): RailState<T> = when (load) {
    Load.Loading -> RailState.Loading
    is Load.Failed -> RailState.Failed(load.message, load.disconnected)
    is Load.Ready -> if (load.value.isEmpty()) RailState.Empty else RailState.Shown(load.value)
}

/**
 * Home is one error page only when nothing on it could show: the
 * libraries failed, and every other section failed or came back empty.
 * Otherwise each failed section says so in its place, under what did load.
 */
internal fun failedOutright(libraries: Load<*>, sections: List<Load<List<*>>>): Boolean =
    libraries is Load.Failed && sections.all { it is Load.Failed || (it is Load.Ready && it.value.isEmpty()) }

/**
 * Something on the page that didn't load or refresh, with a way to try
 * again. Smaller than an ErrorBox, so it fits in a section's place.
 */
@Composable
internal fun Notice(
    headline: String,
    message: String?,
    onRetry: (() -> Unit)?,
    modifier: Modifier = Modifier,
    retrying: Boolean = false,
    disconnected: Boolean = false,
) {
    // Without the server, the same icon and button as everywhere else; the words are for other failures.
    if (disconnected) {
        Row(
            modifier.fillMaxWidth().padding(horizontal = Gutter),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            LucideIcon(Lucide.CloudOff, stringResource(R.string.server_unreachable), size = 24.dp, tint = Palette.Muted)
            if (onRetry != null) {
                MatineeButton(onClick = onRetry, look = ButtonLook.Outline, enabled = !retrying, height = 36.dp) {
                    LucideIcon(Lucide.RefreshCw, null, size = 16.dp)
                    Text(stringResource(R.string.common_retry))
                }
            }
        }
        return
    }
    Row(
        modifier
            .fillMaxWidth()
            .padding(horizontal = Gutter)
            .clip(CardShape)
            .background(Palette.Card)
            .border(1.dp, Palette.Border, CardShape)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        LucideIcon(Lucide.CircleAlert, null, size = 20.dp, tint = Palette.Muted)
        Column(
            Modifier
                .weight(1f)
                .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        ) {
            Text(headline, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            if (!message.isNullOrBlank()) {
                Text(message, style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
            }
        }
        // An icon, so the words keep the row's width and stay a line or two.
        if (onRetry != null) {
            RoundIconButton(
                Lucide.RefreshCw,
                stringResource(R.string.common_retry),
                onRetry,
                size = 40.dp,
                iconSize = 18.dp,
                tint = Palette.Muted,
                background = Color.Transparent,
                enabled = !retrying,
            )
        }
    }
}

/** A rail's section that failed to load: its heading, so the reader knows which, and a [Notice]. */
@Composable
internal fun RailFailure(title: String, headline: String, message: String, onRetry: () -> Unit, retrying: Boolean = false, disconnected: Boolean = false) {
    Column(Modifier.fillMaxWidth()) {
        SectionTitle(title, Modifier.padding(horizontal = Gutter))
        Gap(12.dp)
        Notice(headline, message, onRetry, retrying = retrying, disconnected = disconnected)
    }
}

/**
 * Where a rail of [art] cards goes while it loads: its heading, or a bar
 * for one not known yet, over blank cards about as tall as the real ones.
 */
@Composable
internal fun RailSkeleton(title: String?, art: RailArt, onTitleClick: (() -> Unit)? = null) {
    val loading = stringResource(R.string.loading_in_progress)
    val width = railItemWidth(art)
    val aspect = if (art == RailArt.Landscape) 16f / 9f else 2f / 3f
    Column(Modifier.fillMaxWidth().semantics { contentDescription = loading }) {
        if (title != null) {
            SectionTitle(title, Modifier.padding(horizontal = Gutter), onTitleClick)
        } else {
            Box(Modifier.padding(horizontal = Gutter).width(180.dp).height(24.dp).clip(MaterialTheme.shapes.small).background(Palette.Secondary))
        }
        Gap(12.dp)
        LazyRow(
            contentPadding = PaddingValues(horizontal = Gutter),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            userScrollEnabled = false,
        ) {
            items(SKELETON_CARDS) {
                Column(Modifier.width(width)) {
                    Box(Modifier.fillMaxWidth().aspectRatio(aspect).clip(CardShape).background(Palette.Card))
                    Gap(10.dp)
                    Box(Modifier.fillMaxWidth(0.7f).height(14.dp).clip(MaterialTheme.shapes.small).background(Palette.Secondary))
                    Gap(6.dp)
                    Box(Modifier.fillMaxWidth(0.45f).height(12.dp).clip(MaterialTheme.shapes.small).background(Palette.Secondary))
                }
            }
        }
    }
}

private const val SKELETON_CARDS = 4
