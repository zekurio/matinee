package io.github.zekurio.matinee.ui.player

import io.github.zekurio.matinee.api.ApiException
import io.github.zekurio.matinee.api.DeviceCodecs
import io.github.zekurio.matinee.api.PlaybackDevice
import io.github.zekurio.matinee.api.PlaybackStart
import io.github.zekurio.matinee.api.SubtitlePick
import io.github.zekurio.matinee.api.SubtitleTrack
import io.github.zekurio.matinee.api.decodeSaved
import io.github.zekurio.matinee.api.playbackProfile
import io.github.zekurio.matinee.api.ProfileSettings
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Builds the server's answers the player takes, from the fields a test sets. */
internal object Answers {
    private const val AAC = """{"index":1,"label":"English","language":"en","codec":"aac","format":"AAC","channels":2,"primary":true}"""
    private const val AC3 = """{"index":2,"label":"German","language":"de","codec":"ac3","format":"AC-3","channels":6,"primary":false}"""

    val vtt = track("""{"id":"sub-1","label":"English","language":"en","source":"sidecar","format":"SRT","delivery":"webvtt"}""")
    val pgsInFile = track("""{"id":"stream-3","label":"English","language":"en","source":"embedded","format":"PGS","delivery":"pgs"}""")
    val pgsBeside = track("""{"id":"sub-2","label":"German","language":"de","source":"sidecar","format":"PGS","delivery":"pgs"}""")
    val vobsub = track("""{"id":"stream-4","label":"French","language":"fr","source":"embedded","format":"VobSub","delivery":"burn-in"}""")
    val assInFile = track("""{"id":"stream-5","label":"Signs","language":"en","source":"embedded","format":"ASS","delivery":"webvtt"}""")

    fun track(json: String): SubtitleTrack = decodeSaved(SubtitleTrack.serializer(), json)

    fun plan(
        method: String = "direct",
        url: String = "/api/media/item-1/stream",
        hls: Boolean = false,
        offset: Double = 0.0,
        start: Double = 0.0,
        audio: Int = 1,
        quality: String = "original",
        convertedAudio: String? = null,
        subtitle: SubtitleTrack? = null,
        subtitleMode: String? = null,
        subtitleUrl: String? = null,
        reasons: List<String> = emptyList(),
        original: Boolean = true,
    ): PlaybackStart {
        val sub = subtitle?.let { """"subtitle":{"id":"${it.id}","label":"${it.label}","language":"${it.language}","source":"${it.source}","format":"${it.format}","delivery":"${it.delivery}"},""" }.orEmpty()
        val audioJson = if (audio == 2) AC3 else AAC
        return decodeSaved(
            PlaybackStart.serializer(),
            """
            {"item":{"id":"item-1","libraryId":"library-1","fileTitle":"File","relativePath":"a.mkv","container":"mkv",
                     "mimeType":"video/x-matroska","sizeBytes":1,"modifiedAt":"2024-01-01T00:00:00Z","durationSeconds":3000.0},
             "method":"$method","url":"$url","hls":$hls,"offset":$offset,"start":$start,"position":${offset + start},
             "audio":$audioJson,"convertedAudio":${convertedAudio?.let { "\"$it\"" } ?: "null"},"convertedVideo":null,"standIn":null,
             $sub
             "subtitleMode":${subtitleMode?.let { "\"$it\"" } ?: "null"},"subtitleUrl":${subtitleUrl?.let { "\"$it\"" } ?: "null"},
             "audioTracks":[$AAC,$AC3],"subtitleTracks":[],"quality":"$quality","original":$original,
             "reasons":[${reasons.joinToString(",") { "\"$it\"" }}],"next":null}
            """,
        )
    }
}

class PlaybackTest {
    private val device: PlaybackDevice =
        playbackProfile(ProfileSettings(PlayerEngine.EXOPLAYER), DeviceCodecs(emptyList(), setOf("aac"), false), Locale.ENGLISH)
    private val resolve = { path: String -> "https://media.example.com$path" }

