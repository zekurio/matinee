package io.github.zekurio.matinee.api

import io.github.zekurio.matinee.ui.player.AUTOMATIC
import io.github.zekurio.matinee.ui.player.Capabilities
import io.github.zekurio.matinee.ui.player.PlayerEngine
import io.github.zekurio.matinee.ui.player.PlayerPrefs
import java.util.Locale

/*
 * The device profile `playback.start` and `downloads.resolve` take: what
 * this device plays, after its settings narrowed it. ExoPlayer plays what
 * the device's decoders and FFmpeg's audio decoders do. mpv brings its own
 * FFmpeg and plays nearly everything. Only [playbackDevice] asks Android;
 * the rest is plain Kotlin, so the JVM tests run it.
 */

/** This device's profile, from its decoders and its player settings. */
fun playbackDevice(prefs: PlayerPrefs): PlaybackDevice = playbackProfile(
    ProfileSettings(prefs.engine, prefs.convertAudio, prefs.audioCodec, prefs.videoCodec),
    Capabilities.codecs,
    Locale.getDefault(),
)

/** The player settings that change what a device plays. */
data class ProfileSettings(
    val engine: PlayerEngine,
    /** Formats the device plays that settings have converted anyway, from [OPTIONAL_PASSTHROUGH]. */
    val convertAudio: Set<String> = emptySet(),
    /** The codec converted audio comes in, or [AUTOMATIC]. */
    val audioCodec: String = AUTOMATIC,
    /** The codec encodes come in, or [AUTOMATIC]. */
    val videoCodec: String = AUTOMATIC,
)

/** A frame's size in pixels. */
data class FrameSize(val width: Int, val height: Int)

/**
 * One of the device's video decoders: its codec, its widest frame with
 * the tallest height it takes at that width, its tallest frame with the
 * widest width it takes at that height, and whether it decodes 10-bit
 * video. A size is null when the decoder doesn't say.
 */
data class VideoDecoder(val codec: String, val widest: FrameSize?, val tallest: FrameSize?, val tenBit: Boolean)

/** What the device's own decoders play, as Android lists them. */
data class DeviceCodecs(
    val video: List<VideoDecoder>,
    /** The audio codecs it decodes, by ffmpeg's names, FFmpeg's decoders included. */
    val audio: Set<String>,
    /** A decoder shows Dolby Vision itself, so every profile of it plays. */
    val dolbyVision: Boolean,
)

/** Formats the device plays that settings may still have converted, as the web's passthrough switches. */
val OPTIONAL_PASSTHROUGH = listOf("ac3", "eac3", "flac", "alac")

/** The containers ExoPlayer reads. Others, like WMV or M2TS, go through the server. */
val EXOPLAYER_CONTAINERS = listOf("mkv", "webm", "mp4", "m4v", "mov", "ts", "mpegts", "flv", "ogv", "ogg", "avi")

/**
 * The audio codecs mpv's FFmpeg decodes, for when settings convert some
 * of them: the profile can say every codec or a list, not every codec but
 * a few.
 */
private val MPV_AUDIO = listOf(
    "aac", "mp3", "mp2", "mp1", "opus", "vorbis", "flac", "alac", "ac3", "eac3", "dts", "truehd", "mlp",
    "wmav1", "wmav2", "wmapro", "wmalossless", "amr_nb", "amr_wb", "ape", "wavpack", "tta", "cook", "speex",
)

/** The order ExoPlayer's audio goes in the profile. */
private val EXOPLAYER_AUDIO = listOf("aac", "mp3", "mp2", "opus", "vorbis", "flac", "alac", "ac3", "eac3", "ac4", "dts", "truehd")

/** The contract's PLAYBACK_AUDIO_CODECS: what a stream may carry its audio in. */
private val STREAM_AUDIO = listOf("opus", "aac", "mp3", "flac", "alac", "ac3", "eac3")

/** Dolby Vision profiles a plain HEVC or AV1 decoder shows by their base layer. Profile 5 has none. */
private val DOLBY_VISION_WITHOUT_DECODER = (0..10).filter { it != 5 }

