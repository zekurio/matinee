import Flutter
import Foundation
import OSLog
import PhotosUI
import UIKit
import UniformTypeIdentifiers

/// What Dart asks of the system around the app. Pigeon calls it on the main
/// thread; the async calls run in a main-actor task.
final class SystemBridge: SystemApi {
  private let presenter: () -> UIViewController?
  /// The open photo picker's delegate, which answers once.
  private var picking: PickerAnswer?

  init(presenter: @escaping () -> UIViewController?) {
    self.presenter = presenter
  }

  @MainActor func pickImage(maxBytes: Int64) async throws -> PickedImage? {
    guard let presenter = presenter() else { return nil }
    // A second pick while one is open gets nothing.
    picking?.finish(nil)
    var configuration = PHPickerConfiguration()
    configuration.filter = .images
    configuration.selectionLimit = 1
    // Photos keeps most pictures as HEIC, which the server doesn't take:
    // this has the picker hand over a JPEG of them.
    configuration.preferredAssetRepresentationMode = .compatible
    let picker = PHPickerViewController(configuration: configuration)
    var mine: PickerAnswer?
    let result = await withCheckedContinuation { continuation in
      let answer = PickerAnswer(continuation)
      mine = answer
      picking = answer
      // The picker holds its delegate weakly; `picking` keeps it.
      picker.delegate = answer
      presenter.present(picker, animated: true)
    }
    if picking === mine { picking = nil }
    guard let provider = result?.itemProvider else { return nil }
    let type =
      [UTType.png, UTType.webP].first { provider.hasItemConformingToTypeIdentifier($0.identifier) }
      ?? UTType.jpeg
    let limit = Int(min(maxBytes + 1, Int64(Int32.max)))
    let bytes = await withCheckedContinuation { (continuation: CheckedContinuation<Data?, Never>) in
      // The file is only there until the handler returns, so it's read here,
      // on the provider's own queue.
      _ = provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, _ in
        continuation.resume(returning: url.flatMap { readAtMost($0, limit) })
      }
    }
    return PickedImage(type: type.preferredMIMEType, bytes: bytes.map { FlutterStandardTypedData(bytes: $0) })
  }

  /// The process's own entries in the unified log, as logcat's threadtime
  /// lines, which Dart's app log reads: `11-12 01:41:46.123  pid  tid L Tag: message`.
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

  func shareText(subject: String, text: String) throws {
    guard let presenter = presenter() else { return }
    let share = UIActivityViewController(activityItems: [SharedText(subject: subject, text: text)], applicationActivities: nil)
    // An iPad shows it as a popover, which needs somewhere to point.
    if let popover = share.popoverPresentationController {
      popover.sourceView = presenter.view
      popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 0, height: 0)
      popover.permittedArrowDirections = []
    }
    presenter.present(share, animated: true)
  }
}

private final class PickerAnswer: NSObject, PHPickerViewControllerDelegate {
  private var continuation: CheckedContinuation<PHPickerResult?, Never>?

  init(_ continuation: CheckedContinuation<PHPickerResult?, Never>) {
    self.continuation = continuation
  }

  func finish(_ result: PHPickerResult?) {
    continuation?.resume(returning: result)
    continuation = nil
  }

  func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    finish(results.first)
  }
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

private func readAtMost(_ url: URL, _ limit: Int) -> Data? {
  guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
  defer { try? handle.close() }
  return try? handle.read(upToCount: limit) ?? Data()
}

/// Text with a subject for the apps that have one, like Mail.
private final class SharedText: NSObject, UIActivityItemSource {
  let subject: String
  let text: String

  init(subject: String, text: String) {
    self.subject = subject
    self.text = text
  }

  func activityViewControllerPlaceholderItem(_ activityViewController: UIActivityViewController) -> Any { text }

  func activityViewController(
    _ activityViewController: UIActivityViewController, itemForActivityType activityType: UIActivity.ActivityType?
  ) -> Any? { text }

  func activityViewController(
    _ activityViewController: UIActivityViewController, subjectForActivityType activityType: UIActivity.ActivityType?
  ) -> String { subject }
}
