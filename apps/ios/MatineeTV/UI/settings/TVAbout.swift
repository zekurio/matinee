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
      ForEach(Array(tvAppInfo().enumerated()), id: \.offset) { index, row in
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
        let known = knownValues
        Task {
          defer { busy = false }
          reading = Reading(title: Str.logsTitle, text: await readLog(known), fromEnd: true)
        }
      }
      .focused(focus, equals: "showLog")
    }
    .tvReader(
      isPresented: Binding(get: { reading != nil }, set: { if !$0 { reading = nil } }), title: reading?.title ?? "",
      text: reading?.text ?? "", fromEnd: reading?.fromEnd ?? false)
    #if DEBUG
      // -dev.report YES: a report as a failed encode leaves it, to see this before anything played.
      .onAppear {
        guard UserDefaults.standard.bool(forKey: "dev.report"), PlaybackDiagnostics.latest == nil else { return }
        var sample = PlaybackReport()
        sample.attempt(mode: .direct, reason: .start, at: 0, audioIndex: 1, quality: nil, burnIn: false)
        sample.attempt(
          mode: .hls, reason: .fallback, at: 12, audioIndex: 1, quality: "1080p-10", burnIn: false,
          why: [PlaybackReason.video, PlaybackReason.failed], videoTo: "h264", audioTo: "aac")
        sample.failed(errorDiagnostics(NSError(domain: "AVFoundationErrorDomain", code: -11828)))
        PlaybackDiagnostics.latest = sample
      }
    #endif
  }

  /// What the log takes out wherever it shows: the server's host and the account's names and id.
  private var knownValues: KnownValues {
    switch session.state {
    case .signedIn(let server, let user), .offline(let server, let user):
      KnownValues.of(server: server, account: [user.username, user.displayName, user.id])
    default: KnownValues()
    }
  }
}

/// This process's recent log, scrubbed of the server and the account, read off the main thread.
private func readLog(_ known: KnownValues) async -> String {
  await Task.detached(priority: .userInitiated) {
    do {
      return try AppLog.read(known: known)
    } catch {
      return "Matinee app log v1\nlog unavailable\n"
    }
  }.value
}

/// The app's version and build, tvOS's, and the model, as a title and a value each.
private func tvAppInfo() -> [(String, String)] {
  let info = Bundle.main
  let version = info.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
  let build = info.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
  #if DEBUG
    let shown = "\(version) (\(build)), debug"
  #else
    let shown = "\(version) (\(build))"
  #endif
  let device = UIDevice.current
  // "tvOS", the system's own name, the same in every language.
  return [(Str.aboutVersion, shown), (device.systemName, device.systemVersion), (Str.aboutDevice, deviceName())]
}

/// "Apple TV (AppleTV14,1)": the kind of device, then its model, which says which one it is.
private func deviceName() -> String {
  let kind = UIDevice.current.model
  guard let model = deviceDiagnostics().model?.text, model != kind else { return kind }
  return "\(kind) (\(model))"
}
