import MatineeCore
import MatineeKit
import SwiftUI

/// Messages that pop up at the bottom, like a failed mark: Android's
/// `LocalSnackbar`, posting the kit's toasts to the one host at the root.
///
///     @Environment(\.snackbar) private var snackbar
///     snackbar.show(Str.downloadsFailed)
///     snackbar.post(ToastMessage(Str.titleRefreshDone(name), kind: .success))
struct Snackbar {
  var post: (ToastMessage) -> Void = { print("toast:", $0.title) }

  /// A plain message, gone after a few seconds.
  func show(_ text: String) { post(ToastMessage(text)) }

  /// `error` as `failure`, an error toast, with the server's own words under
  /// it when it sent some. A cancellation shows nothing.
  func fail(_ failure: String, _ error: any Error) {
    switch Failure(error) {
    case .cancelled: break
    // Parsing details can contain server data; the action's own message is enough here.
    case .unreadable, .other: post(ToastMessage(failure, kind: .error))
    default: post(ToastMessage(failure, description: describeFailure(error), kind: .error))
    }
  }
}

extension EnvironmentValues {
  @Entry var snackbar = Snackbar()
}

/// Run `block`, showing its error at the bottom of the screen as `failure`,
/// with the server's own words when it sent some. It runs on in a task of
/// its own, so a sheet or menu that started it can go.
func launchShowing(_ snackbar: Snackbar, _ failure: String, _ block: @escaping () async throws -> Void) {
  Task {
    do {
      try await block()
    } catch {
      snackbar.fail(failure, error)
    }
  }
}
