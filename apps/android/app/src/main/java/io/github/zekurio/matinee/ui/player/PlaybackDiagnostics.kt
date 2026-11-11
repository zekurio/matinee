package io.github.zekurio.matinee.ui.player

import io.github.zekurio.matinee.api.AudioTrack
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.PlaybackDevice
import io.github.zekurio.matinee.api.PlaybackOptions
import io.github.zekurio.matinee.api.PlaybackQuality
import io.github.zekurio.matinee.api.PlaybackReason
import io.github.zekurio.matinee.api.PlaybackStart
import io.github.zekurio.matinee.api.PlaybackSubtitleMode
import io.github.zekurio.matinee.api.SubtitleTrack
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/*
 * A report of the latest playback, for working out why something won't
 * play. It stays in memory until the app closes or the viewer clears it,
 * and leaves the phone only when the viewer copies it. Nothing here sends
 * it anywhere.
 *
 * It holds codes, never text: every string in a report is a [Safe], which
 * only takes a value from a known list or a short code without the
 * characters a URL, a path, or a sentence needs. Titles, file names, the
 * server's address, the account, tokens, and error messages never reach
 * it; the error's typed code and the HTTP status do.
 *
 * This file is plain Kotlin, so the JVM tests run it. What reads Android
 * and Media3 lives in DiagnosticsProbe.kt.
 */

/** The most attempts a report keeps, the latest ones. */
const val MAX_ATTEMPTS = 12

/** The most tracks and decoders a report lists. */
const val MAX_TRACKS = 4
const val MAX_DECODERS = 4

/** How many of an error's causes a report names. */
const val MAX_CAUSES = 3

private const val MAX_TOKEN = 48

/**
 * A string that may go in a report: one from a known list, or a short code
 * of letters, digits, spaces, and `. _ - +`. Anything else becomes `other`.
 * This checks codes the app and Media3 produce, like `c2.android.avc.decoder`
 * or `Main 10`; it never cleans up free text.
 */
@JvmInline
value class Safe private constructor(val text: String) {
    override fun toString() = text

    companion object {
        val OTHER = Safe("other")

        private fun allowed(c: Char) = c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9' || c in "._-+ "

        /** A short code, as it is, or [OTHER]. Null for nothing. */
        fun token(value: String?, max: Int = MAX_TOKEN): Safe? {
            val trimmed = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            return if (trimmed.length <= max && trimmed.all(::allowed)) Safe(trimmed) else OTHER
        }

        /** [value] when [known] has it, in lower case, or [OTHER]. Null for nothing. */
        fun known(value: String?, known: Set<String>): Safe? {
            val lower = value?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
            return if (lower in known) Safe(lower) else OTHER
        }

        /** A MIME type like `video/avc`: a top-level type Media3 uses, then a short subtype. */
        fun mime(value: String?): Safe? {
            val lower = value?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
            val type = lower.substringBefore('/', "")
            val subtype = lower.substringAfter('/', "")
            val ok = type in MIME_TYPES && subtype.length in 1..32 && subtype.all { it in 'a'..'z' || it in '0'..'9' || it in ".-+_" }
            return if (ok) Safe(lower) else OTHER
        }

        /** An enum's name, which the app defines. */
        fun of(value: Enum<*>) = Safe(value.name.lowercase())

        /** Media3's constant names, like `ERROR_CODE_DECODING_FAILED`. */
        fun constant(value: String?) = token(value, 64)

        private val MIME_TYPES = setOf("video", "audio", "text", "application", "image")
    }
}

/** ffmpeg's codec names the server reports, as Capabilities knows them and a few more. */
val KNOWN_VIDEO_CODECS = setOf(
    "h264", "hevc", "av1", "vp9", "vp8", "mpeg2video", "mpeg1video", "mpeg4", "msmpeg4v3",
    "vc1", "wmv3", "h263", "theora", "prores", "mjpeg",
)

val KNOWN_AUDIO_CODECS = setOf(
    "aac", "mp3", "mp2", "opus", "vorbis", "flac", "alac", "ac3", "eac3", "ac4", "dts", "truehd", "mlp",
    "wmav2", "wmapro", "amr_nb",
)

/** The file extensions the server scans for. */
val KNOWN_CONTAINERS = setOf("mp4", "m4v", "mov", "webm", "mkv", "avi", "ts", "m2ts", "mts", "mpg", "mpeg", "ogv", "wmv", "flv")

