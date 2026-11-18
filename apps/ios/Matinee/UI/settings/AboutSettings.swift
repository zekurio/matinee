import MatineeCore
import MatineeKit
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
      ListBlock {
        ForEach(appInfo(), id: \.0) { row in
          ValueRow(row.0, value: row.1)
        }
      }
      PlaybackDiagnosticsSection()
      AppLogSection()
    }
  }
}

/// The app's log: shown, copied, or shared, read afresh each time. What it
/// takes out is in the first row's description and the log's own header.
private struct AppLogSection: View {
  @State private var shown: String?
  @State private var busy = false
  @Environment(MatineeSession.self) private var session
  @Environment(\.snackbar) private var snackbar

  var body: some View {
    ListSection(Str.logsTitle) {
      ListRow(Str.logsShow, subtitle: Str.logsNote) { withLog { shown = $0 } }
      ListRow(Str.logsCopy) {
        withLog { copyText($0, snackbar: snackbar, copied: Str.logsCopied) }
      }
      ListRow(Str.logsShare) {
        withLog { shareText($0, subject: Str.logsTitle) }
      }
    }
    .modifier(
      TextDialog(
        isPresented: Binding(get: { shown != nil }, set: { if !$0 { shown = nil } }), title: Str.logsTitle,
        text: shown ?? "", copyLabel: Str.logsCopy, copied: Str.logsCopied, latestLast: true))
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
