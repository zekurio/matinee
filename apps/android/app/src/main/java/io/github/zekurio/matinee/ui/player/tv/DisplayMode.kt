package io.github.zekurio.matinee.ui.player.tv

import android.os.Build
import android.util.Log
import android.view.Display
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalContext
import io.github.zekurio.matinee.ui.player.activity
import kotlin.math.abs
import kotlin.math.roundToInt

private const val TAG = "MatineeDisplayMode"

/** How close a refresh rate must come to a multiple of the frame rate, in Hz, to count as exact. */
private const val EXACT_HZ = 0.01

/** How close one may come at all, as 24 Hz for a 23.976 fps file when no 23.976 Hz mode exists. */
private const val NEAR_HZ = 0.05

/**
 * The refresh rate among [rates] that plays [fps] evenly: an exact
 * multiple before a near one, and the lowest multiple first, so 24 fps
 * takes 24 Hz before 48 or 120. Null when none fits, or for no frame rate.
 */
internal fun matchingRefreshRate(rates: List<Float>, fps: Double?): Float? {
    if (fps == null || !fps.isFinite() || fps <= 0) return null
    data class Fit(val rate: Float, val multiple: Int, val off: Double)
    return rates.mapNotNull { rate ->
        val multiple = (rate / fps).roundToInt()
        if (multiple < 1) return@mapNotNull null
        val off = abs(rate - multiple * fps)
        if (off > NEAR_HZ * multiple) null else Fit(rate, multiple, off)
    }.sortedWith(compareBy({ it.off > EXACT_HZ * it.multiple }, { it.multiple }, { it.off })).firstOrNull()?.rate
}

/**
 * Asks the display for a mode at the video's [frameRate], which the server
 * sends on the item's probe, keeping the resolution it has. Media3 and mpv
 * set the frame rate on their surfaces too, but that only switches when
 * the display can do it without a pause, which a TV going from 60 to 24 Hz
 * mostly can't; a window's preferred mode switches either way. It lets go
 * when the player closes.
 */
@Composable
internal fun MatchDisplayMode(frameRate: Double?, enabled: Boolean) {
    val activity = LocalContext.current.activity()
    DisposableEffect(activity, frameRate, enabled) {
        val window = activity?.window
        if (window == null || !enabled) return@DisposableEffect onDispose {}
        val display: Display? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            activity.display
        } else {
            @Suppress("DEPRECATION")
            activity.windowManager.defaultDisplay
        }
        val current = display?.mode
        if (current == null) return@DisposableEffect onDispose {}
        val sameSize = display.supportedModes.filter {
            it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight
        }
        val rate = matchingRefreshRate(sameSize.map { it.refreshRate }, frameRate)
        val mode = sameSize.firstOrNull { it.refreshRate == rate }
        Log.i(
            TAG,
            "video ${frameRate ?: "unknown"} fps, display ${current.physicalWidth}x${current.physicalHeight} " +
                "at ${current.refreshRate} Hz, modes ${sameSize.map { it.refreshRate }}: " +
                if (mode != null) "asking for mode ${mode.modeId} at ${mode.refreshRate} Hz" else "none fits, keeping ${current.refreshRate} Hz",
        )
        if (mode == null) return@DisposableEffect onDispose {}
        window.attributes = window.attributes.also { it.preferredDisplayModeId = mode.modeId }
        onDispose {
            window.attributes = window.attributes.also { it.preferredDisplayModeId = 0 }
            Log.i(TAG, "player closed, letting go of mode ${mode.modeId}")
        }
    }
}