/** The format names of subtitle tracks, as the server shows them. */
val KNOWN_SUBTITLE_FORMATS = setOf(
    "srt", "subrip", "ass", "ssa", "vtt", "webvtt", "pgs", "vobsub", "dvdsub", "dvb", "mov_text", "ttml", "teletext",
)

private val KNOWN_SUBTITLE_SOURCES = setOf("sidecar", "embedded")
private val KNOWN_DELIVERIES = setOf("webvtt", "pgs", "burn-in")
// The contract's quality ids, as the generated client lists them.
private val KNOWN_QUALITIES = PlaybackQuality.all.toSet()
private val KNOWN_REASONS = PlaybackReason.all.toSet()
private val KNOWN_HDR = setOf("hdr10", "hdr10+", "hlg", "dolby-vision", "dolby vision", "sdr")
private val KNOWN_SETTING_CODECS = KNOWN_VIDEO_CODECS + KNOWN_AUDIO_CODECS + AUTOMATIC

// What a device profile may say besides codec names: every codec, and every PCM format.
private val KNOWN_PROFILE_CODECS = KNOWN_SETTING_CODECS + "*" + "pcm_*"

fun safeVideoCodec(codec: String?) = Safe.known(codec, KNOWN_VIDEO_CODECS)

/** PCM comes in many forms, all named `pcm_` and a short code. */
fun safeAudioCodec(codec: String?): Safe? =
    if (codec != null && codec.lowercase().startsWith("pcm_")) Safe.token(codec.lowercase(), 16) else Safe.known(codec, KNOWN_AUDIO_CODECS)

fun safeCodecs(codecs: Collection<String>, max: Int = 8): List<Safe> =
    codecs.take(max).mapNotNull { Safe.known(it, KNOWN_PROFILE_CODECS) }

fun safeQuality(id: String?) = Safe.known(id, KNOWN_QUALITIES)

/** Where the video came from, as [Source] has it: the file, a copied stream, an encode as HLS or as one stream, or a download. */
enum class SourceMode { DIRECT, STREAM, HLS, ENCODE, LOCAL }

/** Why the player loaded a source. */
enum class AttemptReason { START, FALLBACK, RETRY, AUDIO_CHANGE, SUBTITLE_CHANGE, QUALITY_CHANGE }

/** How a source went: still loading, played, failed, left for another, or the player closed first. */
enum class AttemptOutcome { LOADING, PLAYING, FAILED, REPLACED, CLOSED }

/** Who draws the subtitle picked. */
enum class SubtitleRendering { SCREEN, PLAYER, BURN_IN }

/** What a track or decoder is for. */
enum class TrackKind { VIDEO, AUDIO, TEXT, OTHER }

/**
 * Things that went wrong beside the video, counted: a subtitle that didn't
 * load, a `playback.start` or `playback.seek` that failed, the server
 * saying nothing it knows plays here, and the server refusing the account:
 * its access rules the file out, or it plays on too many devices.
 */
enum class DiagnosticsNote { SUBTITLE_LOAD_FAILED, START_FAILED, SEEK_FAILED, UNPLAYABLE, RESTRICTED, TOO_MANY_STREAMS }

/** The app and the device, without anything that tells them apart from others of the same model. */
data class DeviceDiagnostics(
    val appVersion: Safe?,
    val appBuild: Int,
    val buildType: Safe?,
    val androidRelease: Safe?,
    val sdk: Int,
    val manufacturer: Safe?,
    val model: Safe?,
    val abi: Safe?,
    val tv: Boolean,
    val media3: Safe?,
    val ffmpeg: Boolean,
) {
    companion object {
        fun of(
            appVersion: String?,
            appBuild: Int,
            buildType: String?,
            androidRelease: String?,
            sdk: Int,
            manufacturer: String?,
            model: String?,
            abi: String?,
            tv: Boolean,
            media3: String?,
            ffmpeg: Boolean,
        ) = DeviceDiagnostics(
            Safe.token(appVersion, 32), appBuild, Safe.token(buildType, 16), Safe.token(androidRelease, 16), sdk,
            Safe.token(manufacturer, 32), Safe.token(model, 40), Safe.token(abi, 16), tv, Safe.token(media3, 16), ffmpeg,
        )
    }
}

