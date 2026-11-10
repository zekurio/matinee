package io.github.zekurio.matinee.api

import io.github.zekurio.matinee.ui.player.PlayerEngine
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackDeviceTest {
    // A phone with hardware H.264 and 10-bit HEVC up to 4K, a software VP9 decoder that won't say its sizes, and no Dolby Vision decoder.
    private val phone = DeviceCodecs(
        video = listOf(
            VideoDecoder("h264", FrameSize(4096, 2304), FrameSize(2304, 4096), tenBit = false),
            VideoDecoder("hevc", FrameSize(4096, 2176), FrameSize(2176, 4096), tenBit = true),
            VideoDecoder("vp9", null, null, tenBit = false),
        ),
        audio = setOf("aac", "mp3", "opus", "vorbis", "flac", "ac3", "eac3", "dts", "truehd"),
        dolbyVision = false,
    )

    private fun exo(settings: ProfileSettings = ProfileSettings(PlayerEngine.EXOPLAYER)) = playbackProfile(settings, phone, Locale.GERMANY)

    private fun mpv(settings: ProfileSettings = ProfileSettings(PlayerEngine.MPV)) = playbackProfile(settings, phone, Locale.GERMANY)

    @Test
    fun exoPlayerSaysWhatTheDeviceDecodes() {
        val device = exo()
        assertTrue("mkv" in device.containers && "*" !in device.containers)
        assertEquals(listOf("aac", "mp3", "opus", "vorbis", "flac", "ac3", "eac3", "dts", "truehd", "pcm_*"), device.audio)
        assertEquals(listOf("opus", "aac", "mp3", "flac", "ac3", "eac3"), device.streamAudio)
        assertEquals(listOf("h264", "hevc"), device.encodeVideo)
        assertTrue(device.hls)
        assertTrue(device.selectAudio)
        assertEquals(listOf("webvtt"), device.subtitles)
        assertEquals(emptyList<String>(), device.sidecarSubtitles)
        assertEquals(listOf("PGS", "VobSub", "DVB"), device.embeddedSubtitles)
        // The base language, as the web sends it.
        assertEquals("de", device.language)
    }

    @Test
    fun eachDecoderGoesInAsWideAndAsTallAsItGoes() {
        val hevc = exo().video.filter { it.codec == "hevc" }
        assertEquals(listOf(4096.0 to 2176.0, 2176.0 to 4096.0), hevc.map { it.maxWidth to it.maxHeight })
        assertTrue(hevc.all { it.maxBitDepth == 10.0 })
        // Without a Dolby Vision decoder, profile 5 has no layer the others show.
        assertTrue(hevc.all { 5 !in it.dolbyVisionProfiles.orEmpty() && 8 in it.dolbyVisionProfiles.orEmpty() })
        assertEquals(8.0, exo().video.first { it.codec == "h264" }.maxBitDepth)
        // A decoder that won't say its sizes isn't held to any.
        val vp9 = exo().video.filter { it.codec == "vp9" }
        assertEquals(1, vp9.size)
        assertEquals(null, vp9.single().maxWidth)
        // A square decoder needs only one.
        assertEquals(1, profileDecoders(VideoDecoder("av1", FrameSize(1920, 1920), FrameSize(1920, 1920), false), true).size)
        assertEquals(null, profileDecoders(VideoDecoder("av1", FrameSize(1920, 1920), null, false), true).single().dolbyVisionProfiles)
    }

    @Test
    fun exoPlayerLeavesOutWhatSettingsConvert() {
        val device = exo(ProfileSettings(PlayerEngine.EXOPLAYER, convertAudio = setOf("eac3", "ac3"), audioCodec = "aac", videoCodec = "hevc"))
        assertFalse("ac3" in device.audio || "eac3" in device.audio)
        assertEquals(listOf("aac", "opus", "mp3", "flac"), device.streamAudio)
        assertEquals(listOf("hevc", "h264"), device.encodeVideo)
        // A codec the device can't decode isn't asked for, whatever the setting says.
        assertEquals(listOf("h264", "hevc"), exo(ProfileSettings(PlayerEngine.EXOPLAYER, videoCodec = "av1")).encodeVideo)
    }

    @Test
    fun mpvPlaysNearlyEverything() {
        val device = mpv()
        assertEquals(listOf("*"), device.containers)
        assertEquals(listOf("*"), device.audio)
        assertEquals(1, device.video.size)
        assertEquals("*", device.video.single().codec)
        assertEquals(null, device.video.single().maxWidth)
        assertEquals(listOf("opus", "aac", "mp3", "flac", "alac", "ac3", "eac3"), device.streamAudio)
        assertEquals(listOf("h264", "hevc", "av1"), device.encodeVideo)
        assertEquals(listOf("pgs"), device.sidecarSubtitles)
        assertEquals(listOf("PGS", "VobSub", "DVB", "ASS", "SSA"), device.embeddedSubtitles)
    }

    @Test
    fun mpvListsItsAudioWhenSettingsConvertSome() {
        val device = mpv(ProfileSettings(PlayerEngine.MPV, convertAudio = setOf("ac3"), videoCodec = "av1"))
        assertFalse("*" in device.audio)
        assertFalse("ac3" in device.audio)
        assertTrue("eac3" in device.audio && "dts" in device.audio && "pcm_*" in device.audio)
        assertFalse("ac3" in device.streamAudio)
        assertEquals(listOf("av1", "h264", "hevc"), device.encodeVideo)
    }

    @Test
    fun theLanguageIsTheBaseOne() {
        // Not the region, nor the regional preferences Android 14 adds to the tag.
        assertEquals("en", profileLanguage(Locale.forLanguageTag("en-US-u-fw-mon-mu-celsius")))
        assertEquals("en", profileLanguage(Locale.ROOT))
        assertEquals("pt", profileLanguage(Locale.forLanguageTag("pt-BR")))
    }
}
