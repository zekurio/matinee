package io.github.zekurio.matinee.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.components.RailArt
import io.github.zekurio.matinee.ui.components.SectionTitle
import io.github.zekurio.matinee.ui.components.railItemWidth
import io.github.zekurio.matinee.ui.kit.CardShape
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Shapes
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
 * Otherwise what failed is just left out, as on the web.
 */
internal fun failedOutright(libraries: Load<*>, sections: List<Load<List<*>>>): Boolean =
    libraries is Load.Failed && sections.all { it is Load.Failed || (it is Load.Ready && it.value.isEmpty()) }

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
            Box(Modifier.padding(horizontal = Gutter).width(180.dp).height(24.dp).clip(Shapes.Md).background(Palette.Secondary))
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
                    Box(Modifier.fillMaxWidth(0.7f).height(14.dp).clip(Shapes.Md).background(Palette.Secondary))
                    Gap(6.dp)
                    Box(Modifier.fillMaxWidth(0.45f).height(12.dp).clip(Shapes.Md).background(Palette.Secondary))
                }
            }
        }
    }
}

private const val SKELETON_CARDS = 4