/** This device's player settings that change what plays. */
data class SettingsDiagnostics(
    val engine: Safe,
    val decoders: Safe,
    val quality: Safe?,
    val videoCodec: Safe?,
    val audioCodec: Safe?,
    val convertAudio: List<Safe>,
) {
    companion object {
        fun of(engine: PlayerEngine, decoders: Decoders, quality: String, videoCodec: String, audioCodec: String, convertAudio: Set<String>) =
            SettingsDiagnostics(
                Safe.of(engine), Safe.of(decoders), safeQuality(quality),
                Safe.known(videoCodec, KNOWN_SETTING_CODECS), Safe.known(audioCodec, KNOWN_SETTING_CODECS),
                safeCodecs(convertAudio.sorted()),
            )
    }
}

/** What the server's probe says of the file: its formats, not its name or where it is. */
data class FileDiagnostics(
    val container: Safe?,
    val videoCodec: Safe?,
    val videoProfile: Safe?,
    val width: Int?,
    val height: Int?,
    val bitDepth: Int?,
    val hdr: Safe?,
    val dolbyVisionProfile: Int?,
    val audioCodecs: List<Safe>,
    val subtitleCount: Int,
    val probed: Boolean,
) {
    companion object {
        fun of(item: MediaItem): FileDiagnostics {
            val video = item.probe?.video
            return FileDiagnostics(
                container = Safe.known(item.container, KNOWN_CONTAINERS),
                videoCodec = safeVideoCodec(video?.codec),
                videoProfile = Safe.token(video?.profile, 24),
                width = video?.width,
                height = video?.height,
                bitDepth = video?.bitDepth,
                hdr = Safe.known(video?.hdr, KNOWN_HDR),
                dolbyVisionProfile = video?.dolbyVisionProfile,
                audioCodecs = item.probe?.audio.orEmpty().take(MAX_TRACKS * 2).mapNotNull { safeAudioCodec(it.codec) },
                subtitleCount = item.probe?.subtitles?.size ?: 0,
                probed = item.probe != null,
            )
        }
    }
}

/** The audio and subtitle picked, by their formats; never their language, label, or title. */
data class SelectionDiagnostics(
    val audioIndex: Int?,
    val audioCodec: Safe?,
    val audioChannels: Int?,
    val subtitleFormat: Safe?,
    val subtitleSource: Safe?,
    val subtitleDelivery: Safe?,
    val subtitleRendering: SubtitleRendering?,
) {
    companion object {
        fun of(audio: AudioTrack?, subtitle: SubtitleTrack?, rendering: SubtitleRendering?) = SelectionDiagnostics(
            audioIndex = audio?.index,
            audioCodec = safeAudioCodec(audio?.codec),
            audioChannels = audio?.channels,
            subtitleFormat = Safe.known(subtitle?.format, KNOWN_SUBTITLE_FORMATS),
            subtitleSource = Safe.known(subtitle?.source, KNOWN_SUBTITLE_SOURCES),
            subtitleDelivery = subtitle?.let { Safe.known(it.delivery ?: "none", KNOWN_DELIVERIES + "none") },
            subtitleRendering = rendering.takeIf { subtitle != null },
        )
    }
}

/** What the player told the server this device plays, what the server encodes to, and the most it streams to the account. */
data class CapabilityDiagnostics(
    val videoCodecs: List<Safe>,
    val audioCodecs: List<Safe>,
    val embeddedSubtitles: List<Safe>,
    val streamAudioCodecs: List<Safe>,
    val encodeVideoCodecs: List<Safe>,
    val serverVideoCodecs: List<Safe>,
    val serverAudioCodecs: List<Safe>,
    /** Bits per second, null without a limit. */
    val maxBitrate: Int? = null,
) {
    companion object {
        fun of(device: PlaybackDevice, options: PlaybackOptions) = CapabilityDiagnostics(
            videoCodecs = safeCodecs(device.video.map { it.codec }.distinct()),
            audioCodecs = safeCodecs(device.audio, max = 16),
            embeddedSubtitles = device.embeddedSubtitles.take(8).mapNotNull { Safe.known(it, KNOWN_SUBTITLE_FORMATS + "*") },
            streamAudioCodecs = safeCodecs(device.streamAudio),
            encodeVideoCodecs = safeCodecs(device.encodeVideo),
            serverVideoCodecs = safeCodecs(options.videoCodecs),
            serverAudioCodecs = safeCodecs(options.audioCodecs),
            maxBitrate = options.maxBitrate,
        )
    }
}

