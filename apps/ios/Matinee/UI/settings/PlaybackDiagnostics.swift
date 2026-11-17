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

  var body: some View {
    let report = PlaybackDiagnostics.shared.report
    let text = report.map(formatReport)
    ListSection(Str.diagnosticsTitle) {
      if let text, let latest = report?.latest {
        ValueRow(Str.diagnosticsLatest, value: statusLabel(latest))
        ListRow(Str.diagnosticsShow) { open = true }
        ListRow(Str.diagnosticsCopy) {
          copyText(text, snackbar: snackbar, copied: Str.diagnosticsCopied)
        }
        ListRow(Str.iosDiagnosticsShare) {
          shareText(text, subject: Str.diagnosticsTitle)
        }
        ListRow(Str.diagnosticsClear, destructive: true) {
          open = false
          PlaybackDiagnostics.clear()
        }
      } else {
        EmptyRow(Str.diagnosticsEmpty)
      }
    }
    .modifier(
      TextDialog(
        isPresented: Binding(get: { open && text != nil }, set: { open = $0 }), title: Str.diagnosticsTitle,
        text: text ?? "", copyLabel: Str.diagnosticsCopy, copied: Str.diagnosticsCopied))
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
        if debugOpens("report") { open = true }
      }
    #endif
  }
}

/// A report or a log to read, in the kit's dialog, as Android's: its
/// title, the text in the web's `font-mono` scrolling in a box at most 420
/// tall, selectable, and Copy, which keeps the dialog open, over Close. A
/// log opens at its end, where the latest lines are, and keeps the whole
/// 420, as Android's list does; a report is as tall as it runs.
struct TextDialog: ViewModifier {
  @Binding var isPresented: Bool
  let title: String
  let text: String
  let copyLabel: String
  let copied: String
  var latestLast = false
  @Environment(\.snackbar) private var snackbar

  func body(content: Content) -> some View {
    content.dialog(isPresented: $isPresented, title: title) {
      TextDialogBody(text: text, latestLast: latestLast)
    } footer: {
      DialogButton(copyLabel, look: .secondary, closes: false, action: copy)
      DialogButton(Str.diagnosticsClose, action: close)
    }
  }

  private func copy() { copyText(text, snackbar: snackbar, copied: copied) }
  private func close() {}
}

/// The text of a `TextDialog`, in a box that scrolls once it runs past 420.
private struct TextDialogBody: View {
  let text: String
  let latestLast: Bool
  @Environment(\.palette) private var palette

  var body: some View {
    Group {
      if latestLast {
        scrolling
      } else {
        ViewThatFits(in: .vertical) {
          words
          scrolling
        }
      }
    }
    .frame(maxHeight: TEXT_DIALOG_HEIGHT)
  }

  private var words: some View {
    Text(text)
      .monoTextStyle(.xs)
      .foregroundStyle(palette.foreground)
      .textSelection(.enabled)
      .frame(maxWidth: .infinity, alignment: .leading)
      .fixedSize(horizontal: false, vertical: true)
  }

  private var scrolling: some View {
    ScrollView { words }
      .defaultScrollAnchor(latestLast ? .bottom : .top)
      .scrollBounceBehavior(.basedOnSize)
  }
}

/// Android's 420 for the text of a log or report dialog.
private let TEXT_DIALOG_HEIGHT: CGFloat = 420

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
