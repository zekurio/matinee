package io.github.zekurio.matinee.ui.player

import android.media.MediaCodecInfo
import android.media.MediaCodecInfo.CodecProfileLevel
import android.media.MediaCodecList
import androidx.media3.decoder.ffmpeg.FfmpegLibrary
import io.github.zekurio.matinee.api.VideoStream

/**
 * What this device decodes, asked of its media codecs, so the player sends
 * the file as it is when it can and has the server convert only the rest.
 */
object Capabilities {
    private val decoders: List<MediaCodecInfo> by lazy {
        MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.filter { !it.isEncoder }
    }

    private val VIDEO_MIMES = mapOf(
        "h264" to "video/avc",
        "hevc" to "video/hevc",
        "av1" to "video/av01",
        "vp9" to "video/x-vnd.on2.vp9",
        "vp8" to "video/x-vnd.on2.vp8",
        "mpeg2video" to "video/mpeg2",
        "mpeg4" to "video/mp4v-es",
    )

    private val AUDIO_MIMES = mapOf(
        "aac" to "audio/mp4a-latm",
        "mp3" to "audio/mpeg",
        "mp2" to "audio/mpeg-L2",
        "opus" to "audio/opus",
        "vorbis" to "audio/vorbis",
        "flac" to "audio/flac",
        "alac" to "audio/alac",
        "ac3" to "audio/ac3",
        "eac3" to "audio/eac3",
        "ac4" to "audio/ac4",
        "dts" to "audio/vnd.dts",
        "truehd" to "audio/true-hd",
    )

    /**
     * Containers ExoPlayer reads itself. Others, like AVI from old rips or
     * WMV, go through the server.
     */
    private val CONTAINERS = setOf("mkv", "webm", "mp4", "m4v", "mov", "ts", "mpegts", "flv", "ogv", "ogg", "avi")

    private fun decodersFor(mime: String) = decoders.filter { info -> info.supportedTypes.any { it.equals(mime, true) } }

    fun playsContainer(container: String) = container.lowercase() in CONTAINERS

    fun decodesVideo(video: VideoStream): Boolean {
        // Profile 5 has no layer other decoders can show.
        if (video.dolbyVisionProfile == 5) return decodersFor("video/dolby-vision").isNotEmpty()
        val mime = VIDEO_MIMES[video.codec] ?: return false
        val deep = (video.bitDepth ?: 8) > 8
        return decodersFor(mime).any { info ->
            val caps = runCatching { info.getCapabilitiesForType(mime) }.getOrNull() ?: return@any false
            val size = caps.videoCapabilities?.let { video.width <= 0 || it.isSizeSupported(video.width, video.height) } ?: true
            size && (!deep || caps.profileLevels.any { it.profile in tenBitProfiles(video.codec) })
        }
    }

    private fun tenBitProfiles(codec: String): Set<Int> = when (codec) {
        "hevc" -> setOf(CodecProfileLevel.HEVCProfileMain10, CodecProfileLevel.HEVCProfileMain10HDR10, CodecProfileLevel.HEVCProfileMain10HDR10Plus)
        "av1" -> setOf(CodecProfileLevel.AV1ProfileMain10, CodecProfileLevel.AV1ProfileMain10HDR10, CodecProfileLevel.AV1ProfileMain10HDR10Plus)
        "vp9" -> setOf(CodecProfileLevel.VP9Profile2, CodecProfileLevel.VP9Profile2HDR, CodecProfileLevel.VP9Profile2HDR10Plus)
        else -> emptySet()
    }

    /** PCM plays without a decoder; the rest need the device's or FFmpeg's. */
    fun decodesAudio(codec: String): Boolean {
        if (codec.startsWith("pcm_")) return true
        val mime = AUDIO_MIMES[codec] ?: return false
        return decodersFor(mime).isNotEmpty() || (FfmpegLibrary.isAvailable() && FfmpegLibrary.supportsFormat(mime))
    }

    /**
     * The codecs from the contract's PLAYBACK_AUDIO_CODECS this device takes
     * in MP4, the one it wants converted audio in first. AAC always plays.
     * Formats [prefs] has converted are left out, and its codec goes first.
     */
    fun streamAudioCodecs(prefs: PlayerPrefs): List<String> {
        val kept = listOf("opus", "aac", "mp3", "flac", "alac", "ac3", "eac3").filter { it == "aac" || takesAudio(it, prefs) }
        val first = prefs.audioCodec.takeIf { it in kept } ?: return kept
        return listOf(first) + (kept - first)
    }

    /**
     * Formats the device plays that settings may still have converted, as the
     * web's OPTIONAL_PASSTHROUGH.
     */
    val OPTIONAL_PASSTHROUGH = listOf("ac3", "eac3", "flac", "alac")

    /** Whether the player takes [codec] as it is: the device decodes it and settings don't convert it. */
    fun takesAudio(codec: String, prefs: PlayerPrefs): Boolean =
        decodesAudio(codec) && !(codec in OPTIONAL_PASSTHROUGH && codec in prefs.convertAudio)

    /** The codecs streams may convert audio to, of the server's: Opus where it plays, and AAC. */
    fun convertAudioCodecs(server: List<String>): List<String> =
        listOf("opus", "aac").filter { it in server && (it == "aac" || decodesAudio(it)) }

    /** The codecs of the server's an encode could come in that this device decodes, best last. */
    fun encodeVideoChoices(server: List<String>): List<String> =
        listOf("h264", "hevc", "av1").filter { codec ->
            codec in server && VIDEO_MIMES[codec]?.let { decodersFor(it).isNotEmpty() } == true
        }

    /**
     * The codecs an encode may come in, the one wanted first. Automatic is
     * H.264, which every device plays; settings can ask for HEVC or AV1.
     */
    fun encodeVideoCodecs(server: List<String>, prefs: PlayerPrefs): List<String> {
        val choices = encodeVideoChoices(server)
        val wanted = prefs.videoCodec.takeIf { it != AUTOMATIC && it in choices }
        return listOfNotNull(wanted, "h264".takeIf { it in server }).distinct().ifEmpty { listOf("h264") }
    }
}
