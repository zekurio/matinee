import Foundation
import MatineeCore

/// Launch arguments that hold the player in a state, for screenshots on a
/// simulator, where there's no finger: `-player.controls YES` keeps the
/// controls up, `-player.menu audio|subtitles|quality|speed` opens a menu,
/// `-player.hidden YES` starts with them away, `-player.paused YES` pauses
/// once the first source plays, `-player.subtitle 2` picks the second
/// subtitle track, `-player.notice burnIn|quality|switch` shows that note,
/// `-player.locked YES` locks it, `-player.scrub 0.4` drags the seek bar to
/// that far along, `-player.gesture brightness|volume|seek|hold` shows a
/// gesture's note, and `-player.engine avPlayer|mpv` picks the engine for
/// this launch. Release builds read none of them.
enum PlayerDebug {
  static func string(_ key: String) -> String? {
    #if DEBUG
      UserDefaults.standard.string(forKey: "player.\(key)")
    #else
      nil
    #endif
  }

  static func flag(_ key: String) -> Bool { string(key).map { ["YES", "1", "true"].contains($0) } ?? false }

  static var menu: PlayerMenu? { string("menu").flatMap(PlayerMenu.init(rawValue:)) }
  static var engine: PlayerEngine? { string("engine").flatMap(PlayerEngine.init(rawValue:)) }
  static var scrub: Double? { string("scrub").flatMap(Double.init) }
  static var gesture: GestureKind? { string("gesture").flatMap(GestureKind.init(rawValue:)) }

  /// A note about the last answer to show, as though the server had said it.
  static var notice: MatineeCore.Notice? {
    switch string("notice") {
    case "burnIn": MatineeCore.Notice(.burnInFailed)
    case "quality": MatineeCore.Notice(.qualityFailed)
    case "switch": MatineeCore.Notice(.switchFailed, detail: "Encoder busy")
    default: nil
    }
  }

  /// Writes the sitting's playback report, as About shows it, to the app's
  /// temporary folder, where a simulator's tools can read it after the fact.
  static func save(_ report: PlaybackReport) {
    #if DEBUG
      let url = FileManager.default.temporaryDirectory.appending(path: "playback-report.txt")
      try? formatReport(report).write(to: url, atomically: true, encoding: .utf8)
    #endif
  }

  /// What the launch asked of a player once its first source plays.
  @MainActor static func apply(to player: PlayerController) async {
    if let number = string("subtitle").flatMap(Int.init), player.subtitles.indices.contains(number - 1) {
      await player.pickSubtitle(player.subtitles[number - 1])
    }
    if flag("paused") { player.pause() }
    if gesture == .hold {
      // Once the tick has seen it play, as a finger held on the video.
      try? await Task.sleep(for: .seconds(1))
      player.startHold()
    }
    if let fraction = scrub {
      player.beginScrub()
      player.scrub(to: fraction * player.duration)
    }
  }
}
