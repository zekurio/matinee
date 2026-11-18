import Foundation
import Testing

@testable import MatineeCore

/// DownloadSheet.kt's and DownloadFilesSheet.kt's decisions over the server's answers.
struct DownloadSheetDataTests {
  private static let p1080 = DownloadVideoPreset(height: 1080, bitrate: 6_000_000)
  private static let p720 = DownloadVideoPreset(height: 720, bitrate: 2_500_000)

  private func ready(id: String = "a", audio: String = Self.twoTracks, videoMode: String = "copy", bytes: Int = 1000)
    throws -> DownloadResolution.Ready
  {
    let json = """
      {"status":"ready","id":"\(id)","originalPlays":false,
       "choices":{"keepsVideo":true,"presets":[{"height":1080,"bitrate":6000000},{"height":720,"bitrate":2500000}],
         "codecs":["h264","hevc"],"hdrCodecs":[],"audio":\(audio),"subtitles":[],"burnIn":[]},
       "spec":{"container":"mp4","video":{"mode":"copy"},"audio":[{"index":1,"mode":"copy"}],"subtitles":[],"burnIn":null},
       "plan":{"container":"mp4","durationSeconds":60,"estimatedBytes":\(bytes),"segmentSeconds":6,
         "video":{"mode":"\(videoMode)","codec":"hevc","width":640,"height":360,"bitrate":425903,"hdr":null,"toneMapped":false,"hardware":false},
         "audio":[],"subtitles":[],"burnIn":null}}
      """
    guard case .ready(let ready) = try JSONDecoder().decode(DownloadResolution.self, from: Data(json.utf8)) else {
      throw CancellationError()
    }
    return ready
  }

  private static let twoTracks = """
    [{"track":{"index":2,"label":"German","language":"de","codec":"aac","format":"AAC","primary":false},"keep":true,"conversions":[]},
     {"track":{"index":1,"label":"English","language":"en","codec":"aac","format":"AAC","primary":true},"keep":true,"conversions":[]}]
    """

  private func source(_ ready: DownloadResolution.Ready) throws -> DownloadSource {
    DownloadSource(item: try offlineFixture(ready.id).item, resolved: ready)
  }

  @Test func aPresetTheServerCantMakeDoesntShow() throws {
    let plan = try ready().plan
    let plans: [DownloadChoice: DownloadPlan] = [.device(nil): plan, .device(Self.p720): plan]
    #expect(shownChoices([Self.p1080, Self.p720], plans: plans) == [.device(nil), .device(Self.p720), .original])
    #expect(settledChoice(.device(Self.p1080), plans: plans) == .device(nil))
    #expect(settledChoice(.device(Self.p720), plans: plans) == .device(Self.p720))
    #expect(settledChoice(.original, plans: plans) == .original)
  }

  @Test func thePrimaryTrackGoesFirstAndAVersionNeedsOne() throws {
    let source = try source(ready())
    #expect(chosenAudio(source, indices: [2, 1]).map(\.index) == [1, 2])
    #expect(chosenAudio(source, indices: [2]).map(\.index) == [2])
    #expect(missingAudio(source, choice: .device(nil), indices: []))
    #expect(!missingAudio(source, choice: .original, indices: []))
    #expect(!missingAudio(source, choice: .device(nil), indices: [2]))
    // A file without audio needs none.
    let silent = try self.source(ready(audio: "[]"))
    #expect(!missingAudio(silent, choice: .device(nil), indices: []))
  }

  @Test func downloadWaitsForThePlanOfAVersion() throws {
    let plan = try ready().plan
    #expect(canStart(.original, planning: true, missingAudio: true, plans: [:]))
    #expect(!canStart(.device(nil), planning: true, missingAudio: false, plans: [.device(nil): plan]))
    #expect(!canStart(.device(nil), planning: false, missingAudio: true, plans: [.device(nil): plan]))
    #expect(!canStart(.device(nil), planning: false, missingAudio: false, plans: [:]))
    #expect(canStart(.device(nil), planning: false, missingAudio: false, plans: [.device(nil): plan]))
  }

  @Test func theCodecRowSaysWhatTheServerDoesWithTheVideo() throws {
    let kept = try ready().plan
    let encoded = try ready(videoMode: "encode").plan
    #expect(codecRow(.original, plan: nil, codecs: ["h264"]) == .hidden)
    #expect(codecRow(.device(nil), plan: kept, codecs: []) == .hidden)
    #expect(codecRow(.device(nil), plan: kept, codecs: ["h264", "hevc"]) == .kept("hevc"))
    #expect(codecRow(.device(nil), plan: encoded, codecs: ["h264", "hevc"]) == .choose(["h264", "hevc"]))
    // A preset encodes whatever the plan for this device said.
    #expect(codecRow(.device(Self.p720), plan: kept, codecs: ["h264"]) == .choose(["h264"]))
    #expect(codecRow(.device(nil), plan: nil, codecs: ["h264"]) == .choose(["h264"]))
    #expect(startingCodec("hevc", codecs: ["h264", "hevc"]) == "hevc")
    #expect(startingCodec("auto", codecs: ["h264", "hevc"]) == "h264")
    #expect(startingCodec("auto", codecs: []) == nil)
  }

  @Test func aSeasonComesToItsFilesOrTheServersEstimates() throws {
    let a = try offlineFixture("a").item
    let b = try offlineFixture("b").item
    let results: [DownloadResolution] = [
      .ready(try ready(id: "a", bytes: 300)), .ready(try ready(id: "b", bytes: 200)),
      .ready(try ready(id: "c", bytes: 900)), .unavailable(.init(id: "d", message: "No")),
    ]
    #expect(filesSize(.original, missing: [a, b], results: results) == a.sizeBytes + b.sizeBytes)
    #expect(filesSize(.device(nil), missing: [a, b], results: results) == 500)
  }
}
