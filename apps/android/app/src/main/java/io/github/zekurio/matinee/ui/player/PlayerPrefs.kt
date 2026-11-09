package io.github.zekurio.matinee.ui.player

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.mutableStateOf
import androidx.core.content.edit
import kotlin.properties.ReadWriteProperty
import kotlin.reflect.KProperty

/** The encodes the player's quality menu offers, as PLAYBACK_QUALITIES in the contract. */
data class Quality(val id: String, val width: Int, val height: Int, val bitrate: Int)

const val ORIGINAL_QUALITY = "original"

/** Lets the player pick a codec, as the web's `auto` choice does. */
const val AUTOMATIC = "auto"

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

/** Which of the device's decoders the player tries first. */
enum class Decoders { HARDWARE, SOFTWARE }

/** What plays the video: Media3's ExoPlayer, or mpv with its own FFmpeg and libass. */
enum class PlayerEngine { EXOPLAYER, MPV }

enum class SubtitleColor { WHITE, YELLOW, CYAN, GREEN }

/** What sits behind each line of a subtitle. */
enum class SubtitleBackground { NONE, SHADED, BLACK }

/** The app offers the first three; the system's caption style can also ask for the raised and depressed edges. */
enum class SubtitleEdge { SHADOW, OUTLINE, NONE, RAISED, DEPRESSED }

/** The edges Settings offers for the app's own look. */
val OWN_SUBTITLE_EDGES = listOf(SubtitleEdge.SHADOW, SubtitleEdge.OUTLINE, SubtitleEdge.NONE)

/** How much bigger than normal subtitles draw. */
val SUBTITLE_SCALES = listOf(0.75f, 1f, 1.25f, 1.5f, 2f)

/** How far a skip goes, in seconds. */
val SKIP_STEPS = listOf(5, 10, 15, 30)

/**
 * What the player keeps on this device, as the web keeps it per browser:
 * the quality videos start in, the codecs encodes come in, the decoders,
 * and how subtitles look. Languages follow the account instead. Reads are
 * Compose state, so settings and the player show a change at once.
 */
class PlayerPrefs(context: Context) {
    private val prefs = context.getSharedPreferences("player", Context.MODE_PRIVATE)

    var quality by string("quality", ORIGINAL_QUALITY)

    /** The codec encodes come in: one of TRANSCODE_VIDEO_CODECS, or [AUTOMATIC]. */
    var videoCodec by string("video_codec", AUTOMATIC)

    /** The codec streams convert audio to: Opus, AAC, or [AUTOMATIC]. */
    var audioCodec by string("audio_codec", AUTOMATIC)

    /** Formats the device plays that streams convert anyway, as the web's passthrough switches. */
    var convertAudio by strings("convert_audio")

    var engine by enum("engine", PlayerEngine.EXOPLAYER)

    var decoders by enum("decoders", Decoders.HARDWARE)

    var skipSeconds by int("skip_seconds", 10)

    /** Count down to the next episode and start it. */
    var autoplayNext by boolean("autoplay_next", true)

    /** The video fills the screen, cut at its edges, rather than showing whole; a pinch switches. */
    var fillScreen by boolean("fill_screen", false)

    /** Keep playing in a small window on leaving the app. */
    var pictureInPicture by boolean("picture_in_picture", true)

    /** Draw subtitles as the system's caption settings say, instead of the choices below. */
    var subtitleSystemStyle by boolean("subtitle_system_style", false)
    var subtitleScale by float("subtitle_scale", 1f)
    var subtitleColor by enum("subtitle_color", SubtitleColor.WHITE)
    var subtitleBackground by enum("subtitle_background", SubtitleBackground.SHADED)
    var subtitleEdge by enum("subtitle_edge", SubtitleEdge.SHADOW)

    private inner class Stored<T>(
        private val key: String,
        initial: T,
        private val write: SharedPreferences.Editor.(String, T) -> Unit,
    ) : ReadWriteProperty<Any?, T> {
        private val state = mutableStateOf(initial)

        override fun getValue(thisRef: Any?, property: KProperty<*>): T = state.value

        override fun setValue(thisRef: Any?, property: KProperty<*>, value: T) {
            state.value = value
            prefs.edit { write(key, value) }
        }
    }

    private fun string(key: String, default: String) =
        Stored(key, prefs.getString(key, null) ?: default) { k, v -> putString(k, v) }

    private fun strings(key: String) =
        Stored(key, prefs.getStringSet(key, null)?.toSet().orEmpty()) { k, v -> putStringSet(k, v) }

    private fun boolean(key: String, default: Boolean) =
        Stored(key, prefs.getBoolean(key, default)) { k, v -> putBoolean(k, v) }

    private fun int(key: String, default: Int) =
        Stored(key, prefs.getInt(key, default)) { k, v -> putInt(k, v) }

    private fun float(key: String, default: Float) =
        Stored(key, prefs.getFloat(key, default)) { k, v -> putFloat(k, v) }

    private inline fun <reified E : Enum<E>> enum(key: String, default: E): Stored<E> {
        val saved = prefs.getString(key, null)
        return Stored(key, enumValues<E>().firstOrNull { it.name == saved } ?: default) { k, v -> putString(k, v.name) }
    }
}