/** A track the player has, by its format and whether the device can play it. */
data class TrackDiagnostics(
    val type: TrackKind,
    val selected: Boolean,
    val mime: Safe?,
    val codecs: Safe?,
    val width: Int?,
    val height: Int?,
    val channels: Int?,
    val sampleRate: Int?,
    val bitrate: Int?,
    val support: Safe?,
)

/** A decoder the player started, by its name on the device. */
data class DecoderDiagnostics(val type: TrackKind, val name: Safe?)

/**
 * A playback error by its codes: Media3's error code and its name, the
 * HTTP status, the decoder, and the classes of its causes. Never its message.
 */
data class ErrorDiagnostics(
    val code: Int,
    val name: Safe?,
    val type: Safe? = null,
    val renderer: Safe? = null,
    val format: TrackDiagnostics? = null,
    val formatSupport: Safe? = null,
    val httpStatus: Int? = null,
    val decoder: Safe? = null,
    val secureDecoder: Boolean? = null,
    val causes: List<Safe> = emptyList(),
)

data class AttemptDiagnostics(
    val number: Int,
    val mode: SourceMode,
    val reason: AttemptReason,
    /** Seconds into the file, whole. */
    val startAt: Long,
    val audioIndex: Int?,
    val quality: Safe?,
    val burnIn: Boolean,
    /** Why the server didn't play the file as it is, as its answer says. */
    val why: List<Safe> = emptyList(),
    /** What the server encodes the video and converts the audio to. */
    val videoTo: Safe? = null,
    val audioTo: Safe? = null,
    val outcome: AttemptOutcome = AttemptOutcome.LOADING,
    val error: ErrorDiagnostics? = null,
)

/** All a report holds. Each part is bounded, so a long sitting can't grow it. */
data class PlaybackReport(
    val device: DeviceDiagnostics,
    val settings: SettingsDiagnostics,
    val file: FileDiagnostics,
    val selection: SelectionDiagnostics,
    val capabilities: CapabilityDiagnostics,
    val attempts: List<AttemptDiagnostics> = emptyList(),
    val droppedAttempts: Int = 0,
    val tracks: List<TrackDiagnostics> = emptyList(),
    val decoders: List<DecoderDiagnostics> = emptyList(),
    val notes: Map<DiagnosticsNote, Int> = emptyMap(),
) {
    val latest get() = attempts.lastOrNull()

    /** Whether the latest attempt failed with nothing after it. */
    val failed get() = latest?.outcome == AttemptOutcome.FAILED
}

/**
 * Builds the report of one sitting with a file and hands each change to
 * [publish], which [PlaybackDiagnostics] keeps. The player calls it on its
 * main thread.
 */
