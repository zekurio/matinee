package io.github.zekurio.matinee.ui

import android.content.res.Resources
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.DisplayAudioStream
import io.github.zekurio.matinee.api.MediaItem
import java.text.DateFormat
import java.time.LocalDate
import java.time.ZoneId
import java.util.Date
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

/** Names from the server, with episode numbers worded in the app's language. */
data class ItemLabel(
    /** The show or movie name. For loose files, the top folder or the file's title. */
    val showName: String,
    val year: String?,
    /** The episode's name, "Episode 4", or the movie's name. */
    val title: String,
    /** Neither the provider nor the file name gave the episode a name. */
    val untitled: Boolean,
    /** S02E01, for episodes. */
    val code: String?,
)

fun itemLabel(item: MediaItem, res: Resources): ItemLabel {
    val label = item.label
    val name = label.title ?: label.episodeNumber?.let { res.getString(R.string.media_episode, it) }
    return ItemLabel(
        showName = label.showName.ifEmpty { item.fileTitle },
        year = label.year,
        title = name.orEmpty().ifEmpty { item.fileTitle },
        untitled = label.untitled,
        code = label.code,
    )
}

/** "S2, E5", the way episode codes read in running text. */
fun episodeCode(item: MediaItem, res: Resources): String? {
    val season = item.seasonNumber ?: return null
    val number = item.episodeNumber ?: return null
    return if (season == 0) res.getString(R.string.media_special, number)
    else res.getString(R.string.media_episode_code, season, number)
}

/** "Episode 4", or "Special 4" in season 0. */
fun episodeNumber(item: MediaItem, res: Resources): String? {
    val number = item.episodeNumber ?: return null
    return if (item.seasonNumber == 0) res.getString(R.string.media_special, number)
    else res.getString(R.string.media_episode, number)
}

fun seasonName(number: Int?, res: Resources): String = when (number) {
    null -> res.getString(R.string.media_other_files)
    0 -> res.getString(R.string.media_specials)
    else -> res.getString(R.string.media_season, number)
}

/** Share of the file watched, 0 to 1, or null when unknown. */
fun progressRatio(item: MediaItem): Float? {
    val progress = item.progress ?: return null
    val duration = item.durationSeconds ?: return null
    if (progress.completed) return 1f
    if (duration <= 0) return null
    return (progress.positionSeconds / duration).toFloat().coerceIn(0f, 1f)
}

/** "12 min left", for files the person started. */
fun timeLeft(item: MediaItem, res: Resources): String? {
    val progress = item.progress ?: return null
    val duration = item.durationSeconds ?: return null
    if (progress.completed) return null
    val minutes = max(1, ((duration - progress.positionSeconds) / 60).roundToInt())
    return res.getString(R.string.media_time_left, minutes)
}

fun formatRuntime(minutes: Int?, res: Resources): String? {
    if (minutes == null || minutes <= 0) return null
    val hours = minutes / 60
    val rest = minutes % 60
    return when {
        hours == 0 -> res.getString(R.string.format_minutes, rest)
        rest == 0 -> res.getString(R.string.format_hours, hours)
        else -> res.getString(R.string.format_hours_minutes, hours, rest)
    }
}

/** A file's length in minutes: the provider's for an episode, else the file's. */
fun runtimeMinutes(item: MediaItem): Int? =
    item.episode?.runtimeMinutes ?: item.durationSeconds?.let { (it / 60).roundToInt() }

/** "1:02:35" or "4:05". */
fun formatClock(totalSeconds: Double): String {
    val seconds = max(0, totalSeconds.toInt())
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return if (h > 0) "%d:%02d:%02d".format(Locale.ROOT, h, m, s) else "%d:%02d".format(Locale.ROOT, m, s)
}

/** A YYYY-MM-DD date, as the device's language writes dates. */
fun formatDay(day: String?): String? {
    if (day == null) return null
    return runCatching {
        val date = LocalDate.parse(day).atStartOfDay(ZoneId.systemDefault()).toInstant()
        DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date.from(date))
    }.getOrNull()
}

/** An ISO time from the server, as a date in the device's language. */
fun formatInstant(value: String): String = runCatching {
    DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date.from(java.time.Instant.parse(value)))
}.getOrDefault(value)

fun formatRating(rating: Double): String = "%.1f".format(Locale.getDefault(), rating)

fun formatBytes(bytes: Long): String {
    val units = listOf("B", "kB", "MB", "GB", "TB")
    var value = bytes.toDouble()
    var unit = 0
    while (value >= 1000 && unit < units.lastIndex) {
        value /= 1000
        unit++
    }
    val number = if (value >= 10) value.roundToInt().toString() else "%.1f".format(Locale.getDefault(), value)
    return "$number ${units[unit]}"
}

/** Names for encode choices, which aren't probe streams. */
fun videoCodecName(codec: String) = if (codec == "h264") "H.264" else codec.uppercase()

/** Names for audio conversion choices, which aren't probe streams. */
private val AUDIO_FORMATS = mapOf(
    "aac" to "AAC", "ac3" to "AC-3", "eac3" to "E-AC-3", "flac" to "FLAC",
    "alac" to "ALAC", "opus" to "Opus", "mp3" to "MP3",
)

fun audioFormatName(codec: String) = AUDIO_FORMATS[codec] ?: codec.uppercase()

fun channelLayout(stream: DisplayAudioStream): String? = stream.layout

/** "1080p · HEVC · HDR10", the picture's part of a file's details. */
fun videoSummary(item: MediaItem): String? {
    val video = item.probe?.video ?: return null
    return listOfNotNull(video.resolution, video.format, video.dynamicRange).joinToString(" · ")
}

/**
 * "German, English" for tracks' BCP 47 tags, each language once in the
 * order given, in the device's language. Tracks that don't say are left
 * out; null when none say.
 */
fun languageList(tags: List<String?>): String? {
    val names = tags.filterNotNull()
        .map { java.util.Locale.forLanguageTag(it) }
        .distinctBy { it.language }
        .mapNotNull { locale ->
            locale.getDisplayLanguage(java.util.Locale.getDefault())
                .takeIf { it.isNotBlank() && it != locale.language }
                ?.replaceFirstChar { it.titlecase(java.util.Locale.getDefault()) }
        }
    return names.takeIf { it.isNotEmpty() }?.joinToString(", ")
}

/** Badges for a title page: resolution, dynamic range, and the main audio's layout. */
fun mediaFlags(item: MediaItem): List<String> {
    val probe = item.probe ?: return emptyList()
    val video = probe.video
    val main = probe.audio.firstOrNull { it.default } ?: probe.audio.firstOrNull()
    return listOfNotNull(video?.resolution, video?.dynamicRange, main?.layout)
}
