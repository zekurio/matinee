package io.github.zekurio.matinee.ui.player

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.mutableStateOf
import androidx.core.content.edit
import io.github.zekurio.matinee.api.PlaybackQuality
import kotlin.properties.ReadWriteProperty
import kotlin.reflect.KProperty

/** The file as it is, the quality every other one is an encode of. The ladder comes from `playback.options`. */
const val ORIGINAL_QUALITY = PlaybackQuality.ORIGINAL

/** Lets the player pick a codec, as the web's `auto` choice does. */
const val AUTOMATIC = "auto"

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

/**
 * What the player keeps on this device, as the web keeps it per browser:
 * the quality videos start in, the codecs encodes come in, the decoders,
 * and how subtitles look. Languages and skips follow the account instead. Reads are
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

    private fun float(key: String, default: Float) =
        Stored(key, prefs.getFloat(key, default)) { k, v -> putFloat(k, v) }

    private inline fun <reified E : Enum<E>> enum(key: String, default: E): Stored<E> {
        val saved = prefs.getString(key, null)
        return Stored(key, enumValues<E>().firstOrNull { it.name == saved } ?: default) { k, v -> putString(k, v.name) }
    }
}
