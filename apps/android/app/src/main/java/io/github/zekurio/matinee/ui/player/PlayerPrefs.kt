package io.github.zekurio.matinee.ui.player

import android.content.Context
import androidx.core.content.edit

/** The encodes the player's quality menu offers, as PLAYBACK_QUALITIES in the contract. */
data class Quality(val id: String, val width: Int, val height: Int, val bitrate: Int)

const val ORIGINAL_QUALITY = "original"

val QUALITIES = listOf(
    Quality("2160p-40", 3840, 2160, 40_000_000),
    Quality("1080p-20", 1920, 1080, 20_000_000),
    Quality("1080p-10", 1920, 1080, 10_000_000),
    Quality("720p-6", 1280, 720, 6_000_000),
    Quality("720p-4", 1280, 720, 4_000_000),
    Quality("480p-2", 854, 480, 2_000_000),
    Quality("360p-1", 640, 360, 1_000_000),
)

/** The encode to fall back to when the device can't play a file: the largest that fits. */
fun fallbackQuality(width: Int?): String =
    QUALITIES.firstOrNull { it.bitrate <= 20_000_000 && (width == null || it.width <= maxOf(width, 640)) }?.id
        ?: "720p-4"

/**
 * What the player keeps on this device, as the web keeps it per browser:
 * the quality videos start in. Languages follow the account instead.
 */
class PlayerPrefs(context: Context) {
    private val prefs = context.getSharedPreferences("player", Context.MODE_PRIVATE)

    var quality: String
        get() = prefs.getString("quality", ORIGINAL_QUALITY) ?: ORIGINAL_QUALITY
        set(value) = prefs.edit { putString("quality", value) }
}
