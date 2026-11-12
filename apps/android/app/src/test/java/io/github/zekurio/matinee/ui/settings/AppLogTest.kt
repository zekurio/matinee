package io.github.zekurio.matinee.ui.settings

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AppLogTest {
    private val known = KnownValues.of("https://media.example.org:8443/matinee", listOf("jdoe", "Jane Doe", null))

    private fun scrub(message: String) = scrubLogMessage(message, known)

    @Test
    fun takesOutTheServerAndTheAccount() {
        assertEquals("connecting to <server> as <account> (<account>)", scrub("connecting to MEDIA.example.org as Jane Doe (jdoe)"))
    }

    @Test
    fun takesOutAddresses() {
        assertEquals("GET <url> failed", scrub("GET https://other.host/api/v1/titles/abc?token=x failed"))
        assertEquals("Failed to connect to <host>/<ip>", scrub("Failed to connect to nas.lan/192.168.1.20:8443"))
        assertEquals("peer <ip> closed", scrub("peer fe80::1c2b:3aff:fe4d closed"))
        assertEquals("mail <email>", scrub("mail jane@mail.example.de"))
        assertEquals("reached <host>", scrub("reached jellyfin.duckdns.org"))
    }

    @Test
    fun takesOutPathsFilesAndQuotes() {
        assertEquals("[file] Cannot open <path>", scrub("[file] Cannot open /storage/emulated/0/Movies/heist.mkv"))
        assertEquals("opening <file> now", scrub("opening Secret.Heist.2024.mkv now"))
        assertEquals("Unable to resolve host \"…\": No address", scrub("Unable to resolve host \"media.example.net\": No address"))
        assertEquals("title '…' missing", scrub("title 'Secret Heist' missing"))
        assertEquals("Unexpected JSON token at offset 4: JSON input: <removed>", scrub("Unexpected JSON token at offset 4: JSON input: {\"title\":\"Secret\"}"))
    }

    @Test
    fun takesOutTokensAndIds() {
        assertEquals("Authorization: Bearer <token>", scrub("Authorization: Bearer abc.def.ghi"))
        assertEquals("item <id> gone", scrub("item 0b8c7a3e-1f2d-4c5b-9a8e-7d6c5b4a3f2e gone"))
        assertEquals("session <id>", scrub("session k3j4h5g6f7d8s9a0q1w2e3r4t5"))
    }

    @Test
    fun keepsWhatHelps() {
        val error = "ExoPlaybackException: ERROR_CODE_IO_NETWORK_CONNECTION_FAILED (2001) video/hevc c2.android.hevc.decoder"
        assertEquals(error, scrub(error))
        val frame = "at io.github.zekurio.matinee.ui.tv.TvApp.invoke(TvApp.kt:123)"
        assertEquals(frame, scrub(frame))
        val time = "position 01:23:45, The server's answer didn't parse"
        assertEquals(time, scrub(time))
        val ts = "at androidx.media3.extractor.ts.TsExtractor.read(TsExtractor.java:412)"
        assertEquals(ts, scrub(ts))
    }

    @Test
    fun readsThreadtimeLines() {
        val line = "11-12 01:41:46.123  4321  4350 W MpvPlayer: [ffmpeg] https://media.example.org/x failed"
        assertEquals("11-12 01:41:46.123 W MpvPlayer: [ffmpeg] <url> failed", formatLogLine(line, known))
        assertNull(formatLogLine("--------- beginning of main", known))
    }

    @Test
    fun keepsTheLatestLinesWithinBounds() {
        val lines = (1..MAX_LOG_LINES + 50).map { "11-12 01:41:46.123  1  2 I Tag: line $it" }
        val log = formatLog(lines, known)
        assertTrue(log.startsWith("Matinee app log v1\n"))
        assertTrue(log.endsWith("line ${MAX_LOG_LINES + 50}\n"))
        assertFalse(log.contains("line 50\n"))
        assertTrue(log.length <= MAX_LOG_CHARS + 200)
    }
}