    @Test
    fun theFileStartsWhereTheViewerStopped() {
        val source = Source.of(Answers.plan(start = 754.2), resolve)
        assertEquals("https://media.example.com/api/media/item-1/stream", source.url)
        assertEquals(SourceMode.DIRECT, source.mode)
        assertEquals(SourceKind.FILE, source.kind)
        assertEquals(754_200L, source.startMs)
        assertEquals(754.2, source.position, 0.0)
        assertTrue(source.holdsTracks)
        assertEquals(SeekWay.IN_SOURCE, source.seek)
        assertEquals(800_000L, source.sourceMs(800.0))
    }

    @Test
    fun aCopiedStreamCountsFromItsOffset() {
        val source = Source.of(Answers.plan(method = "remux", url = "/api/media/item-1/play?start=750.000", offset = 750.0), resolve)
        assertEquals(SourceMode.STREAM, source.mode)
        assertEquals(SourceKind.MP4, source.kind)
        // Its own time 0 is 750 seconds into the file, where it starts.
        assertEquals(0L, source.startMs)
        assertEquals(750.0, source.position, 0.0)
        assertEquals(762.5, source.fileSeconds(12_500), 1e-9)
        assertFalse(source.holdsTracks)
        assertEquals(SeekWay.NEW_STREAM, source.seek)
        // A stream from `playback.seek` in its place starts at its own offset.
        val sought = source.copy(url = "https://media.example.com/api/media/item-1/play?start=1200.000", offset = 1200.0, start = 0.0)
        assertEquals(1200.0, sought.position, 0.0)
        assertEquals(1205.0, sought.fileSeconds(5_000), 1e-9)
    }

    @Test
    fun hlsRunsOnTheFilesTimeline() {
        val source = Source.of(Answers.plan(method = "transcode", url = "/api/media/item-1/hls/main.m3u8", hls = true, start = 300.0), resolve)
        assertEquals(SourceMode.HLS, source.mode)
        assertEquals(SourceKind.HLS, source.kind)
        assertEquals(300_000L, source.startMs)
        assertEquals(301.0, source.fileSeconds(301_000), 1e-9)
        assertEquals(SeekWay.IN_SOURCE, source.seek)
        // An encode that isn't HLS starts again from a new answer.
        assertEquals(SeekWay.NEW_START, source.copy(hls = false).seek)
    }

    @Test
    fun aDownloadPlaysFromWhereItStopped() {
        val source = Source.local("file:///data/video.mkv", 42.0)
        assertEquals(SourceMode.LOCAL, source.mode)
        assertNull(source.method)
        assertEquals(42_000L, source.startMs)
        assertTrue(source.holdsTracks)
    }

    @Test
    fun failedMethodsPileUpAndTravelWithEveryCall() {
        var asking = Asking(Picks(quality = "original"))
        asking = asking.fail("direct")
        asking = asking.fail("direct")
        asking = asking.pick(Picks(audio = 2), emptyList())
        asking = asking.fail("remux")
        val input = asking.input("item-1", "session-1", device, 61.5)
        assertEquals(listOf("direct", "remux"), input.failed)
        assertEquals(2, input.audio)
        assertEquals("original", input.quality)
        assertNull(input.subtitle)
        assertEquals(61.5, input.position!!, 0.0)
        assertEquals("before", input.snap)
        assertEquals(device, input.device)
        assertTrue(asking.forgetFailures().failed.isEmpty())
    }

    @Test
    fun picksAddUp() {
        val asking = Asking()
            .pick(Picks(audio = 2), emptyList())
            .pick(Picks(subtitle = SubtitlePick("sub-1")), listOf(Answers.vtt))
            .pick(Picks(subtitle = SubtitlePick(null)), listOf(Answers.vtt))
        assertEquals(Picks(audio = 2, subtitle = SubtitlePick(null)), asking.picks)
    }

