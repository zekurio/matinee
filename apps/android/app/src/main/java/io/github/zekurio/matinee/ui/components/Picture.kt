package io.github.zekurio.matinee.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
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

/** The icons the web app draws, from lucide (see scripts/lucide.py). */
object Lucide {
    val ArrowLeft = R.drawable.lucide_arrow_left
    val ArrowUpDown = R.drawable.lucide_arrow_up_down
    val AudioLines = R.drawable.lucide_audio_lines
    val Calendar = R.drawable.lucide_calendar
    val CalendarClock = R.drawable.lucide_calendar_clock
    val CalendarOff = R.drawable.lucide_calendar_off
    val CameraOff = R.drawable.lucide_camera_off
    val Captions = R.drawable.lucide_captions
    val Check = R.drawable.lucide_check
    val ChevronDown = R.drawable.lucide_chevron_down
    val ChevronLeft = R.drawable.lucide_chevron_left
    val ChevronRight = R.drawable.lucide_chevron_right
    val CircleAlert = R.drawable.lucide_circle_alert
    val CircleCheck = R.drawable.lucide_circle_check
    val Clock = R.drawable.lucide_clock
    val CloudOff = R.drawable.lucide_cloud_off
    val Download = R.drawable.lucide_download
    val Ellipsis = R.drawable.lucide_ellipsis
    val Film = R.drawable.lucide_film
    val FolderPlus = R.drawable.lucide_folder_plus
    val GalleryHorizontalEnd = R.drawable.lucide_gallery_horizontal_end
    val Heart = R.drawable.lucide_heart
    val HeartFilled = R.drawable.lucide_heart_filled
    val House = R.drawable.lucide_house
    val Image = R.drawable.lucide_image
    val ImageUp = R.drawable.lucide_image_up
    val Info = R.drawable.lucide_info
    val KeyRound = R.drawable.lucide_key_round
    val Link = R.drawable.lucide_link
    val List = R.drawable.lucide_list
    val ListChecks = R.drawable.lucide_list_checks
    val ListFilter = R.drawable.lucide_list_filter
    val LibraryBig = R.drawable.lucide_library_big
    val LogIn = R.drawable.lucide_log_in
    val LogOut = R.drawable.lucide_log_out
    val Monitor = R.drawable.lucide_monitor
    val Pause = R.drawable.lucide_pause_filled
    val Paintbrush = R.drawable.lucide_paintbrush
    val Palette = R.drawable.lucide_palette
    val Play = R.drawable.lucide_play_filled
    val PlayOutline = R.drawable.lucide_play
    val Plus = R.drawable.lucide_plus
    val Popcorn = R.drawable.lucide_popcorn
    val RefreshCw = R.drawable.lucide_refresh_cw
    val RotateCcw = R.drawable.lucide_rotate_ccw
    val RotateCw = R.drawable.lucide_rotate_cw
    val ScanQrCode = R.drawable.lucide_scan_qr_code
    val Search = R.drawable.lucide_search
    val SearchX = R.drawable.lucide_search_x
    val Server = R.drawable.lucide_server
    val Settings = R.drawable.lucide_settings
    val Shield = R.drawable.lucide_shield
    val Smartphone = R.drawable.lucide_smartphone
    val Star = R.drawable.lucide_star_filled
    val Trash = R.drawable.lucide_trash_2
    val Tv = R.drawable.lucide_tv
    val TvPlay = R.drawable.lucide_tv_minimal_play
    val UserRound = R.drawable.lucide_user_round
    val Users = R.drawable.lucide_users
    val X = R.drawable.lucide_x
}

@Composable
fun LucideIcon(
    @DrawableRes icon: Int,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    size: Dp = 20.dp,
    tint: Color = LocalContentColor.current,
) {
    Icon(painterResource(icon), contentDescription, modifier.size(size), tint = tint)
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

/** Content color for what sits on [background]. */
@Composable
fun OnColor(color: Color, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalContentColor provides color, content = content)
}

/** A box filled with a tone, for art that hasn't loaded or doesn't exist. */
fun Modifier.tone(key: String) = background(toneBrush(key))
