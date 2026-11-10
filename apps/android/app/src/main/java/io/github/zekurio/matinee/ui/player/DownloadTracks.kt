package io.github.zekurio.matinee.ui.player

import io.github.zekurio.matinee.api.AudioTrack
import io.github.zekurio.matinee.api.ORIGINAL_LANGUAGE
import io.github.zekurio.matinee.api.PlaybackPreferences
import io.github.zekurio.matinee.api.SubtitleDelivery
import io.github.zekurio.matinee.api.SubtitleMode
import io.github.zekurio.matinee.api.SubtitleSource
import io.github.zekurio.matinee.api.SubtitleTrack
import java.util.Locale

/*
 * Which audio and subtitles a download starts with, and who draws them.
 * A file from the server gets all of that from `playback.start`. A
 * download plays without the server, so it can't ask, and picks here the
 * way the player did before the server decided.
 */

/** `pt-BR` and `pt` are the same language here. */
private fun baseLanguage(tag: String?): String? = tag?.let { Locale.forLanguageTag(it).language.ifEmpty { it.lowercase() } }

private fun sameLanguage(a: String?, b: String?): Boolean {
    val base = baseLanguage(a)
    return base != null && base == baseLanguage(b)
}

private val deviceLanguage: String get() = Locale.getDefault().language.ifEmpty { "en" }

private fun isCommentary(track: AudioTrack) = Regex("commentary", RegexOption.IGNORE_CASE).containsMatchIn(track.label)

/**
 * The track for [language] (`original` for the title's own), else the
 * file's primary one; in place of one this device can't decode, a track in
 * the same language that it can.
 */
fun downloadAudio(tracks: List<AudioTrack>, language: String?, originalLanguage: String?): AudioTrack? {
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
    return standIn ?: wanted
}

/** Text the screen draws, from the WebVTT saved beside the download. */
private fun drawable(track: SubtitleTrack) = track.delivery == SubtitleDelivery.WEBVTT

/** The full or forced track for a language: the exact tag first, then the file's default, then one without SDH. */
private fun bestInLanguage(tracks: List<SubtitleTrack>, language: String?, forced: Boolean = false): SubtitleTrack? =
    tracks.filter { it.forced == forced && sameLanguage(it.language, language) }
        .maxByOrNull { (if (it.language == language) 4 else 0) + (if (it.default) 2 else 0) + (if (it.sdh) 0 else 1) }

private fun forcedTrack(tracks: List<SubtitleTrack>, audioLanguage: String?, language: String) =
    bestInLanguage(tracks, audioLanguage, true) ?: bestInLanguage(tracks, language, true)

/** The subtitle a download starts with, or null for off, by the preferences' subtitle mode. */
fun downloadSubtitle(tracks: List<SubtitleTrack>, audioLanguage: String?, preferences: PlaybackPreferences): SubtitleTrack? {
    val shown = tracks.filter(::drawable)
    val language = preferences.subtitleLanguage ?: deviceLanguage
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
 * Who draws [track] of a download: the engine draws a picture track, like
 * PGS, from a download that's the file as it is, and mpv an ASS or SSA
 * track there with its styling and fonts. The screen draws text from the
 * WebVTT saved beside it, or from [url] when it wasn't saved.
 */
fun downloadSubtitleShow(track: SubtitleTrack?, mpv: Boolean, url: String): SubtitleShow {
    if (track == null) return SubtitleShow.Off
    val stream = streamIndex(track)
    val picture = track.delivery == SubtitleDelivery.PGS || track.delivery == SubtitleDelivery.BURN_IN
    val styled = track.format == "ASS" || track.format == "SSA"
    return when {
        stream != null && track.source == SubtitleSource.EMBEDDED && (picture || (mpv && styled)) -> SubtitleShow.InFile(track, stream)
        drawable(track) -> SubtitleShow.Screen(track, url)
        else -> SubtitleShow.Off
    }
}
