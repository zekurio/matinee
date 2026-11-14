package io.github.zekurio.matinee.api

import io.github.zekurio.matinee.downloads.OfflineItem
import kotlinx.serialization.KSerializer
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The generated models against JSON as the server and older saves have it. */
class ContractJsonTest {
    private val transport = ApiTransport("http://localhost/".toHttpUrl(), OkHttpClient())

    private fun <T> body(serializer: KSerializer<T>, value: T): String =
        Buffer().also { transport.json(serializer, value).writeTo(it) }.readUtf8()

    @Test
    fun unionsReadByTheirTag() {
        val pending = MatineeJson.decodeFromString(DeviceSignIn.serializer(), """{"status":"pending"}""")
        assertEquals(DeviceSignIn.Pending, pending)
        val approved = MatineeJson.decodeFromString(
            DeviceSignIn.serializer(),
            """{"status":"approved","token":"t","user":$USER}""",
        )
        assertTrue(approved is DeviceSignIn.Approved)
        assertEquals("t", (approved as DeviceSignIn.Approved).token)
    }

    @Test
    fun unionsWriteTheirTag() {
        val spec = DownloadSpec(
            video = DownloadVideo.Encode(codec = "h264", maxHeight = 720, bitrate = 4_000_000),
            audio = listOf(DownloadAudio.Copy(index = 1)),
        )
        assertEquals(
            """{"video":{"mode":"encode","codec":"h264","maxHeight":720,"bitrate":4000000},"audio":[{"mode":"copy","index":1}]}""",
            body(DownloadSpec.serializer(), spec),
        )
    }

    @Test
    fun explicitTellsLeftOutFromNull() {
        assertEquals("{}", body(TitlesItemsInput.serializer(), TitlesItemsInput()))
        assertEquals("""{"season":null}""", body(TitlesItemsInput.serializer(), TitlesItemsInput(Explicit(null))))
        assertEquals("""{"season":2}""", body(TitlesItemsInput.serializer(), TitlesItemsInput(Explicit(2))))
    }

    @Test
    fun aRequiredNullIsSent() {
        val input = TitlesSetImageInput(imageId = null)
        assertEquals("""{"imageId":null}""", body(TitlesSetImageInput.serializer(), input))
    }

    @Test
    fun sizesPastTwoGigabytesRead() {
        val item = decodeSaved(MediaItem.serializer(), item(sizeBytes = 5_000_000_000))
        assertEquals(5_000_000_000, item.sizeBytes)
    }

    @Test
    fun aDownloadSavedBeforeTheContractGrewStillReads() {
        // As the app saved it before VideoStream had `interlaced` and
        // `masteringDisplay`, with the spec of its own classes then.
        val saved = """
            {"item":${item(sizeBytes = 1_000)},"kind":"device","file":"a/video.mp4","state":"done",
             "spec":{"video":{"mode":"copy"},"audio":[{"index":1,"mode":"encode","codec":"aac","channels":2}]},
             "segment":3,"bytes":1000,"audio":[],"subtitles":[],"addedAt":1}
        """.trimIndent()
        val entry = decodeSaved(OfflineItem.serializer(), saved)
        val video = entry.item.probe?.video
        assertFalse(video!!.interlaced)
        assertFalse(video.masteringDisplay)
        assertEquals("", entry.item.label.showName)
        assertEquals(null, entry.item.label.title)
        assertEquals("", video.format)
        assertEquals("", video.resolution)
        assertEquals(DownloadVideo.Copy, entry.spec?.video)
        assertEquals(DownloadAudio.Encode(index = 1, codec = "aac", channels = 2), entry.spec?.audio?.single())
    }

    @Test
    fun displayFactsComeFromTheServer() {
        val item = decodeSaved(MediaItem.serializer(), item(sizeBytes = 1_000))
        val video = item.probe!!.video!!.copy(format = "WMV", resolution = "720p", dynamicRange = "HDR10+")
        val displayed = item.copy(probe = item.probe.copy(video = video))
        assertEquals("720p · WMV · HDR10+", io.github.zekurio.matinee.ui.videoSummary(displayed))
        assertEquals(listOf("720p", "HDR10+"), io.github.zekurio.matinee.ui.mediaFlags(displayed))
    }

    @Test
    fun fallbackOptionsDoNotInventServerLists() {
        assertTrue(FALLBACK_PLAYBACK_OPTIONS.qualities.isEmpty())
        assertTrue(FALLBACK_PLAYBACK_OPTIONS.downloadVideoPresets.isEmpty())
        assertTrue(FALLBACK_PLAYBACK_OPTIONS.skipSteps.isEmpty())
        // Only the server can say the account may download, or how much it may stream.
        assertFalse(FALLBACK_PLAYBACK_OPTIONS.downloads)
        assertNull(FALLBACK_PLAYBACK_OPTIONS.maxBitrate)
    }

    @Test
    fun aUserSavedWithoutNewerFieldsStillReads() {
        val user = decodeSaved(User.serializer(), """{"id":"u","username":"ana","role":"user"}""")
        assertEquals("ana", user.name)
        assertEquals("", user.avatarSource)
        assertFalse(user.sharing.stats)
        assertNull(user.playback)
    }

    private companion object {
        const val USER =
            """{"id":"u","username":"ana","displayName":null,"role":"user","avatarId":null,"avatarSource":"none","playback":null,"library":{"showSpecials":true},"sharing":{"favorites":false,"stats":false}}"""

        fun item(sizeBytes: Long) = """
            {"id":"i","libraryId":"l","fileTitle":"Film","relativePath":"Film.mkv","container":"mkv",
             "mimeType":"video/x-matroska","sizeBytes":$sizeBytes,"modifiedAt":"2026-01-01T00:00:00.000Z",
             "durationSeconds":60.0,"favorite":false,
             "probe":{"format":{"name":"matroska,webm","durationSeconds":60.0,"bitRate":3000000},
               "video":{"index":0,"codec":"h264","width":1920,"height":1080,"hdr10Plus":false},
               "audio":[],"subtitles":[]}}
        """.trimIndent()
    }
}
