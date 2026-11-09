package io.github.zekurio.matinee.ui.player

import io.github.zekurio.matinee.api.AudioTrack
import io.github.zekurio.matinee.api.ORIGINAL_LANGUAGE
import io.github.zekurio.matinee.api.PlaybackPreferences
import io.github.zekurio.matinee.api.SubtitleDelivery
import io.github.zekurio.matinee.api.SubtitleMode
import io.github.zekurio.matinee.api.SubtitleTrack
import java.util.Locale

/*
 * Which audio and subtitles a file starts with, as the web player picks
 * them (apps/web/src/components/playback-source.ts and lib/subtitles.ts).
 */

/** `pt-BR` and `pt` are the same language here. */
fun baseLanguage(tag: String?): String? = tag?.let { Locale.forLanguageTag(it).language.ifEmpty { it.lowercase() } }

fun sameLanguage(a: String?, b: String?): Boolean {
    val base = baseLanguage(a)
    return base != null && base == baseLanguage(b)
}

val deviceLanguage: String get() = Locale.getDefault().language.ifEmpty { "en" }

private fun isCommentary(track: AudioTrack) = Regex("commentary", RegexOption.IGNORE_CASE).containsMatchIn(track.label)

data class AudioChoice(
    /** The track a player plays from the file by itself. */
    val primary: AudioTrack?,
    /** The track the preferences ask for, decodable or not. */
    val wanted: AudioTrack?,
    /** What plays until the viewer picks: [wanted], or a decodable track in its language in place of it. */
    val preferred: AudioTrack?,
)

/**
 * The track for [language] (`original` for the title's own), else the
 * file's primary one; in place of one this device can't decode, a track in
 * the same language that it can, so the server needn't convert it.
 */
fun audioChoice(tracks: List<AudioTrack>, language: String?, originalLanguage: String?): AudioChoice {
    val primary = tracks.firstOrNull { it.primary } ?: tracks.firstOrNull()
    val target = if (language == ORIGINAL_LANGUAGE) originalLanguage else language
    val inLanguage = target?.let { lang ->
        tracks.filter { sameLanguage(it.language, lang) && !isCommentary(it) }
            .let { matches -> matches.firstOrNull { it == primary } ?: matches.maxByOrNull { it.channels ?: 0 } }
    }
    val wanted = inLanguage ?: primary
    val standIn = if (wanted != null && !Capabilities.decodesAudio(wanted.codec) && wanted.language != null) {
        tracks.filter { it != wanted && it.language == wanted.language && Capabilities.decodesAudio(it.codec) && !isCommentary(it) }
            .maxByOrNull { it.channels ?: 0 }
    } else {
        null
    }
    return AudioChoice(primary, wanted, standIn ?: wanted)
}

/** Whether the player draws the track itself; the rest need an encode with it burned in. */
fun drawable(track: SubtitleTrack) = track.delivery == SubtitleDelivery.WEBVTT

/** A picture track, like PGS, inside the file, which ExoPlayer draws itself when the file plays. */
fun pictureInFile(track: SubtitleTrack) =
    track.source == "embedded" && (track.delivery == SubtitleDelivery.PGS || track.delivery == SubtitleDelivery.BURN_IN)

private fun subtitleLanguage(preferences: PlaybackPreferences) = preferences.subtitleLanguage ?: deviceLanguage

/** The full or forced track for a language: the exact tag first, then the file's default, then one without SDH. */
private fun bestInLanguage(tracks: List<SubtitleTrack>, language: String?, forced: Boolean = false): SubtitleTrack? =
    tracks.filter { it.forced == forced && sameLanguage(it.language, language) }
        .maxByOrNull { (if (it.language == language) 4 else 0) + (if (it.default) 2 else 0) + (if (it.sdh) 0 else 1) }

private fun forcedTrack(tracks: List<SubtitleTrack>, audioLanguage: String?, language: String) =
    bestInLanguage(tracks, audioLanguage, true) ?: bestInLanguage(tracks, language, true)

/** The track a file starts with, or null for off, by the preferences' subtitle mode. */
fun defaultSubtitle(tracks: List<SubtitleTrack>, audioLanguage: String?, preferences: PlaybackPreferences): SubtitleTrack? {
    val shown = tracks.filter(::drawable)
    val language = subtitleLanguage(preferences)
    val forced = { forcedTrack(shown, audioLanguage, language) }
    return when (preferences.subtitleMode) {
        SubtitleMode.OFF -> null
        SubtitleMode.FORCED -> forced()
        SubtitleMode.ALWAYS -> bestInLanguage(shown, language) ?: forced()
        SubtitleMode.FOREIGN ->
            if (audioLanguage != null && !sameLanguage(audioLanguage, language)) bestInLanguage(shown, language) ?: forced()
            else forced()
        else -> {
            forced() ?: run {
                // Some muxers mark every track default, which says nothing.
                val flagged = shown.filter { it.default }
                if (shown.size > 1 && flagged.size == shown.size) null else flagged.firstOrNull()
            }
        }
    }
}

/**
 * What a pick in the player makes of the preferences when they remember
 * picks: a full track turns subtitles on in its language, a forced track or
 * off goes to forced tracks only. Off stays off.
 */
fun rememberPick(track: SubtitleTrack?, preferences: PlaybackPreferences, audioLanguage: String?): PlaybackPreferences {
    val mode = preferences.subtitleMode
    if (track == null) return preferences.copy(subtitleMode = if (mode == SubtitleMode.OFF) SubtitleMode.OFF else SubtitleMode.FORCED)
    val language = track.language ?: preferences.subtitleLanguage
    if (track.forced) return preferences.copy(subtitleMode = SubtitleMode.FORCED, subtitleLanguage = language)
    val foreign = mode == SubtitleMode.FOREIGN && audioLanguage != null && !sameLanguage(audioLanguage, track.language)
    return preferences.copy(subtitleMode = if (foreign) SubtitleMode.FOREIGN else SubtitleMode.ALWAYS, subtitleLanguage = language)
}