    @Test
    fun aPickThatTakesAnEncodeTriesEncodesAgain() {
        val failed = Asking(failed = listOf("direct", "transcode"))
        val tracks = listOf(Answers.vtt, Answers.pgsInFile, Answers.vobsub)
        assertEquals(listOf("direct"), failed.pick(Picks(quality = "720p-4"), tracks).failed)
        assertEquals(listOf("direct"), failed.pick(Picks(subtitle = SubtitlePick("stream-3")), tracks).failed)
        assertEquals(listOf("direct"), failed.pick(Picks(subtitle = SubtitlePick("stream-4")), tracks).failed)
        // The original, text the screen draws, and off take no encode.
        assertEquals(listOf("direct", "transcode"), failed.pick(Picks(quality = "original"), tracks).failed)
        assertEquals(listOf("direct", "transcode"), failed.pick(Picks(subtitle = SubtitlePick("sub-1")), tracks).failed)
        assertEquals(listOf("direct", "transcode"), failed.pick(Picks(subtitle = SubtitlePick(null)), tracks).failed)
    }

    @Test
    fun aBurnInThatFailedTurnsSubtitlesOff() {
        val asking = Asking(Picks(subtitle = SubtitlePick("stream-4")))
        val lost = Answers.plan(method = "transcode", hls = true, subtitle = Answers.vobsub, subtitleMode = "burn-in", quality = "1080p-20")
        val (after, notice) = asking.settle(lost, Answers.plan())
        assertEquals(NoticeKind.BURN_IN_FAILED, notice)
        assertEquals(SubtitlePick(null), after.picks.subtitle)
    }

    @Test
    fun aQualityThatFailedGoesBackToTheOriginal() {
        val asking = Asking(Picks(quality = "720p-4"))
        val lost = Answers.plan(method = "transcode", hls = true, quality = "720p-4")
        val (after, notice) = asking.settle(lost, Answers.plan(quality = "original"))
        assertEquals(NoticeKind.QUALITY_FAILED, notice)
        assertEquals("original", after.picks.quality)
        // An answer to a pick, rather than to a failure, leaves the picks alone.
        assertEquals(asking to null, asking.settle(null, Answers.plan(quality = "original")))
        // A file that failed as it is says nothing: the stream after it is what the server does.
        assertEquals(null, Asking(Picks(quality = "original")).settle(Answers.plan(), Answers.plan(method = "remux")).second)
    }

    @Test
    fun aQualityTheServerPlayedTheOriginalForFailsNothing() {
        // The account may not encode, so the picked encode played as the file; when the file fails, a stream follows.
        val asking = Asking(Picks(quality = "1080p-20"))
        val (after, notice) = asking.settle(Answers.plan(), Answers.plan(method = "remux"))
        assertNull(notice)
        assertEquals("1080p-20", after.picks.quality)
    }

    @Test
    fun aRememberedOriginalOverTheLimitTakesTheServersEncode() {
        // The file is over the account's limit: the server answers with an encode under it, and the menu has no original.
        val plan = Answers.plan(method = "transcode", hls = true, quality = "720p-4", reasons = listOf("limit"), original = false)
        assertFalse(plan.original)
        assertEquals(Asking(Picks(quality = "original")) to null, Asking(Picks(quality = "original")).settle(null, plan))
        // An encode that fails then stays an encode, and says nothing of the original.
        val next = Answers.plan(method = "transcode", hls = false, quality = "720p-4", reasons = listOf("limit", "failed"), original = false)
        assertNull(Asking(Picks(quality = "original")).settle(plan, next).second)
    }

    @Test
    fun refusalsStopThePlayer() {
        assertEquals(Refusal.RESTRICTED, refusal(ApiException(403, "PLAYBACK_RESTRICTED", "This file is over your account's limit.")))
        assertEquals(Refusal.BUSY, refusal(ApiException(429, "TOO_MANY_STREAMS", "You're playing on 2 devices already.")))
        assertNull(refusal(ApiException(422, "UNPLAYABLE", "Nothing plays.")))
        assertNull(refusal(java.io.IOException("reset")))
    }

