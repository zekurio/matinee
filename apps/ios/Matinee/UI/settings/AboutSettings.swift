import MatineeCore
import SwiftUI
import UIKit

/*
 * AboutSettings.kt: what this app and device are, then the two things to
 * send along when something breaks, the latest playback's report and the
 * app's own log. Both are read on the device only and leave it when the
 * person copies or shares them.
 */

/// Settings' About page: the app, the device, the latest playback's report, and the app's log.
struct AboutPage: View {
  var body: some View {
    SettingsScaffold(Str.aboutTitle) {
      Panel {
        ForEach(Array(appInfo().enumerated()), id: \.offset) { index, row in
          if index > 0 { RowDivider() }
          ValueRow(row.0, value: row.1)
        }
      }
      PlaybackDiagnosticsSection()
      AppLogSection()
    }
  }
}

/// The app's version and build, iOS's, and the model, as rows of a title and a value.
func appInfo() -> [(String, String)] {
  let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
  #if DEBUG
    let version = "\(appVersion) (\(build)), debug"
  #else
    let version = "\(appVersion) (\(build))"
  #endif
  let device = UIDevice.current
  // "iOS" or "iPadOS", the system's own name, the same in every language, as Android's row says Android.
  return [
    (Str.aboutVersion, version),
    (device.systemName, device.systemVersion),
    (Str.aboutDevice, deviceName()),
  ]
}

/// "iPhone (iPhone18,3)": the kind of device, then its model, which says which one it is.
private func deviceName() -> String {
  let kind = UIDevice.current.model
  guard let model = deviceDiagnostics().model?.text, model != kind else { return kind }
  return "\(kind) (\(model))"
}

/// What a log takes out wherever it shows: the server's host and the account's names and id.
@MainActor func logKnownValues(_ session: MatineeSession) -> KnownValues {
  switch session.state {
  case .signedIn(let server, let user), .offline(let server, let user):
    KnownValues.of(server: server, account: [user.username, user.displayName, user.id])
  default: KnownValues()
  }
}

/// This process's recent log, scrubbed of the server and the account, read off the main thread.
func readOwnLog(_ known: KnownValues) async -> String {
  await Task.detached(priority: .userInitiated) {
    do {
      return try AppLog.read(known: known)
    } catch {
      return "Matinee app log v1\nlog unavailable\n"
    }
  }.value
}

/// The app's log: shown, copied, or shared, read afresh each time. What it
/// takes out is in the first row's description and the log's own header.
private struct AppLogSection: View {
  @State private var shown: String?
  @State private var busy = false
  @Environment(MatineeSession.self) private var session
  @Environment(\.snackbar) private var snackbar

  var body: some View {
    SettingsSection(Str.logsTitle) {
      Panel {
        LinkRow(Str.logsShow, description: Str.logsNote) { withLog { shown = $0 } }
        RowDivider()
        LinkRow(Str.logsCopy) { withLog { copyText($0, snackbar: snackbar, copied: Str.logsCopied) } }
        RowDivider()
        LinkRow(Str.logsShare) { withLog { shareText($0, subject: Str.logsTitle) } }
      }
    }
    .sheet(isPresented: Binding(get: { shown != nil }, set: { if !$0 { shown = nil } })) {
      TextSheet(title: Str.logsTitle, text: shown ?? "", copyLabel: Str.logsCopy, latestLast: true) {
        copyText(shown ?? "", snackbar: snackbar, copied: Str.logsCopied)
      }
    }
  }

  private func withLog(_ use: @escaping (String) -> Void) {
    guard !busy else { return }
    busy = true
    let known = logKnownValues(session)
    Task {
      defer { busy = false }
      use(await readOwnLog(known))
    }
  }
}