class DiagnosticsRecorder(
    initial: PlaybackReport,
    private val publish: (PlaybackReport) -> Unit = PlaybackDiagnostics::publish,
) {
    var report: PlaybackReport = initial
        private set

    private var nextNumber = 1

    init {
        publish(report)
    }

    private fun update(change: (PlaybackReport) -> PlaybackReport) {
        report = change(report)
        publish(report)
    }

    private fun updateLatest(change: (AttemptDiagnostics) -> AttemptDiagnostics) = update { r ->
        val last = r.attempts.lastOrNull() ?: return@update r
        r.copy(attempts = r.attempts.dropLast(1) + change(last))
    }

    /** A source the player loads now; one still loading before it was left for this one. */
    fun attempt(
        mode: SourceMode,
        reason: AttemptReason,
        at: Double,
        audioIndex: Int?,
        quality: String?,
        burnIn: Boolean,
        why: List<String> = emptyList(),
        videoTo: String? = null,
        audioTo: String? = null,
    ) = update { r ->
        val previous = r.attempts.map { if (it.outcome == AttemptOutcome.LOADING) it.copy(outcome = AttemptOutcome.REPLACED) else it }
        val next = AttemptDiagnostics(
            number = nextNumber++,
            mode = mode,
            reason = reason,
            startAt = at.coerceAtLeast(0.0).toLong(),
            audioIndex = audioIndex,
            quality = quality?.let(::safeQuality),
            burnIn = burnIn,
            why = why.take(PlaybackReason.all.size).mapNotNull { Safe.known(it, KNOWN_REASONS) },
            videoTo = safeVideoCodec(videoTo),
            audioTo = safeAudioCodec(audioTo),
        )
        val all = previous + next
        val dropped = (all.size - MAX_ATTEMPTS).coerceAtLeast(0)
        r.copy(attempts = all.drop(dropped), droppedAttempts = r.droppedAttempts + dropped, tracks = emptyList())
    }

    /** The latest source started playing. */
    fun playing() = updateLatest { if (it.outcome == AttemptOutcome.LOADING) it.copy(outcome = AttemptOutcome.PLAYING) else it }

    /** The latest source failed. */
    fun failed(error: ErrorDiagnostics) = updateLatest { it.copy(outcome = AttemptOutcome.FAILED, error = bounded(error)) }

    /** The player closed; a source still loading never played. */
    fun closed() = updateLatest { if (it.outcome == AttemptOutcome.LOADING) it.copy(outcome = AttemptOutcome.CLOSED) else it }

    fun select(selection: SelectionDiagnostics) = update { it.copy(selection = selection) }

    fun capabilities(capabilities: CapabilityDiagnostics) = update { it.copy(capabilities = capabilities) }

    fun tracks(tracks: List<TrackDiagnostics>) = update { it.copy(tracks = tracks.take(MAX_TRACKS)) }

    /** A decoder started: each one once, the latest [MAX_DECODERS]. */
    fun decoder(decoder: DecoderDiagnostics) = update { r ->
        val others = r.decoders.filter { it != decoder }
        r.copy(decoders = (others + decoder).takeLast(MAX_DECODERS))
    }

    /** [source] loads, as the server's [plan] answered, or a download without one. */
    fun attempt(source: Source, plan: PlaybackStart?, reason: AttemptReason, audioIndex: Int?) = attempt(
        mode = source.mode,
        reason = reason,
        at = source.position,
        audioIndex = plan?.audio?.index ?: audioIndex,
        quality = plan?.quality,
        burnIn = plan?.subtitleMode == PlaybackSubtitleMode.BURN_IN,
        why = plan?.reasons.orEmpty(),
        videoTo = plan?.convertedVideo,
        audioTo = plan?.convertedAudio,
    )

    fun note(note: DiagnosticsNote) = update { r -> r.copy(notes = r.notes + (note to (r.notes[note] ?: 0) + 1)) }

    private fun bounded(error: ErrorDiagnostics) = error.copy(causes = error.causes.take(MAX_CAUSES))
}

/** The latest playback's report, kept in memory for Settings. */
object PlaybackDiagnostics {
    private val state = MutableStateFlow<PlaybackReport?>(null)
    val latest: StateFlow<PlaybackReport?> = state.asStateFlow()

    fun publish(report: PlaybackReport) {
        state.value = report
    }

    fun clear() {
        state.value = null
    }
}

/**
 * The report as text to paste in an issue or send to whoever runs the
 * server. Its keys stay in English, so anyone can read every report.
 */
