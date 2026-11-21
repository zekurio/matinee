package io.github.zekurio.matinee.display

import android.app.Activity
import android.os.Build
import android.util.Log
import android.view.Display

private const val TAG = "MatineeDisplayMode"

/**
 * The screen's modes for the TV player, as the Kotlin app's
 * `MatchDisplayMode` asked them: Dart picks the rate that plays the
 * video's frame rate evenly, and this asks the window for that mode,
 * keeping the resolution it has. Media3 and mpv set the frame rate on
 * their surfaces too, but that only switches when the display can do it
 * without a pause, which a TV going from 60 to 24 Hz mostly can't.
 */
class DisplayBridge(private val activity: Activity) : DisplayApi {
    private fun display(): Display? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        activity.display
    } else {
        @Suppress("DEPRECATION")
        activity.windowManager.defaultDisplay
    }

    private fun sameSize(): List<Display.Mode> {
        val display = display() ?: return emptyList()
        val current = display.mode
        return display.supportedModes.filter {
            it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight
        }
    }

    override fun refreshRates(): List<Double> = sameSize().map { it.refreshRate.toDouble() }

    override fun preferRefreshRate(rate: Double?) {
        val window = activity.window ?: return
        val mode = rate?.let { wanted -> sameSize().firstOrNull { it.refreshRate.toDouble() == wanted } }
        val current = display()?.mode
        Log.i(
            TAG,
            if (mode != null) {
                "display at ${current?.refreshRate} Hz, asking for mode ${mode.modeId} at ${mode.refreshRate} Hz"
            } else {
                "letting go of the preferred mode"
            },
        )
        window.attributes = window.attributes.also { it.preferredDisplayModeId = mode?.modeId ?: 0 }
    }
}
