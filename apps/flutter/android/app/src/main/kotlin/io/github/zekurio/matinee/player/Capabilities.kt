package io.github.zekurio.matinee.player

import android.media.MediaCodecInfo
import android.media.MediaCodecInfo.CodecProfileLevel
import android.media.MediaCodecInfo.VideoCapabilities
import android.media.MediaCodecList
import androidx.media3.common.util.UnstableApi
import androidx.media3.decoder.ffmpeg.FfmpegLibrary

/** Android's decoder limits and the bundled Media3 FFmpeg audio decoders. */
@UnstableApi
internal object Capabilities {
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
    val codecs: CodecCapabilitiesMessage by lazy {
        val video = VIDEO_MIMES.flatMap { (codec, mime) ->
            decodersFor(mime).mapNotNull { info ->
                val caps = runCatching { info.getCapabilitiesForType(mime) }.getOrNull() ?: return@mapNotNull null
                val sizes = caps.videoCapabilities
                VideoDecoderMessage(
                    codec = codec,
                    widest = sizes?.let(::widest),
                    tallest = sizes?.let(::tallest),
                    tenBit = caps.profileLevels.any { it.profile in tenBitProfiles(codec) },
                )
            }
        }
        CodecCapabilitiesMessage(video.distinct(), AUDIO_MIMES.keys.filter(::decodesAudio), decodersFor("video/dolby-vision").isNotEmpty())
    }

    /** The widest frame, and the tallest it takes at that width, or at any when it won't say. */
    private fun widest(sizes: VideoCapabilities): FrameSizeMessage {
        val width = sizes.supportedWidths.upper
        val height = runCatching { sizes.getSupportedHeightsFor(width).upper }.getOrDefault(sizes.supportedHeights.upper)
        return FrameSizeMessage(width.toLong(), height.toLong())
    }

    /** The tallest frame, and the widest it takes at that height. */
    private fun tallest(sizes: VideoCapabilities): FrameSizeMessage {
        val height = sizes.supportedHeights.upper
        val width = runCatching { sizes.getSupportedWidthsFor(height).upper }.getOrDefault(sizes.supportedWidths.upper)
        return FrameSizeMessage(width.toLong(), height.toLong())
    }

    private fun tenBitProfiles(codec: String): Set<Int> = when (codec) {
        "hevc" -> setOf(CodecProfileLevel.HEVCProfileMain10, CodecProfileLevel.HEVCProfileMain10HDR10, CodecProfileLevel.HEVCProfileMain10HDR10Plus)
        "av1" -> setOf(CodecProfileLevel.AV1ProfileMain10, CodecProfileLevel.AV1ProfileMain10HDR10, CodecProfileLevel.AV1ProfileMain10HDR10Plus)
        "vp9" -> setOf(CodecProfileLevel.VP9Profile2, CodecProfileLevel.VP9Profile2HDR, CodecProfileLevel.VP9Profile2HDR10Plus)
        else -> emptySet()
    }

    /** PCM plays without a decoder; the rest need the device's or FFmpeg's. */
    private fun decodesAudio(codec: String): Boolean {
        val mime = AUDIO_MIMES[codec] ?: return false
        return decodersFor(mime).isNotEmpty() || (FfmpegLibrary.isAvailable() && FfmpegLibrary.supportsFormat(mime))
    }
}