fun formatReport(report: PlaybackReport): String = buildString {
    fun line(text: String) = append(text).append('\n')
    fun yesNo(value: Boolean) = if (value) "yes" else "no"
    fun list(values: List<Safe>) = values.joinToString(",").ifEmpty { "none" }
    fun opt(value: Any?) = value?.toString() ?: "unknown"

    line("Matinee playback report v1")
    line("privacy: codes and formats only; no titles, file names, addresses, accounts, or tokens")

    val d = report.device
    line("app: ${opt(d.appVersion)} (${d.appBuild}, ${opt(d.buildType)})")
    line("android: ${opt(d.androidRelease)} (api ${d.sdk}), ${opt(d.abi)}${if (d.tv) ", tv" else ""}")
    line("device: ${opt(d.manufacturer)} ${opt(d.model)}")
    line("media3: ${opt(d.media3)}, ffmpeg audio: ${yesNo(d.ffmpeg)}")

    val s = report.settings
    line("engine: ${s.engine}, decoders: ${s.decoders}")
    line("settings: quality=${opt(s.quality)} video_codec=${opt(s.videoCodec)} audio_codec=${opt(s.audioCodec)} convert_audio=${list(s.convertAudio)}")

    val f = report.file
    if (!f.probed) {
        line("file: container=${opt(f.container)}, not probed")
    } else {
        val size = if (f.width != null && f.height != null) " ${f.width}x${f.height}" else ""
        val depth = f.bitDepth?.let { " ${it}bit" }.orEmpty()
        val dv = f.dolbyVisionProfile?.let { " dv_profile=$it" }.orEmpty()
        line("file: container=${opt(f.container)} video=${f.videoCodec ?: "none"}${f.videoProfile?.let { " ($it)" }.orEmpty()}$size$depth hdr=${f.hdr ?: "none"}$dv")
        line("file tracks: audio=${list(f.audioCodecs)} subtitles=${f.subtitleCount}")
    }

    val sel = report.selection
    line("audio picked: ${sel.audioIndex?.let { "#$it ${opt(sel.audioCodec)}${sel.audioChannels?.let { c -> " ${c}ch" }.orEmpty()}" } ?: "default"}")
    line(
        "subtitle picked: " + if (sel.subtitleRendering == null) "off" else
            "${opt(sel.subtitleFormat)} ${opt(sel.subtitleSource)} delivery=${opt(sel.subtitleDelivery)} drawn_by=${sel.subtitleRendering.name.lowercase()}",
    )

    val c = report.capabilities
    line("device plays: video=${list(c.videoCodecs)} audio=${list(c.audioCodecs)} embedded_subtitles=${list(c.embeddedSubtitles)}")
    line("asks for: stream_audio=${list(c.streamAudioCodecs)} encode_video=${list(c.encodeVideoCodecs)}")
    line("server offers: video=${list(c.serverVideoCodecs)} audio=${list(c.serverAudioCodecs)}" + c.maxBitrate?.let { " max_bitrate=${it / 1000}kbps" }.orEmpty())

    line("attempts:${if (report.droppedAttempts > 0) " (${report.droppedAttempts} earlier left out)" else ""}")
    if (report.attempts.isEmpty()) line("  none")
    for (a in report.attempts) {
        val parts = buildList {
            add("${a.number}. ${a.mode.name.lowercase()}")
            add("reason=${a.reason.name.lowercase()}")
            add("at=${a.startAt}s")
            a.audioIndex?.let { add("audio=#$it") }
            if (a.mode == SourceMode.HLS || a.mode == SourceMode.ENCODE) add("quality=${opt(a.quality)}")
            if (a.burnIn) add("burn_in=yes")
            if (a.why.isNotEmpty()) add("why=${list(a.why)}")
            a.videoTo?.let { add("video_to=$it") }
            a.audioTo?.let { add("audio_to=$it") }
            add("-> ${a.outcome.name.lowercase()}")
        }
        line("  " + parts.joinToString(" "))
        a.error?.let { line("     error: ${formatError(it)}") }
    }

    line("tracks:")
    if (report.tracks.isEmpty()) line("  none reported")
    for (t in report.tracks) line("  ${formatTrack(t)}")

    if (report.decoders.isNotEmpty()) {
        line("decoders: " + report.decoders.joinToString(", ") { "${it.type.name.lowercase()}=${opt(it.name)}" })
    }
    if (report.notes.isNotEmpty()) {
        line("notes: " + report.notes.entries.joinToString(", ") { "${it.key.name.lowercase()} x${it.value}" })
    }
}

private fun formatTrack(t: TrackDiagnostics, selection: Boolean = true): String = buildList {
    add(t.type.name.lowercase())
    if (selection) add(if (t.selected) "selected" else "not_selected")
    t.mime?.let { add(it.text) }
    t.codecs?.let { add("codecs=$it") }
    if (t.width != null && t.height != null && t.width > 0 && t.height > 0) add("${t.width}x${t.height}")
    t.channels?.takeIf { it > 0 }?.let { add("${it}ch") }
    t.sampleRate?.takeIf { it > 0 }?.let { add("${it}Hz") }
    t.bitrate?.takeIf { it > 0 }?.let { add("${it / 1000}kbps") }
    t.support?.let { add("support=$it") }
}.joinToString(" ")

private fun formatError(e: ErrorDiagnostics): String = buildList {
    add("${e.name ?: "unknown"} (${e.code})")
    e.type?.let { add("type=$it") }
    e.httpStatus?.let { add("http=$it") }
    e.renderer?.let { add("renderer=$it") }
    e.decoder?.let { add("decoder=$it") }
    e.secureDecoder?.takeIf { it }?.let { add("secure_decoder=yes") }
    e.formatSupport?.let { add("format_support=$it") }
    e.format?.let { add("format=[${formatTrack(it, selection = false)}]") }
    if (e.causes.isNotEmpty()) add("causes=${e.causes.joinToString(">")}")
}.joinToString(" ")
