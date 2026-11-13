import Foundation
import Testing

@testable import MatineeCore

struct AppLogTests {
  let known = KnownValues.of(
    server: "https://media.example.org:8443/matinee", account: ["jdoe", "Jane Doe", nil])
  @Test func redaction() {
    let examples = [
      (
        "connecting to MEDIA.example.org as Jane Doe (jdoe)",
        "connecting to <server> as <account> (<account>)"
      ),
      ("GET https://other.host/api/v1/titles/abc?token=x failed", "GET <url> failed"),
      ("Failed to connect to nas.lan/192.168.1.20:8443", "Failed to connect to <host>/<ip>"),
      ("peer fe80::1c2b:3aff:fe4d closed", "peer <ip> closed"),
      ("mail jane@mail.example.de", "mail <email>"),
      ("reached jellyfin.duckdns.org", "reached <host>"),
      ("[file] Cannot open /storage/emulated/0/Movies/heist.mkv", "[file] Cannot open <path>"),
      ("opening Secret.Heist.2024.mkv now", "opening <file> now"),
      (
        "Unable to resolve host \"media.example.net\": No address",
        "Unable to resolve host \"…\": No address"
      ),
      ("title 'Secret Heist' missing", "title '…' missing"),
      (
        "Unexpected JSON token at offset 4: JSON input: {\"title\":\"Secret\"}",
        "Unexpected JSON token at offset 4: JSON input: <removed>"
      ),
      ("Authorization: Bearer abc.def.ghi", "Authorization: Bearer <token>"),
      ("item 0b8c7a3e-1f2d-4c5b-9a8e-7d6c5b4a3f2e gone", "item <id> gone"),
      ("session k3j4h5g6f7d8s9a0q1w2e3r4t5", "session <id>"),
    ]
    for (input, output) in examples { #expect(scrubLogMessage(input, known: known) == output) }
  }
  @Test func usefulDetailsAndBounds() {
    for text in [
      "ExoPlaybackException: ERROR_CODE_IO_NETWORK_CONNECTION_FAILED (2001) video/hevc c2.android.hevc.decoder",
      "at io.github.zekurio.matinee.ui.tv.TvApp.invoke(TvApp.kt:123)",
      "position 01:23:45, The server's answer didn't parse",
      "at androidx.media3.extractor.ts.TsExtractor.read(TsExtractor.java:412)",
    ] { #expect(scrubLogMessage(text, known: known) == text) }
    #expect(formatLogLine("--------- beginning of main") == nil)
    #expect(
      formatLogLine(
        "11-12 01:41:46.123  4321  4350 W MpvPlayer: [ffmpeg] https://media.example.org/x failed",
        known: known) == "11-12 01:41:46.123 W MpvPlayer: [ffmpeg] <url> failed")
    let log = formatLog((1...550).map { "11-12 01:41:46.123  1  2 I Tag: line \($0)" })
    #expect(log.hasPrefix("Matinee app log v1\n"))
    #expect(log.hasSuffix("line 550\n"))
    #expect(!log.contains("line 50\n"))
    #expect(log.count <= AppLog.maxChars + 200)
  }
}
