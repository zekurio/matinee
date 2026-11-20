package io.github.zekurio.matinee.player.system

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.util.Rational
import android.view.WindowManager
import io.flutter.plugin.common.BinaryMessenger
import kotlin.math.roundToInt
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * What the player asks of the device around the video, as the Kotlin
 * app's `DeviceLevels` and `rememberPictureInPicture`: the window's own
 * brightness, which a swipe sets and the player puts back, the media
 * volume, and picture in picture. Pigeon calls these on the main thread.
 */
internal class PlayerSystem(private val activity: Activity, messenger: BinaryMessenger) : PlayerSystemApi {
    private val audio = activity.getSystemService(AudioManager::class.java)
    private val events = PlayerSystemEventsApi(messenger)
    private val scope = MainScope()

    /** The player wants the small window when the app is left, as while a video plays. */
    private var auto = false

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

    override fun hasPictureInPicture(): Boolean =
        activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)

    override fun inPictureInPicture(): Boolean = activity.isInPictureInPictureMode

    override fun enterPictureInPicture(): Boolean =
        runCatching { activity.enterPictureInPictureMode(params(auto).build()) }.getOrDefault(false)

    override fun setAutoPictureInPicture(enabled: Boolean) {
        auto = enabled
        // From Android 12 the system shrinks the app itself as it leaves,
        // which animates better than entering from the leave hint.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            runCatching { activity.setPictureInPictureParams(params(enabled).build()) }
        }
    }

    private fun params(auto: Boolean): PictureInPictureParams.Builder =
        PictureInPictureParams.Builder().setAspectRatio(ASPECT).apply {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) setAutoEnterEnabled(auto)
        }

    /** Home or Recents before Android 12, where nothing enters by itself. */
    fun userLeaving() {
        if (auto && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) enterPictureInPicture()
    }

    fun pictureInPictureChanged(active: Boolean) {
        scope.launch {
            try {
                events.pictureInPictureChanged(active)
            } catch (failure: Exception) {
                // Nothing in Dart listens before the player opens.
                Log.d(TAG, "Dropped a picture in picture change", failure)
            }
        }
    }

    fun release() {
        scope.cancel()
    }

    private companion object {
        const val TAG = "MatineePlayerSystem"

        /** The Kotlin player's shape for the small window, whatever the video's. */
        val ASPECT = Rational(16, 9)
    }
}
