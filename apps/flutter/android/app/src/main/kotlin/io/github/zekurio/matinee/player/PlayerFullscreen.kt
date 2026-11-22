package io.github.zekurio.matinee.player

import android.app.Activity
import android.content.pm.ActivityInfo
import android.view.WindowManager
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat.Type
import androidx.core.view.WindowInsetsControllerCompat

/** Saves the activity's window settings for the lifetime of the player route. */
internal class PlayerFullscreen(private val activity: Activity) {
    private var owner: Long? = null
    private var previous: WindowState? = null

    fun set(id: Long, enabled: Boolean) {
        if (!enabled) {
            if (owner == id) restore()
            return
        }
        val window = activity.window
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        if (previous == null) {
            val insets = ViewCompat.getRootWindowInsets(window.decorView)
            previous = WindowState(
                activity.requestedOrientation,
                controller.systemBarsBehavior,
                insets?.isVisible(Type.statusBars()) ?: true,
                insets?.isVisible(Type.navigationBars()) ?: true,
                window.attributes.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON != 0,
            )
        }
        owner = id
        if (activity.resources.configuration.smallestScreenWidthDp < 600) {
            activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(Type.systemBars())
    }

    fun restore() {
        val state = previous ?: return
        owner = null
        previous = null
        val window = activity.window
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior = state.behavior
        if (state.statusVisible) controller.show(Type.statusBars()) else controller.hide(Type.statusBars())
        if (state.navigationVisible) controller.show(Type.navigationBars()) else controller.hide(Type.navigationBars())
        if (!state.keepAwake) window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        activity.requestedOrientation = state.orientation
    }

    private data class WindowState(
        val orientation: Int,
        val behavior: Int,
        val statusVisible: Boolean,
        val navigationVisible: Boolean,
        val keepAwake: Boolean,
    )
}
