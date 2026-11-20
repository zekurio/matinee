package io.github.zekurio.matinee.player.system

import android.app.Activity
import android.media.AudioManager
import android.provider.Settings
import android.view.WindowManager
import kotlin.math.roundToInt

/**
 * The levels around the video, as the Kotlin app's `DeviceLevels`: the
 * window's own brightness, which a swipe sets and the player puts back,
 * and the media volume. Pigeon calls these on the main thread.
 */
internal class PlayerSystem(private val activity: Activity) : PlayerSystemApi {
    private val audio = activity.getSystemService(AudioManager::class.java)

    override fun levels(): LevelsMessage = LevelsMessage(brightness(), volume())

    private fun volume(): Double? {
        val audio = audio ?: return null
        if (audio.isVolumeFixed) return null
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        return if (max > 0) audio.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max else 0.0
    }

    override fun setVolume(level: Double): Double {
        val audio = audio ?: return 0.0
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        if (max <= 0) return 0.0
        val step = (level * max).roundToInt().coerceIn(0, max)
        // Do Not Disturb can refuse a change; the note then shows what it stayed at.
        runCatching { audio.setStreamVolume(AudioManager.STREAM_MUSIC, step, 0) }
        return volume() ?: 0.0
    }

    private fun brightness(): Double {
        val own = activity.window.attributes.screenBrightness
        if (own in 0f..1f) return own.toDouble()
        // Until a swipe sets one, the window follows the system's brightness, 0 to 255.
        val system = runCatching {
            Settings.System.getInt(activity.contentResolver, Settings.System.SCREEN_BRIGHTNESS)
        }.getOrNull()
        return system?.let { it / 255.0 } ?: 0.5
    }

    override fun setBrightness(brightness: Double?) {
        val window = activity.window
        window.attributes = window.attributes.apply {
            screenBrightness = brightness?.toFloat()?.coerceIn(0f, 1f)
                ?: WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
        }
    }
}
