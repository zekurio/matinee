package io.github.zekurio.matinee.ui.player

import android.media.MediaCodecInfo
import android.media.MediaCodecInfo.CodecProfileLevel
import android.media.MediaCodecInfo.VideoCapabilities
import android.media.MediaCodecList
import androidx.media3.decoder.ffmpeg.FfmpegLibrary
import io.github.zekurio.matinee.api.DeviceCodecs
import io.github.zekurio.matinee.api.FrameSize
import io.github.zekurio.matinee.api.OPTIONAL_PASSTHROUGH
import io.github.zekurio.matinee.api.VideoDecoder

/**
 * What this device decodes, asked of its media codecs. The device profile
 * tells the server, which decides from it what plays as it is and what it
 * converts. Settings ask it too, for the choices they offer.
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

    private fun decodersFor(mime: String) = decoders.filter { info -> info.supportedTypes.any { it.equals(mime, true) } }

    /** Every video decoder by its limits, and the audio the device and FFmpeg decode, read once. */
    val codecs: DeviceCodecs by lazy {
        val video = VIDEO_MIMES.flatMap { (codec, mime) ->
            decodersFor(mime).mapNotNull { info ->
                val caps = runCatching { info.getCapabilitiesForType(mime) }.getOrNull() ?: return@mapNotNull null
                val sizes = caps.videoCapabilities
                VideoDecoder(
                    codec = codec,
                    widest = sizes?.let(::widest),
                    tallest = sizes?.let(::tallest),
                    tenBit = caps.profileLevels.any { it.profile in tenBitProfiles(codec) },
                )
            }
        }
        DeviceCodecs(video, AUDIO_MIMES.keys.filter(::decodesAudio).toSet(), decodersFor("video/dolby-vision").isNotEmpty())
    }

    /** The widest frame, and the tallest it takes at that width, or at any when it won't say. */
    private fun widest(sizes: VideoCapabilities): FrameSize {
        val width = sizes.supportedWidths.upper
        val height = runCatching { sizes.getSupportedHeightsFor(width).upper }.getOrDefault(sizes.supportedHeights.upper)
        return FrameSize(width, height)
    }

    /** The tallest frame, and the widest it takes at that height. */
    private fun tallest(sizes: VideoCapabilities): FrameSize {
        val height = sizes.supportedHeights.upper
        val width = runCatching { sizes.getSupportedWidthsFor(height).upper }.getOrDefault(sizes.supportedWidths.upper)
        return FrameSize(width, height)
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

    /** The passthrough formats this device plays, which settings may have converted. */
    val passthrough: List<String> get() = OPTIONAL_PASSTHROUGH.filter(::decodesAudio)

    /** The codecs streams may convert audio to, of the server's: Opus where it plays, and AAC. */
    fun convertAudioCodecs(server: List<String>): List<String> =
        listOf("opus", "aac").filter { it in server && (it == "aac" || decodesAudio(it)) }

    /** The codecs of the server's an encode could come in that this device decodes, best last. */
    fun encodeVideoChoices(server: List<String>): List<String> =
        listOf("h264", "hevc", "av1").filter { codec ->
            codec in server && VIDEO_MIMES[codec]?.let { decodersFor(it).isNotEmpty() } == true
        }
}
