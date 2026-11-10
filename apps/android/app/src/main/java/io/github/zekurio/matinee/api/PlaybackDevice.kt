package io.github.zekurio.matinee.api

import android.media.MediaCodecInfo.CodecProfileLevel
import android.media.MediaCodecList
import io.github.zekurio.matinee.ui.player.Capabilities
import io.github.zekurio.matinee.ui.player.PlayerEngine
import io.github.zekurio.matinee.ui.player.PlayerPrefs
import java.util.Locale

/** The device's decoders, narrowed by the settings used for playback. */
fun playbackDevice(prefs: PlayerPrefs): PlaybackDevice {
    val mpv = prefs.engine == PlayerEngine.MPV
    val decoders = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.filter { !it.isEncoder }
    val dolbyVision = decoders.any { info -> info.supportedTypes.any { it.equals("video/dolby-vision", true) } }
    val mimes = mapOf(
        "h264" to "video/avc", "hevc" to "video/hevc", "av1" to "video/av01",
        "vp9" to "video/x-vnd.on2.vp9", "vp8" to "video/x-vnd.on2.vp8",
        "mpeg2video" to "video/mpeg2", "mpeg4" to "video/mp4v-es",
    )
    val video = mimes.flatMap { (codec, mime) ->
        decoders.filter { info -> info.supportedTypes.any { it.equals(mime, true) } }.mapNotNull { info ->
            val caps = runCatching { info.getCapabilitiesForType(mime) }.getOrNull() ?: return@mapNotNull null
            val deep = when (codec) {
                "hevc" -> setOf(CodecProfileLevel.HEVCProfileMain10, CodecProfileLevel.HEVCProfileMain10HDR10, CodecProfileLevel.HEVCProfileMain10HDR10Plus)
                "av1" -> setOf(CodecProfileLevel.AV1ProfileMain10, CodecProfileLevel.AV1ProfileMain10HDR10, CodecProfileLevel.AV1ProfileMain10HDR10Plus)
                "vp9" -> setOf(CodecProfileLevel.VP9Profile2, CodecProfileLevel.VP9Profile2HDR, CodecProfileLevel.VP9Profile2HDR10Plus)
                else -> emptySet()
            }
            PlaybackDecoder(
                codec = codec,
                maxWidth = caps.videoCapabilities?.supportedWidths?.upper?.toDouble(),
                maxHeight = caps.videoCapabilities?.supportedHeights?.upper?.toDouble(),
                maxBitDepth = if (caps.profileLevels.any { it.profile in deep }) 10.0 else 8.0,
                profiles = null,
                maxLevel = null,
                hdr = null,
                dolbyVisionProfiles = if (dolbyVision) null else (0..10).filter { it != 5 },
            )
        }
    }
    val audioCodecs = listOf("aac", "mp3", "mp2", "opus", "vorbis", "flac", "alac", "ac3", "eac3", "ac4", "dts", "truehd")
    val audio = audioCodecs.filter {
        if (mpv) it !in prefs.convertAudio else Capabilities.takesAudio(it, prefs)
    } + "pcm_*"
    val encodes = if (mpv) {
        listOfNotNull(prefs.videoCodec.takeIf { it in TranscodeVideoCodec.all }) + TranscodeVideoCodec.all
    } else {
        Capabilities.encodeVideoCodecs(TranscodeVideoCodec.all, prefs) + Capabilities.encodeVideoChoices(TranscodeVideoCodec.all)
    }
    val streamAudio = if (mpv) {
        val codecs = listOf("opus", "aac", "mp3", "flac", "alac", "ac3", "eac3").filter { it !in prefs.convertAudio }
        (listOfNotNull(prefs.audioCodec.takeIf { it in codecs }) + codecs).distinct()
    } else Capabilities.streamAudioCodecs(prefs)
    return PlaybackDevice(
        containers = if (mpv) listOf("*") else listOf("mkv", "webm", "mp4", "m4v", "mov", "ts", "mpegts", "flv", "ogv", "ogg", "avi"),
        video = if (mpv) listOf(PlaybackDecoder("*", null, null, null, null, null, null, null)) else video,
        audio = if (mpv && prefs.convertAudio.isEmpty()) listOf("*") else audio,
        streamAudio = streamAudio,
        encodeVideo = encodes.distinct(),
        hls = true, selectAudio = true, subtitles = listOf("webvtt"),
        sidecarSubtitles = if (mpv) listOf("pgs") else emptyList(),
        embeddedSubtitles = if (mpv) listOf("PGS", "VobSub", "DVB", "ASS", "SSA") else listOf("PGS", "VobSub", "DVB"),
        language = Locale.getDefault().toLanguageTag(),
    )
}