/** The subtitle formats in a file each engine draws while the file plays as it is. */
private val EXOPLAYER_EMBEDDED = listOf("PGS", "VobSub", "DVB")
private val MPV_EMBEDDED = EXOPLAYER_EMBEDDED + listOf("ASS", "SSA")

/**
 * A decoder as the profile has it. The profile limits width and height
 * apart, but a decoder limits them together, by how many blocks a frame
 * has: one that takes 4096x2304 takes 2304x4096 too, but not 4096x4096.
 * So it goes in once as wide as it goes and once as tall as it goes, and
 * every frame inside either fits. A frame outside both, like a large
 * square one, goes to the server. Nor can the profile say the frame rate,
 * so a 60 fps file on a decoder that only keeps up with 30 plays as it is
 * and stutters, as it did before the server decided.
 */
fun profileDecoders(decoder: VideoDecoder, dolbyVision: Boolean): List<PlaybackDecoder> {
    val sizes: List<FrameSize?> = listOfNotNull(decoder.widest, decoder.tallest).distinct().ifEmpty { listOf(null) }
    return sizes.map { size ->
        PlaybackDecoder(
            codec = decoder.codec,
            maxWidth = size?.width?.toDouble(),
            maxHeight = size?.height?.toDouble(),
            maxBitDepth = if (decoder.tenBit) 10.0 else 8.0,
            profiles = null,
            maxLevel = null,
            hdr = null,
            dolbyVisionProfiles = if (dolbyVision) null else DOLBY_VISION_WITHOUT_DECODER,
        )
    }
}

/** The language subtitles fall back to, as the web sends it: `de` for German anywhere. */
fun profileLanguage(locale: Locale): String = locale.language.ifEmpty { "en" }

/**
 * What a device plays with [settings], as `playback.start` takes it. Both
 * engines pick an audio track inside a file, draw WebVTT over any source,
 * and play HLS. They differ in what else they read and draw.
 */
fun playbackProfile(settings: ProfileSettings, codecs: DeviceCodecs, locale: Locale): PlaybackDevice {
    val mpv = settings.engine == PlayerEngine.MPV
    val converted = settings.convertAudio.filter { it in OPTIONAL_PASSTHROUGH }.toSet()
    // What plays as it is: what the engine decodes, less what settings convert.
    val takes = { codec: String -> codec !in converted && (mpv || codec in codecs.audio) }
    val audio = when {
        mpv && converted.isEmpty() -> listOf("*")
        mpv -> MPV_AUDIO.filter(takes) + "pcm_*"
        else -> EXOPLAYER_AUDIO.filter(takes) + "pcm_*"
    }
    // AAC always plays, and the server converts to the first of these it encodes.
    val stream = STREAM_AUDIO.filter { it == "aac" || takes(it) }
    val firstAudio = settings.audioCodec.takeIf { it in stream }
    val encodable = if (mpv) TranscodeVideoCodec.all else TranscodeVideoCodec.all.filter { codec -> codecs.video.any { it.codec == codec } }
    val firstVideo = settings.videoCodec.takeIf { it != AUTOMATIC && it in encodable }
    return PlaybackDevice(
        containers = if (mpv) listOf("*") else EXOPLAYER_CONTAINERS,
        video = if (mpv) {
            listOf(PlaybackDecoder("*", null, null, null, null, null, null, null))
        } else {
            codecs.video.flatMap { profileDecoders(it, codecs.dolbyVision) }.distinct()
        },
        audio = audio,
        streamAudio = listOfNotNull(firstAudio) + (stream - setOfNotNull(firstAudio)),
        // H.264 plays everywhere, so it comes right after the codec settings ask for.
        encodeVideo = (listOfNotNull(firstVideo) + TranscodeVideoCodec.H264 + encodable).distinct(),
        hls = true,
        selectAudio = true,
        // The player screen draws WebVTT, and mpv a PGS file beside the video.
        subtitles = listOf(PlaybackSubtitleDelivery.WEBVTT),
        sidecarSubtitles = if (mpv) listOf(PlaybackSubtitleDelivery.PGS) else emptyList(),
        embeddedSubtitles = if (mpv) MPV_EMBEDDED else EXOPLAYER_EMBEDDED,
        language = profileLanguage(locale),
    )
}
