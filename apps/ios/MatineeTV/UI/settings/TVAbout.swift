import MatineeCore
import MatineeKit
import SwiftUI
import UIKit

/*
 * TvAbout.kt: what this app and this TV are, then the two things to send
 * along when something breaks, the latest playback's report and the app's
 * own log. Both are read on the TV only. A TV has no clipboard to copy
 * them to and no share sheet, so they open in the kit's reader to be read
 * out, or photographed, from the couch; the iPhone and Android copy and
 * share them.
 */

struct AboutRows: View {
  let focus: FocusState<String?>.Binding
  @State private var reading: Reading?
  @State private var busy = false
  @Environment(MatineeSession.self) private var session

  /// What the reader shows.
  private struct Reading {
    let title: String
    let text: String
    let fromEnd: Bool
  }

  var body: some View {
    let report = PlaybackDiagnostics.shared.report
    SettingsColumn {
      ForEach(Array(appInfo().enumerated()), id: \.offset) { index, row in
        SettingsFact(row.0, value: row.1)
          .focused(focus, equals: index == 0 ? FIRST_ROW : "info-\(index)")
      }

      SettingsGap()
      TVListHeading(Str.diagnosticsTitle)
      if let report, let latest = report.latest {
        SettingsFact(Str.diagnosticsLatest, value: statusLabel(latest))
          .focused(focus, equals: "latest")
        TVListItem(Str.diagnosticsShow, quiet: true) {
          reading = Reading(title: Str.diagnosticsTitle, text: formatReport(report), fromEnd: false)
        }
        .focused(focus, equals: "showReport")
        // Its rows go, so focus moves on to the log's.
        TVListItem(Str.diagnosticsClear, icon: .trash, quiet: true, destructive: true) {
          focus.wrappedValue = "showLog"
          PlaybackDiagnostics.clear()
        }
        .focused(focus, equals: "clearReport")
      } else {
        SettingsNote(Str.diagnosticsEmpty)
      }

      SettingsGap()
      TVListHeading(Str.logsTitle)
      TVListItem(Str.logsShow, subtitle: Str.logsNote, quiet: true) {
        guard !busy else { return }
        busy = true
        let known = logKnownValues(session)
        Task {
          defer { busy = false }
          reading = Reading(title: Str.logsTitle, text: await readOwnLog(known), fromEnd: true)
        }
      }
      .focused(focus, equals: "showLog")
    }
    .tvReader(
      isPresented: Binding(get: { reading != nil }, set: { if !$0 { reading = nil } }), title: reading?.title ?? "",
      text: reading?.text ?? "", fromEnd: reading?.fromEnd ?? false)
  }
}
