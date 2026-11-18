import Foundation
import Testing

@testable import MatineeCore

@Suite struct CuesTests {
  @Test func timingAndBlocks() {
    let track = CueTrack.parse(
      """
      \u{feff}WEBVTT

      NOTE ignored
      00:00.000 --> 00:10.000
      not a cue

      STYLE
      ::cue { color: yellow; }

      identifier
      01:02:03.125 --> 01:02:05.500 line:90% align:start
      first
      second

      01:02:04,000 --> 01:02:06,000
      overlap
      """.replacingOccurrences(of: "\n", with: "\r\n"))
    #expect(track.cues.count == 2)
    #expect(track.at(3723.125).map(\.text) == ["first\nsecond"])
    #expect(track.at(3724).map(\.text) == ["first\nsecond", "overlap"])
    #expect(track.at(3725.5).map(\.text) == ["overlap"])
    #expect(track.at(3726).isEmpty)
  }

  @Test func stylesAndEntities() throws {
    let cue = try #require(
      CueTrack.parse(
        """
        WEBVTT

        00:00.000 --> 00:10.000
        <v Name><c.red><i>italic <b>both</b></i><u>under</u></c></v><ruby>字<rt>ji</rt></ruby> &lt;&gt;&nbsp;&lrm;&rlm;&amp;
        """
      ).cues.first)
    #expect(cue.text == "italic bothunder字ji <>\u{a0}&")
    #expect(cue.spans.first?.italic == true)
    #expect(cue.spans.first { $0.text == "both" }?.bold == true)
    #expect(cue.spans.first { $0.text == "both" }?.italic == true)
    #expect(cue.spans.first { $0.text == "under" }?.underline == true)
  }

  @Test func sortedBoundedOverlapAndEmptyInput() {
    #expect(CueTrack.parse("WEBVTT\n\ninvalid").cues.isEmpty)
    let track = CueTrack(
      cues: (0..<20).reversed().map {
        Cue(
          start: Double($0), end: 100,
          spans: [.init(text: "\($0)", bold: false, italic: false, underline: false)])
      })
    #expect(track.at(-1).isEmpty)
    #expect(track.at(20).map(\.text) == (4..<20).map(String.init))
  }
  @Test func plainTextIsOneUnstyledSpan() {
    let cue = Cue(text: "Subtitles look like this")
    #expect(cue.text == "Subtitles look like this")
    #expect(cue.spans == [CueSpan(text: "Subtitles look like this")])
    #expect(!cue.spans[0].bold && !cue.spans[0].italic && !cue.spans[0].underline)
  }
}
