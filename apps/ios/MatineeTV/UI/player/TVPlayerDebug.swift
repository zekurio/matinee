import Foundation
import MatineeCore

/// Launch arguments that hold the TV player in a state for screenshots on
/// a simulator, the iPhone's `PlayerDebug` for a TV: `-player.engine
/// avPlayer|mpv` picks the engine and saves it, as Settings would;
/// `-player.subtitle 2` picks the second subtitle track once the first
/// source plays; `-player.paused YES` pauses then; `-player.notice
/// burnIn|quality|switch` shows that note, as though the server had said
/// it; `-player.menu audio|subtitles|settings` opens a menu. Release builds
/// read none of them.
enum TVPlayerDebug {
  static func string(_ key: String) -> String? {
    #if DEBUG
      UserDefaults.standard.string(forKey: "player.\(key)")
    #else
      nil
    #endif
  }

  static func flag(_ key: String) -> Bool { string(key).map { ["YES", "1", "true"].contains($0) } ?? false }

  static var engine: PlayerEngine? { string("engine").flatMap(PlayerEngine.init(rawValue:)) }
  static var menu: TVPlayerMenu? { string("menu").flatMap(TVPlayerMenu.init(rawValue:)) }

  /// A note about the last answer to show, as though the server had said it.
  static var notice: MatineeCore.Notice? {
    switch string("notice") {
    case "burnIn": MatineeCore.Notice(.burnInFailed)
    case "quality": MatineeCore.Notice(.qualityFailed)
    case "switch": MatineeCore.Notice(.switchFailed, detail: "Encoder busy")
    default: nil
    }
  }

  /// What the launch asked of a player once its first source plays.
  @MainActor static func apply(to player: PlayerController) async {
    if let number = string("subtitle").flatMap(Int.init), player.subtitles.indices.contains(number - 1) {
      await player.pickSubtitle(player.subtitles[number - 1])
    }
    if flag("paused") { player.pause() }
  }

  /// Writes the sitting's playback report, as About shows it, to the app's
  /// temporary folder, where a simulator's tools can read it after the fact.
  static func save(_ report: PlaybackReport) {
    #if DEBUG
      let url = FileManager.default.temporaryDirectory.appending(path: "playback-report.txt")
      try? formatReport(report).write(to: url, atomically: true, encoding: .utf8)
    #endif
  }
}
