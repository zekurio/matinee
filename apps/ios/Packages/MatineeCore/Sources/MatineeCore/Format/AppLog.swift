import Foundation
import OSLog

public struct KnownValues: Sendable {
  public var server: [String]
  public var account: [String]
  public init(server: [String] = [], account: [String] = []) {
    self.server = server
    self.account = account
  }
  public static func of(server: String?, account: [String?]) -> Self {
    Self(
      server: server.flatMap { URL(string: $0)?.host }.map { [$0] } ?? [],
      account: account.compactMap { $0 })
  }
}
public enum AppLog {
  public static let subsystem = "io.github.zekurio.matinee"
  public static let downloads = Logger(subsystem: subsystem, category: "downloads")
  public static let player = Logger(subsystem: subsystem, category: "player")
  public static let auth = Logger(subsystem: subsystem, category: "auth")
  public static let api = Logger(subsystem: subsystem, category: "api")
  public static let app = Logger(subsystem: subsystem, category: "app")
  public static let maxLines = 500
  public static let maxChars = 60000
  public static func read(known: KnownValues) throws -> String {
    // Unlike logcat, OSLogStore is scoped to this process and cannot read a
    // previous process's entries. Only read when About asks, never upload.
    let store = try OSLogStore(scope: .currentProcessIdentifier)
    let entries = try store.getEntries(at: store.position(timeIntervalSinceLatestBoot: 0))
    let lines = entries.compactMap { entry -> String? in
      guard let log = entry as? OSLogEntryLog else { return nil }
      return
        "\(log.date.ISO8601Format()) \(scrubLogMessage(log.category, known: known).prefix(32)): \(scrubLogMessage(log.composedMessage, known: known))"
    }
    return formatScrubbedLog(lines)
  }
}
private func replacing(_ text: String, _ pattern: String, _ template: String) -> String {
  guard let regex = try? NSRegularExpression(pattern: pattern) else {
    preconditionFailure("Invalid log pattern")
  }
  return regex.stringByReplacingMatches(
    in: text, range: NSRange(text.startIndex..., in: text), withTemplate: template)
}
public func scrubLogMessage(_ message: String, known: KnownValues = .init()) -> String {
  var text = replacing(message, #"(?i)(JSON input:).*"#, "$1 <removed>")
  text = replacing(text, #"(?i)\b[a-z][a-z0-9+.\-]*://[^\s\"'<>]+"#, "<url>")
  for (values, replacement) in [(known.server, "<server>"), (known.account, "<account>")] {
    for value in values.filter({ $0.count >= 3 }).sorted(by: { $0.count > $1.count }) {
      text = text.replacingOccurrences(of: value, with: replacement, options: .caseInsensitive)
    }
  }
  let patterns = [
    (#"(?i)\b(bearer|basic)\s+[^\s,;]+"#, "$1 <token>"),
    (
      #"(?i)\b(token|access_token|refresh_token|password|secret|cookie|authorization|verifier)([\"']?\s*[=:]\s*)(?!(?:bearer|basic)\b)[^\s,;&\"']+"#,
      "$1$2<token>"
    ),
    (#"[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+"#, "<email>"),
    (#"\"[^\"\n]*\""#, "\"…\""),
    (#"(?<!\w)'[^'\n]+'(?!\w)"#, "'…'"),
    (#"(?<![\w.:/<>\-])/(?:[^\s/\"',;()\[\]]+/)+[^\s\"',;()\[\]]*"#, "<path>"),
    (
      #"(?i)[^\s/\"',;()\[\]]*\.(?:mkv|mp4|m4v|mov|webm|avi|ts|m2ts|mts|mpg|mpeg|ogv|wmv|flv|srt|ass|ssa|vtt|sup|sub|idx)(?!\w|\.\w)"#,
      "<file>"
    ),
    (#"\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b"#, "<ip>"),
  ]
  for (pattern, replacement) in patterns { text = replacing(text, pattern, replacement) }
  let ipv6 = try! NSRegularExpression(
    pattern: #"(?<![\w:])[0-9a-fA-F]*(?::[0-9a-fA-F]*){2,}(?![\w:])"#)
  for match in ipv6.matches(in: text, range: NSRange(text.startIndex..., in: text)).reversed() {
    guard let range = Range(match.range, in: text) else { continue }
    let address = text[range]
    if address.contains(where: { $0.isLetter || $0.isNumber })
      && (address.contains("::") || address.filter({ $0 == ":" }).count >= 5)
    {
      text.replaceSubrange(range, with: "<ip>")
    }
  }
  for (pattern, replacement) in [
    (#"(?i)\b(?:[a-z0-9\-]+\.)+(?!(?:kt|java)\b)[a-z]{2,}:\d{2,5}\b"#, "<host>"),
    (#"(?i)\b(?:[a-z0-9\-]+\.)+[a-z0-9\-]+(?=/<ip>)"#, "<host>"),
    (
      #"(?i)\b(?:[a-z0-9\-]+\.)+(?:com|net|org|de|io|dev|app|me|xyz|cloud|eu|uk|nl|fr|at|ch|info|tv|lan|local|home|internal|arpa|duckdns|ts\.net)(?![\w.\-])"#,
      "<host>"
    ),
    (#"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b"#, "<id>"),
    (#"(?<![\w+=\-])(?=[\w+=\-]*\d)(?=[\w+=\-]*[A-Za-z])[\w+=\-]{20,}"#, "<id>"),
  ] { text = replacing(text, pattern, replacement) }
  return text
}
public func formatLogLine(_ line: String, known: KnownValues = .init()) -> String? {
  let regex = try! NSRegularExpression(
    pattern: #"^(\d\d-\d\d \d\d:\d\d:\d\d\.\d+)\s+\d+\s+\d+\s+([VDIWEFA])\s+(.*?)\s*:(?: (.*))?$"#)
  guard let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)) else {
    return nil
  }
  func part(_ n: Int) -> String {
    Range(match.range(at: n), in: line).map { String(line[$0]) } ?? ""
  }
  return
    "\(part(1)) \(part(2)) \(scrubLogMessage(part(3), known: known).prefix(32)): \(scrubLogMessage(part(4), known: known))"
}
public func formatLog(_ lines: [String], known: KnownValues = .init()) -> String {
  formatScrubbedLog(lines.compactMap { formatLogLine($0, known: known) })
}
private func formatScrubbedLog(_ lines: [String]) -> String {
  let kept = Array(lines.suffix(AppLog.maxLines))
  var body: [String] = []
  var size = 0
  for line in kept.reversed() {
    if size + line.count + 1 > AppLog.maxChars { break }
    body.append(line)
    size += line.count + 1
  }
  let header =
    "Matinee app log v1\nprivacy: server, account, addresses, paths, file names, quoted text, ids, and tokens replaced\n"
  if body.isEmpty { return header + "nothing logged\n" }
  let dropped = kept.count - body.count
  return header + (dropped > 0 ? "(\(dropped) earlier lines left out)\n" : "")
    + body.reversed().joined(separator: "\n") + "\n"
}
