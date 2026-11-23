import Flutter
import Foundation
import OSLog

/// What Dart asks of the system around the app, on an Apple TV: the app's
/// own log. A TV has no photos to pick from and no apps to hand text to.
final class SystemBridge: SystemApi {
  func pickImage(maxBytes: Int64) async throws -> PickedImage? { nil }

  /// The process's own entries in the unified log, as logcat's threadtime
  /// lines, which Dart's app log reads, as the iPhone app writes them
  /// (`ios/Runner/Bridges/SystemBridge.swift`).
  func readLog(maxLines: Int64) async throws -> [String] {
    try await Task.detached(priority: .utility) {
      let store = try OSLogStore(scope: .currentProcessIdentifier)
      let formatter = DateFormatter()
      formatter.locale = Locale(identifier: "en_US_POSIX")
      formatter.dateFormat = "MM-dd HH:mm:ss.SSS"
      var lines: [String] = []
      let limit = max(0, Int(maxLines))
      for case let entry as OSLogEntryLog in try store.getEntries() {
        let tag = entry.category.isEmpty ? (entry.subsystem.isEmpty ? entry.sender : entry.subsystem) : entry.category
        for message in entry.composedMessage.split(separator: "\n", omittingEmptySubsequences: false) {
          lines.append(
            "\(formatter.string(from: entry.date)) \(entry.processIdentifier) \(entry.threadIdentifier) \(level(entry.level)) \(tag): \(message)")
        }
        if lines.count > limit * 2 { lines.removeFirst(lines.count - limit) }
      }
      return Array(lines.suffix(limit))
    }.value
  }

  func shareText(subject: String, text: String) throws {}
}

private func level(_ level: OSLogEntryLog.Level) -> Character {
  switch level {
  case .debug: "D"
  case .info, .notice: "I"
  case .error: "E"
  case .fault: "F"
  default: "V"
  }
}
