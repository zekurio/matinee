package io.github.zekurio.matinee.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.Artwork
import io.github.zekurio.matinee.api.ArtworkSize
import io.github.zekurio.matinee.api.ImagePlaceholder
import io.github.zekurio.matinee.api.MatineeApi
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.ui.theme.Palette

/** The API while signed in, for screens and the images on them. */
val LocalApi = staticCompositionLocalOf<MatineeApi> { error("not signed in") }

/** An image to load, and the blurred stand-in to show until it does. */
data class ImageSource(val url: String, val placeholder: ImagePlaceholder? = null)

fun MatineeApi.art(artwork: Artwork?, size: ArtworkSize = ArtworkSize.Small): ImageSource? =
    artwork?.let { ImageSource(paths.artwork(it.id, size), it.placeholder) }

/** A frame from the file itself, which has no placeholder. */
fun MatineeApi.frame(itemId: String, large: Boolean = false) = ImageSource(paths.thumbnail(itemId, large))

/**
 * Landscape images for a file, best first: the episode's still, then a frame
 * from the file, then the show's backdrop; for a movie, its backdrop first.
 */
fun MatineeApi.landscape(item: MediaItem, size: ArtworkSize = ArtworkSize.Small): List<ImageSource> {
    val still = art(item.episode?.still, size)
    val backdrop = art(item.title?.images?.backdrop, size)
    val file = frame(item.id, size == ArtworkSize.Medium || size == ArtworkSize.Large)
    return if (item.title?.kind == TitleKind.MOVIE) listOfNotNull(backdrop, file)
    else listOfNotNull(still, file, backdrop)
}

/** The neutral gradient that stands in for missing art, the same one for the same key. */
fun toneBrush(key: String): Brush {
    var hash = 0
    for (char in key) hash = hash * 31 + char.code
    val (from, to) = Palette.Tones[Math.floorMod(hash, Palette.Tones.size)]
    return Brush.linearGradient(listOf(from, to))
}

/**
 * The first of [sources] that loads, over its blurred placeholder while it
 * loads. Nothing when every one fails, so what's beneath shows.
 */
@Composable
fun Picture(
    sources: List<ImageSource>,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    alignment: Alignment = Alignment.Center,
) {
    var index by rememberSaveable(sources.firstOrNull()?.url) { mutableIntStateOf(0) }
    val source = sources.getOrNull(index)
    Box(modifier) {
        val placeholder = sources.firstOrNull()?.placeholder
        if (placeholder != null) {
            val bitmap = remember(placeholder.blurhash) { BlurHash.decode(placeholder.blurhash) }
            if (bitmap != null) {
                Image(
                    bitmap.asImageBitmap(),
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop,
                )
            }
        }
        if (source != null) {
            AsyncImage(
                model = source.url,
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = contentScale,
                alignment = alignment,
                onError = { index++ },
            )
        }
    }
}

/** The sunset mark uses its own colors, independent of the server's accent. */
@Composable
fun LogoMark(modifier: Modifier = Modifier) {
    val mark = if (Palette.isDark) R.drawable.logo_mark_dark else R.drawable.logo_mark
    Image(painterResource(mark), contentDescription = null, modifier = modifier)
}

/**
 * The mark with the wordmark beside it, from brand/wordmark.py. [height] is
 * the word's, which the mark matches; the round letters dip a little below.
 */
@Composable
fun Logo(modifier: Modifier = Modifier, height: Dp = 24.dp) {
    val logo = painterResource(if (Palette.isDark) R.drawable.logo_dark else R.drawable.logo)
    // The drawable is 24 dp to the baseline, so scale its own size to [height].
    val size = with(LocalDensity.current) { logo.intrinsicSize.toDpSize() } * (height / 24.dp)
    Image(logo, contentDescription = stringResource(R.string.app_name), modifier = modifier.size(size))
}

/** A box filled with a tone, for art that hasn't loaded or doesn't exist. */
fun Modifier.tone(key: String) = background(toneBrush(key))
