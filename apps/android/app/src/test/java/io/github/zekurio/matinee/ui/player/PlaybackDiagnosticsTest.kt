package io.github.zekurio.matinee.ui.player

import io.github.zekurio.matinee.api.AudioTrack
import io.github.zekurio.matinee.api.MediaItem
import io.github.zekurio.matinee.api.SubtitleTrack
import io.github.zekurio.matinee.api.decodeSaved
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackDiagnosticsTest {
    // Only the fields these tests read; decodeSaved fills in the rest as empty.
    private val item = decodeSaved(
        MediaItem.serializer(),
        """
        {"id":"item-8f3a2c","libraryId":"library-77d1","fileTitle":"Secret Heist",
         "relativePath":"Movies/Secret Heist (2024)/secret.heist.mkv","container":"mkv",
         "mimeType":"video/x-matroska","sizeBytes":4000000000,"modifiedAt":"2024-05-01T10:00:00Z",
         "durationSeconds":6000.0,
         "probe":{"format":{"name":"matroska,webm"},
           "video":{"index":0,"codec":"hevc","profile":"Main 10","width":3840,"height":2160,"bitDepth":10,"hdr":"hdr10"},
           "audio":[{"index":1,"codec":"truehd","channels":8,"language":"en","title":"Jane Doe commentary"},
                    {"index":2,"codec":"ac3","channels":6}],
           "subtitles":[{"index":3,"codec":"hdmv_pgs_subtitle","title":"Signs and Songs"}]}}
        """,
    )

    private val audio = decodeSaved(
        AudioTrack.serializer(),
        """
        {"index":1,"label":"English, Jane Doe commentary","language":"en","title":"Jane Doe commentary",
         "codec":"truehd","format":"TrueHD Atmos","channels":8}
        """,
    )

    private val subtitle = decodeSaved(
        SubtitleTrack.serializer(),
        """
        {"id":"stream-3","label":"English, Signs and Songs","language":"en","title":"Signs and Songs",
         "source":"embedded","format":"PGS","delivery":"pgs"}
        """,
    )

    private val device = DeviceDiagnostics.of(
        appVersion = "0.1.0",
        appBuild = 1,
        buildType = "release",
        androidRelease = "15",
        sdk = 35,
        manufacturer = "Google",
        model = "Pixel 8",
        abi = "arm64-v8a",
        tv = false,
        media3 = "1.11.1",
        ffmpeg = true,
    )

    private fun report() = PlaybackReport(
        device = device,
        settings = SettingsDiagnostics.of(PlayerEngine.EXOPLAYER, Decoders.HARDWARE, ORIGINAL_QUALITY, AUTOMATIC, "opus", setOf("eac3", "ac3")),
        file = FileDiagnostics.of(item),
        selection = SelectionDiagnostics.of(audio, subtitle, SubtitleRendering.BURN_IN),
        capabilities = CapabilityDiagnostics(
            decodesVideo = true,
            readsContainer = true,
            takesAudio = false,
            streamAudioCodecs = safeCodecs(listOf("opus", "aac")),
            encodeVideoCodecs = safeCodecs(listOf("hevc", "h264")),
            serverVideoCodecs = safeCodecs(listOf("h264", "hevc")),
            serverAudioCodecs = safeCodecs(listOf("aac", "opus")),
        ),
    )

    private fun recorder(sink: MutableList<PlaybackReport> = mutableListOf()) = DiagnosticsRecorder(report()) { sink += it }

    private fun httpError(status: Int) = ErrorDiagnostics(
        code = 2004,
        name = Safe.constant("ERROR_CODE_IO_BAD_HTTP_STATUS"),
        type = Safe.token("source"),
        httpStatus = status,
        causes = listOfNotNull(Safe.token("InvalidResponseCodeException")),
    )

    @Test
    fun formatsAttemptsAndCodes() {
        val r = recorder()
        r.attempt(SourceMode.DIRECT, AttemptReason.START, 12.7, 1, null, burnIn = false)
        r.failed(httpError(401))
        r.attempt(SourceMode.HLS, AttemptReason.FALLBACK, 12.7, 1, "1080p-20", burnIn = true)
        r.tracks(
            listOf(
                TrackDiagnostics(TrackKind.VIDEO, true, Safe.mime("video/avc"), Safe.token("avc1.640028"), 1920, 1080, null, null, 8_000_000, Safe.constant("YES")),
                TrackDiagnostics(TrackKind.AUDIO, true, Safe.mime("audio/opus"), null, null, null, 2, 48000, null, Safe.constant("YES")),
            ),
        )
        r.decoder(DecoderDiagnostics(TrackKind.VIDEO, Safe.token("c2.android.avc.decoder")))
        r.playing()
        val text = formatReport(r.report)

        assertTrue(text.contains("app: 0.1.0 (1, release)"))
        assertTrue(text.contains("android: 15 (api 35), arm64-v8a"))
        assertTrue(text.contains("device: Google Pixel 8"))
        assertTrue(text.contains("engine: exoplayer, decoders: hardware"))
        assertTrue(text.contains("convert_audio=ac3,eac3"))
        assertTrue(text.contains("file: container=mkv video=hevc (Main 10) 3840x2160 10bit hdr=hdr10"))
        assertTrue(text.contains("file tracks: audio=truehd,ac3 subtitles=1"))
        assertTrue(text.contains("audio picked: #1 truehd 8ch"))
        assertTrue(text.contains("subtitle picked: pgs embedded delivery=pgs drawn_by=burn_in"))
        assertTrue(text.contains("device plays: video=yes container=yes audio=no"))
        assertTrue(text.contains("  1. direct reason=start at=12s audio=#1 -> failed"))
        assertTrue(text.contains("error: ERROR_CODE_IO_BAD_HTTP_STATUS (2004) type=source http=401 causes=InvalidResponseCodeException"))
        assertTrue(text.contains("  2. hls reason=fallback at=12s audio=#1 quality=1080p-20 burn_in=yes -> playing"))
        assertTrue(text.contains("video selected video/avc codecs=avc1.640028 1920x1080 8000kbps support=YES"))
        assertTrue(text.contains("audio selected audio/opus 2ch 48000Hz support=YES"))
        assertTrue(text.contains("decoders: video=c2.android.avc.decoder"))
        assertFalse(r.report.failed)
    }

    @Test
    fun leavesOutWhatTellsWhoOrWhat() {
        val r = recorder()
        r.attempt(SourceMode.STREAM, AttemptReason.START, 0.0, 1, null, burnIn = false)
        // Anything that isn't a short code turns into "other", whatever it came from.
        r.failed(
            ErrorDiagnostics(
                code = 2004,
                name = Safe.constant("Response code: 401 for https://media.example.com/api/v1/media/item-8f3a2c/stream?token=abc123"),
                decoder = Safe.token("/data/user/0/io.github.zekurio.matinee/files/downloads/secret.heist.mkv"),
                causes = listOfNotNull(Safe.token("Bearer abc123: jane@example.com")),
            ),
        )
        r.tracks(
            listOf(TrackDiagnostics(TrackKind.VIDEO, true, Safe.mime("http://media.example.com/x"), Safe.token("file:///sdcard/secret.mkv"), null, null, null, null, null, null)),
        )
        val text = formatReport(r.report)

        for (secret in listOf(
            "Secret", "Heist", "secret.heist", "item-8f3a2c", "library-77d1", "Jane", "commentary", "Signs", "Songs",
            "English", "Atmos", "example.com", "token=", "abc123", "Bearer", "@", "://", "/data", "sdcard", "2024-05-01",
        )) {
            assertFalse("report holds \"$secret\":\n$text", text.contains(secret, ignoreCase = true))
        }
        assertTrue(text.contains("error: other (2004) decoder=other causes=other"))
    }

    @Test
    fun keepsOnlyTheLatestAttempts() {
        val r = recorder()
        repeat(30) { r.attempt(SourceMode.STREAM, AttemptReason.AUDIO_CHANGE, it.toDouble(), it, null, burnIn = false) }
        val report = r.report
        assertEquals(MAX_ATTEMPTS, report.attempts.size)
        assertEquals(30 - MAX_ATTEMPTS, report.droppedAttempts)
        assertEquals((30 - MAX_ATTEMPTS + 1..30).toList(), report.attempts.map { it.number })
        assertTrue(formatReport(report).contains("attempts: (${30 - MAX_ATTEMPTS} earlier left out)"))
    }

    @Test
    fun boundsTracksDecodersAndCauses() {
        val r = recorder()
        r.attempt(SourceMode.DIRECT, AttemptReason.START, 0.0, null, null, burnIn = false)
        val track = TrackDiagnostics(TrackKind.AUDIO, false, Safe.mime("audio/ac3"), null, null, null, 6, 48000, null, Safe.constant("NO_UNSUPPORTED_TYPE"))
        r.tracks(List(10) { track })
        repeat(10) { r.decoder(DecoderDiagnostics(TrackKind.AUDIO, Safe.token("decoder.$it"))) }
        r.decoder(DecoderDiagnostics(TrackKind.AUDIO, Safe.token("decoder.9")))
        r.failed(ErrorDiagnostics(4001, Safe.constant("ERROR_CODE_DECODER_INIT_FAILED"), causes = List(10) { Safe.token("Cause$it")!! }))
        val report = r.report
        assertEquals(MAX_TRACKS, report.tracks.size)
        assertEquals(MAX_DECODERS, report.decoders.size)
        assertEquals(listOf("decoder.6", "decoder.7", "decoder.8", "decoder.9"), report.decoders.map { it.name?.text })
        assertEquals(MAX_CAUSES, report.latest?.error?.causes?.size)
        assertTrue(report.failed)
    }

    @Test
    fun followsEachAttemptsOutcome() {
        val sink = mutableListOf<PlaybackReport>()
        val r = recorder(sink)
        r.attempt(SourceMode.DIRECT, AttemptReason.START, 0.0, null, null, burnIn = false)
        r.attempt(SourceMode.HLS, AttemptReason.QUALITY_CHANGE, 30.0, null, "720p-4", burnIn = false)
        assertEquals(listOf(AttemptOutcome.REPLACED, AttemptOutcome.LOADING), r.report.attempts.map { it.outcome })

        r.failed(httpError(500))
        r.playing()
        assertEquals(AttemptOutcome.FAILED, r.report.latest?.outcome)

        r.attempt(SourceMode.HLS, AttemptReason.RETRY, 30.0, null, "720p-4", burnIn = false)
        r.closed()
        assertEquals(AttemptOutcome.CLOSED, r.report.latest?.outcome)
        assertEquals(AttemptOutcome.FAILED, r.report.attempts[1].outcome)

        r.note(DiagnosticsNote.SUBTITLE_LOAD_FAILED)
        r.note(DiagnosticsNote.SUBTITLE_LOAD_FAILED)
        assertTrue(formatReport(r.report).contains("notes: subtitle_load_failed x2"))
        // Every change reaches the store, starting with the report before any attempt.
        assertEquals(r.report, sink.last())
        assertTrue(sink.first().attempts.isEmpty())
    }

    @Test
    fun emptyReportSaysSo() {
        val text = formatReport(report())
        assertTrue(text.contains("attempts:\n  none"))
        assertTrue(text.contains("tracks:\n  none reported"))
    }

    @Test
    fun storeKeepsTheLatestUntilCleared() {
        PlaybackDiagnostics.clear()
        assertNull(PlaybackDiagnostics.latest.value)
        val r = DiagnosticsRecorder(report())
        r.attempt(SourceMode.LOCAL, AttemptReason.START, 0.0, null, null, burnIn = false)
        assertEquals(r.report, PlaybackDiagnostics.latest.value)
        PlaybackDiagnostics.clear()
        assertNull(PlaybackDiagnostics.latest.value)
    }

    @Test
    fun safeTakesOnlyCodes() {
        assertEquals("Main 10", Safe.token("Main 10")?.text)
        assertEquals("c2.qti.hevc.decoder", Safe.token("c2.qti.hevc.decoder")?.text)
        assertNull(Safe.token(null))
        assertNull(Safe.token("  "))
        for (bad in listOf("a/b", "a:b", "a?b", "a=b", "a@b", "a\\b", "a%20b", "x".repeat(49), "line\nbreak", "ümlaut")) {
            assertEquals(bad, Safe.OTHER, Safe.token(bad))
        }
        assertEquals("mkv", Safe.known("MKV", KNOWN_CONTAINERS)?.text)
        assertEquals(Safe.OTHER, Safe.known("secret.heist.mkv", KNOWN_CONTAINERS))
        assertEquals("video/avc", Safe.mime("video/avc")?.text)
        assertEquals("audio/mp4a-latm", Safe.mime("audio/mp4a-latm")?.text)
        assertEquals(Safe.OTHER, Safe.mime("file/secret"))
        assertEquals(Safe.OTHER, Safe.mime("video/a/b"))
        assertEquals(Safe.OTHER, Safe.mime("video/../x y"))
        assertEquals("pcm_s24le", safeAudioCodec("pcm_s24le")?.text)
        assertEquals(Safe.OTHER, safeAudioCodec("pcm_/etc/passwd"))
        assertEquals(Safe.OTHER, safeQuality("4k-secret"))
    }
}
