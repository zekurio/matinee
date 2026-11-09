package io.github.zekurio.matinee.ui

import android.content.res.Resources
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.AudioStream
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.TitleKind
import java.text.DateFormat
import java.time.LocalDate
import java.time.ZoneId
import java.util.Date
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

/*
 * Names and details of files, from apps/web/src/lib/media.ts: what the
 * metadata provider calls an episode where it knows, and what the file and
 * folder names say where it doesn't.
 */

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

private val EPISODE = Regex("""\bS(\d{1,2})E(\d{1,3})\b""", RegexOption.IGNORE_CASE)
private val TRAILER = Regex("""\s*(\[.*|\.[a-z0-9]{2,4})$""", RegexOption.IGNORE_CASE)
private val PLACEHOLDER = Regex("""^(tba|tbd|tbc|untitled|episode \d+)$""", RegexOption.IGNORE_CASE)
private val TRAILING_YEAR = Regex("""^(.*\S)\s*\(((?:19|20)\d{2})\)$""")

private fun pad(n: Int) = n.toString().padStart(2, '0')

fun itemLabel(item: MediaItem, res: Resources): ItemLabel {
    val parts = item.relativePath.split('/')
    val file = parts.last()
    val folders = parts.dropLast(1)
    val owner = item.title
    val match = EPISODE.find(file)

    val folderShow = folders.firstOrNull() ?: item.fileTitle.replace(EPISODE, "").trim()
    val folderMatch = TRAILING_YEAR.find(folderShow.trim())
    val showName = owner?.name ?: folderMatch?.groupValues?.get(1) ?: folderShow
    val year = owner?.year?.toString() ?: folderMatch?.groupValues?.get(2)

    if (owner?.kind == TitleKind.MOVIE) {
        return ItemLabel(showName, year, owner.name, untitled = false, code = null)
    }

    val season = item.seasonNumber ?: match?.groupValues?.get(1)?.toInt()
    val number = item.episodeNumber ?: match?.groupValues?.get(2)?.toInt()
    if (season == null || number == null) {
        return ItemLabel(showName, year, item.fileTitle, untitled = false, code = null)
    }
    val provided = item.episode?.name?.trim()?.takeIf { it.isNotEmpty() && !PLACEHOLDER.matches(it) }
    val fromFile = match?.let {
        file.substring(it.range.last + 1)
            .trimStart(' ', '.', '_', '-')
            .replace(TRAILER, "")
            .replace(Regex("[._]+"), " ")
            .trim()
            .takeIf { name -> name.isNotEmpty() && !PLACEHOLDER.matches(name) }
    }
    val name = provided ?: fromFile
    return ItemLabel(
        showName = showName,
        year = year,
        title = name ?: res.getString(R.string.media_episode, number),
        untitled = name == null,
        code = "S${pad(season)}E${pad(number)}",
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

/** "1080p" for 1920×800 too: wide films are cropped in height, not width. */
fun resolutionLabel(width: Int, height: Int): String = when {
    width >= 3200 || height >= 2000 -> "4K"
    width >= 2400 || height >= 1400 -> "1440p"
    width >= 1800 || height >= 1000 -> "1080p"
    width >= 1200 || height >= 700 -> "720p"
    else -> "${height}p"
}

private val HDR_LABELS = mapOf("hdr10" to "HDR10", "hlg" to "HLG", "dolby-vision" to "Dolby Vision")

private val VIDEO_CODECS = mapOf(
    "h264" to "H.264", "hevc" to "HEVC", "av1" to "AV1", "vp8" to "VP8", "vp9" to "VP9",
    "vvc" to "VVC", "mpeg2video" to "MPEG-2", "mpeg4" to "MPEG-4", "vc1" to "VC-1",
)

fun videoCodecName(codec: String) = VIDEO_CODECS[codec] ?: codec.uppercase()

/** The contract's audioFormatName for the codecs a stream may hold. */
private val AUDIO_FORMATS = mapOf(
    "aac" to "AAC", "ac3" to "AC-3", "eac3" to "E-AC-3", "flac" to "FLAC",
    "alac" to "ALAC", "opus" to "Opus", "mp3" to "MP3",
)

fun audioFormatName(codec: String) = AUDIO_FORMATS[codec] ?: codec.uppercase()

private val LAYOUT_NAMES = mapOf(
    "mono" to "Mono", "stereo" to "Stereo", "downmix" to "Stereo", "quad" to "4.0",
)
private val GUESSED_LAYOUTS = mapOf(1 to "Mono", 2 to "Stereo", 3 to "2.1", 4 to "4.0", 5 to "5.0", 6 to "5.1", 7 to "6.1", 8 to "7.1")
private val SPEAKER_COUNT = Regex("""^\d+\.\d+(\.\d+)?$""")

/** "5.1" for ffprobe's "5.1(side)", "Stereo" for "stereo". */
fun channelLayout(stream: AudioStream): String? {
    val name = stream.channelLayout?.substringBefore('(')?.trim()?.lowercase()
    if (name != null) {
        LAYOUT_NAMES[name]?.let { return it }
        if (SPEAKER_COUNT.matches(name)) return name
    }
    return stream.channels?.let { GUESSED_LAYOUTS[it] }
}

/** "1080p · HEVC · HDR10", the picture's part of a file's details. */
fun videoSummary(item: MediaItem): String? {
    val video = item.probe?.video ?: return null
    val hdr = if (video.hdr == "hdr10" && video.hdr10Plus) "HDR10+" else video.hdr?.let { HDR_LABELS[it] }
    return listOfNotNull(resolutionLabel(video.width, video.height), videoCodecName(video.codec), hdr).joinToString(" · ")
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
    val hdr = if (video?.hdr == "hdr10" && video.hdr10Plus) "HDR10+" else video?.hdr?.let { HDR_LABELS[it] }
    return listOfNotNull(
        video?.let { resolutionLabel(it.width, it.height) },
        hdr,
        main?.let(::channelLayout),
    )
}
