import MatineeCore
import MatineeKit
import SwiftUI
import UIKit

/*
 * PlaybackDiagnostics.kt: the report of the latest playback, in Settings,
 * About: how the last try went, and ways to read, copy, share, and clear
 * it. It reads the report MatineeCore keeps in memory, so it's there after
 * the player closes. What it holds and leaves out is in the report's own
 * first lines. It leaves the device only when the person copies or shares it.
 */

struct PlaybackDiagnosticsSection: View {
  @State private var open = false
  @Environment(\.snackbar) private var snackbar
  @Environment(\.palette) private var palette

  var body: some View {
    let report = PlaybackDiagnostics.shared.report
    let text = report.map(formatReport)
    SettingsSection(Str.diagnosticsTitle) {
      Panel {
        if let text, let latest = report?.latest {
          LegacyValueRow(Str.diagnosticsLatest, value: statusLabel(latest))
          RowDivider()
          LinkRow(Str.diagnosticsShow) { open = true }
          RowDivider()
          LinkRow(Str.diagnosticsCopy) { copyText(text, snackbar: snackbar, copied: Str.diagnosticsCopied) }
          RowDivider()
          LinkRow(Str.iosDiagnosticsShare) { shareText(text, subject: Str.diagnosticsTitle) }
          RowDivider()
          LinkRow(Str.diagnosticsClear, destructive: true) {
            open = false
            PlaybackDiagnostics.clear()
          }
        } else {
          Text(Str.diagnosticsEmpty).textStyle(.sm).foregroundStyle(palette.mutedForeground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
        }
      }
    }
    .sheet(isPresented: Binding(get: { open && text != nil }, set: { open = $0 })) {
      TextSheet(title: Str.diagnosticsTitle, text: text ?? "", copyLabel: Str.diagnosticsCopy) {
        copyText(text ?? "", snackbar: snackbar, copied: Str.diagnosticsCopied)
      }
    }
    #if DEBUG
      // -dev.report YES: a report as a failed encode leaves it, to see this section before anything played.
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
}

/// "Failed (stream)": how the latest try went, and with which source.
func statusLabel(_ attempt: AttemptDiagnostics) -> String {
  let mode =
    switch attempt.mode {
    case .direct: Str.diagnosticsModeDirect
    case .stream: Str.diagnosticsModeStream
    case .hls, .encode: Str.diagnosticsModeHls
    case .local: Str.diagnosticsModeLocal
    }
  return switch attempt.outcome {
  case .loading: Str.diagnosticsStatusLoading(mode)
  case .playing: Str.diagnosticsStatusPlaying(mode)
  case .failed: Str.diagnosticsStatusFailed(mode)
  case .replaced: Str.diagnosticsStatusReplaced(mode)
  case .closed: Str.diagnosticsStatusClosed(mode)
  }
}

/// A report or a log to read, in a sheet: the text, selectable, with Copy and Close.
struct TextSheet: View {
  let title: String
  let text: String
  let copyLabel: String
  /// Opens at the bottom, where a log's latest lines are.
  var latestLast = false
  let onCopy: () -> Void
  @Environment(\.dismiss) private var dismiss
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: 0) {
      LegacySheetHeader(title).padding(.top, 12)
      ScrollView([.vertical]) {
        Text(text)
          // A report and a log line up in columns, as Android shows them, in its monospace.
          .font(.system(size: 12, design: .monospaced))
          .lineSpacing(4)
          .foregroundStyle(palette.foreground)
          .textSelection(.enabled)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 20)
          .padding(.vertical, 8)
      }
      .defaultScrollAnchor(latestLast ? .bottom : .top)
      Rectangle().fill(palette.border).frame(height: 1)
      HStack(spacing: 10) {
        LegacyButton(.ghost) { dismiss() } label: { Text(Str.diagnosticsClose) }
        Spacer(minLength: 0)
        LegacyButton(.secondary, action: onCopy) { Text(copyLabel) }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 10)
    }
    .legacySheet([.large])
  }
}

/// Puts `text` on the pasteboard and says so, as iOS doesn't.
func copyText(_ text: String, snackbar: Snackbar, copied: String) {
  UIPasteboard.general.string = text
  snackbar.show(copied)
}

/// Offers `text` to the apps that take it, like Mail or Messages, in the system's share sheet.
func shareText(_ text: String, subject: String) {
  let scene = UIApplication.shared.connectedScenes
    .compactMap { $0 as? UIWindowScene }
    .first { $0.activationState == .foregroundActive }
  guard var top = scene?.keyWindow?.rootViewController else { return }
  while let presented = top.presentedViewController { top = presented }
  let share = UIActivityViewController(activityItems: [SharedText(text, subject: subject)], applicationActivities: nil)
  // An iPad shows it as a popover, from the middle of the window.
  if let popover = share.popoverPresentationController, let view = top.view {
    popover.sourceView = view
    popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
    popover.permittedArrowDirections = []
  }
  top.present(share, animated: true)
}

/// Text to share, with a subject for the apps that take one, like Mail.
private final class SharedText: NSObject, UIActivityItemSource {
  let text: String
  let subject: String

  init(_ text: String, subject: String) {
    self.text = text
    self.subject = subject
  }

  func activityViewControllerPlaceholderItem(_ controller: UIActivityViewController) -> Any { text }

  func activityViewController(_ controller: UIActivityViewController, itemForActivityType type: UIActivity.ActivityType?)
    -> Any?
  { text }

  func activityViewController(
    _ controller: UIActivityViewController, subjectForActivityType type: UIActivity.ActivityType?
  ) -> String { subject }
}