    @Test
    fun theSameSourcePlaysOn() {
        val file = Answers.plan()
        // Another audio track in the file is picked inside it.
        assertTrue(sameSource(file, Answers.plan(audio = 2)))
        assertTrue(sameSource(file, Answers.plan(subtitle = Answers.vtt, subtitleMode = "client", subtitleUrl = "/s")))
        assertFalse(sameSource(file, Answers.plan(method = "remux", offset = 10.0)))
        val stream = Answers.plan(method = "remux", offset = 10.0)
        // Where it would start differs, as after a subtitle the screen draws.
        assertTrue(sameSource(stream, Answers.plan(method = "remux", offset = 20.0, subtitle = Answers.vtt, subtitleMode = "client")))
        assertFalse(sameSource(stream, Answers.plan(method = "remux", audio = 2)))
        assertFalse(sameSource(stream, Answers.plan(method = "remux", convertedAudio = "opus")))
        val encode = Answers.plan(method = "transcode", hls = true, quality = "1080p-20")
        assertFalse(sameSource(encode, Answers.plan(method = "transcode", hls = true, quality = "720p-4")))
        assertFalse(sameSource(encode, Answers.plan(method = "transcode", hls = true, quality = "1080p-20", subtitle = Answers.vobsub, subtitleMode = "burn-in")))
    }

    @Test
    fun theAnswerSaysWhoDrawsTheSubtitle() {
        assertEquals(SubtitleShow.Off, subtitleShow(Answers.plan(), mpv = false))
        val text = Answers.plan(subtitle = Answers.vtt, subtitleMode = "client", subtitleUrl = "/api/media/item-1/subtitles/sub-1")
        assertEquals(SubtitleShow.Screen(Answers.vtt, "/api/media/item-1/subtitles/sub-1"), subtitleShow(text, mpv = false))
        assertEquals(SubtitleShow.Screen(Answers.vtt, "/api/media/item-1/subtitles/sub-1"), subtitleShow(text, mpv = true))
        val inFile = Answers.plan(subtitle = Answers.pgsInFile, subtitleMode = "player")
        assertEquals(SubtitleShow.InFile(Answers.pgsInFile, 3), subtitleShow(inFile, mpv = false))
        val styled = Answers.plan(subtitle = Answers.assInFile, subtitleMode = "player")
        assertEquals(SubtitleShow.InFile(Answers.assInFile, 5), subtitleShow(styled, mpv = true))
        val beside = Answers.plan(method = "remux", offset = 30.0, subtitle = Answers.pgsBeside, subtitleMode = "client", subtitleUrl = "/api/media/item-1/subtitles/sub-2")
        assertEquals(SubtitleShow.Overlay(Answers.pgsBeside, "/api/media/item-1/subtitles/sub-2"), subtitleShow(beside, mpv = true))
        // ExoPlayer says it doesn't draw PGS files, so the server never answers with one; were it to, nothing shows.
        assertEquals(SubtitleShow.Off, subtitleShow(beside, mpv = false))
        val burned = Answers.plan(method = "transcode", hls = true, subtitle = Answers.vobsub, subtitleMode = "burn-in")
        assertEquals(SubtitleShow.Burned(Answers.vobsub), subtitleShow(burned, mpv = false))
        assertEquals(SubtitleRendering.BURN_IN, subtitleShow(burned, mpv = false).rendering)
        assertEquals(SubtitleRendering.PLAYER, subtitleShow(beside, mpv = true).rendering)
    }

    @Test
    fun aDownloadDrawsItsOwnSubtitles() {
        val url = "https://media.example.com/api/media/item-1/subtitles/x"
        assertEquals(SubtitleShow.Off, downloadSubtitleShow(null, mpv = false, url))
        assertEquals(SubtitleShow.Screen(Answers.vtt, url), downloadSubtitleShow(Answers.vtt, mpv = false, url))
        assertEquals(SubtitleShow.InFile(Answers.pgsInFile, 3), downloadSubtitleShow(Answers.pgsInFile, mpv = false, url))
        assertEquals(SubtitleShow.InFile(Answers.vobsub, 4), downloadSubtitleShow(Answers.vobsub, mpv = true, url))
        // Only mpv keeps ASS styling; ExoPlayer's screen draws its WebVTT.
        assertEquals(SubtitleShow.InFile(Answers.assInFile, 5), downloadSubtitleShow(Answers.assInFile, mpv = true, url))
        assertEquals(SubtitleShow.Screen(Answers.assInFile, url), downloadSubtitleShow(Answers.assInFile, mpv = false, url))
        // A PGS file beside it isn't saved with a download.
        assertEquals(SubtitleShow.Off, downloadSubtitleShow(Answers.pgsBeside, mpv = true, url))
    }
}
