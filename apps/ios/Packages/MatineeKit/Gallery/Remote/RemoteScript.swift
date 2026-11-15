import XCTest

/// Drives the gallery on an Apple TV simulator with the Siri Remote, from
/// a script, and saves screenshots on the way. `remote.sh` runs it; see the
/// package's README, "Driving the remote".
///
/// `REMOTE_ARGS` are the gallery's launch arguments (`-page tv-home -scheme dark`),
/// `REMOTE_SCRIPT` the steps, separated by spaces, semicolons, or lines:
///
/// - `up`, `down`, `left`, `right`, `select`, `menu`, `playpause`, `home`:
///   one press; `right*3` presses three times.
/// - `hold:right:1.5`: holds a button that long, in seconds.
/// - `wait:0.5`: waits.
/// - `shot:name`: saves the screen to `REMOTE_OUT/name.png`.
/// - `relaunch:-page+tv-buttons+-scheme+light`: starts the gallery again
///   with other arguments, `+` for spaces.
///
/// With `REMOTE_INBOX` set it stays, running each `*.steps` file that
/// appears there and writing `*.done` beside it, until a file says `quit`
/// or nothing comes for two hours. A session takes most of a minute to
/// start; a script sent to one runs at once.
final class RemoteScript: XCTestCase {
  private let env = ProcessInfo.processInfo.environment
  private var app: XCUIApplication!
  private lazy var out = URL(fileURLWithPath: env["REMOTE_OUT"] ?? NSTemporaryDirectory(), isDirectory: true)
  private lazy var settle = Double(env["REMOTE_SETTLE"] ?? "") ?? 0.6
  private lazy var launchWait = Double(env["REMOTE_LAUNCH_WAIT"] ?? "") ?? 2.5

  @MainActor
  func testScript() throws {
    executionTimeAllowance = 4 * 60 * 60
    app = XCUIApplication()
    try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
    app.launchArguments = arguments(env["REMOTE_ARGS"] ?? "")
    app.launch()
    pause(launchWait)
    try run(env["REMOTE_SCRIPT"] ?? "")

    guard let inbox = env["REMOTE_INBOX"].map({ URL(fileURLWithPath: $0, isDirectory: true) }) else { return }
    let files = FileManager.default
    try files.createDirectory(at: inbox, withIntermediateDirectories: true)
    try Data().write(to: inbox.appendingPathComponent("ready"))
    var idleSince = Date()
    while Date().timeIntervalSince(idleSince) < 2 * 60 * 60 {
      let pending = try files.contentsOfDirectory(at: inbox, includingPropertiesForKeys: nil)
        .filter { $0.pathExtension == "steps" }
        .sorted { $0.lastPathComponent < $1.lastPathComponent }
      guard let next = pending.first else {
        pause(0.2)
        continue
      }
      let script = try String(contentsOf: next, encoding: .utf8)
      try files.removeItem(at: next)
      if script.trimmingCharacters(in: .whitespacesAndNewlines) == "quit" { break }
      var result = "ok"
      do { try run(script) } catch { result = "error: \(error)" }
      try result.write(to: next.deletingPathExtension().appendingPathExtension("done"), atomically: true, encoding: .utf8)
      idleSince = Date()
    }
    try? files.removeItem(at: inbox.appendingPathComponent("ready"))
  }

  @MainActor
  private func run(_ script: String) throws {
    let remote = XCUIRemote.shared
    for raw in script.split(whereSeparator: { $0 == ";" || $0 == " " || $0 == "\n" }) {
      let step = String(raw)
      let parts = step.split(separator: ":", maxSplits: 2).map(String.init)
      switch parts[0] {
      case "wait":
        pause(Double(parts.count > 1 ? parts[1] : "1") ?? 1)
      case "shot":
        let file = out.appendingPathComponent("\(parts.count > 1 ? parts[1] : "shot").png")
        pause(settle)
        try XCUIScreen.main.screenshot().pngRepresentation.write(to: file)
        print("remote: saved \(file.path)")
      case "hold":
        guard parts.count > 1, let button = button(parts[1]) else { throw Unknown(step: step) }
        remote.press(button, forDuration: Double(parts.count > 2 ? parts[2] : "1") ?? 1)
        pause(0.3)
      case "relaunch":
        app.terminate()
        app.launchArguments = arguments((parts.count > 1 ? parts[1] : "").replacingOccurrences(of: "+", with: " "))
        app.launch()
        pause(launchWait)
      default:
        let name = parts[0].split(separator: "*").map(String.init)
        guard let button = button(name[0]) else { throw Unknown(step: step) }
        for _ in 0..<(name.count > 1 ? Int(name[1]) ?? 1 : 1) {
          remote.press(button)
          pause(0.3)
        }
      }
    }
  }

  private struct Unknown: Error, CustomStringConvertible {
    let step: String
    var description: String { "unknown step \(step)" }
  }

  private func arguments(_ text: String) -> [String] {
    text.split(separator: " ").map(String.init)
  }

  private func button(_ name: String) -> XCUIRemote.Button? {
    switch name {
    case "up": .up
    case "down": .down
    case "left": .left
    case "right": .right
    case "select": .select
    case "menu": .menu
    case "playpause": .playPause
    case "home": .home
    default: nil
    }
  }

  private func pause(_ seconds: Double) {
    RunLoop.current.run(until: Date(timeIntervalSinceNow: seconds))
  }
}
