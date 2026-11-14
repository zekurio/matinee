package io.github.zekurio.matinee.ui.kit

import androidx.annotation.DrawableRes
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R

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
    val FastForward = R.drawable.lucide_fast_forward_filled
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
    val LoaderCircle = R.drawable.lucide_loader_circle
    val LibraryBig = R.drawable.lucide_library_big
    val Lock = R.drawable.lucide_lock
    val LockOpen = R.drawable.lucide_lock_open
    val LogIn = R.drawable.lucide_log_in
    val LogOut = R.drawable.lucide_log_out
    val Monitor = R.drawable.lucide_monitor
    val Pause = R.drawable.lucide_pause_filled
    val Paintbrush = R.drawable.lucide_paintbrush
    val Palette = R.drawable.lucide_palette
    val PictureInPicture = R.drawable.lucide_picture_in_picture_2
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
    val Sun = R.drawable.lucide_sun
    val Trash = R.drawable.lucide_trash_2
    val Tv = R.drawable.lucide_tv
    val TvPlay = R.drawable.lucide_tv_minimal_play
    val UserRound = R.drawable.lucide_user_round
    val Users = R.drawable.lucide_users
    val Volume = R.drawable.lucide_volume_2
    val VolumeX = R.drawable.lucide_volume_x
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

/** Content color for what sits on [background]. */
@Composable
fun OnColor(color: Color, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalContentColor provides color, content = content)
}
