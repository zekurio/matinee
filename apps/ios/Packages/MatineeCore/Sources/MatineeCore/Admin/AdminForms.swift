import Foundation

/*
 * The admin pages' logic apart from their views, as Android keeps it in
 * the pages' files under ui/settings/admin: how the save bar reports a
 * save, and what each form's fields hold, check, and send.
 */

/// How the save bar's last save went.
public enum SaveFeedback: Equatable, Sendable {
  case idle
  case pending
  case success
  /// With the server's reason, when it gave one.
  case failed(String?)

  /// What the bar shows for `self`, stored after the last attempt, while
  /// the page is `dirty` or not: an edit after a save starts a new round,
  /// so "Saved" doesn't linger, and a failure goes with the edits it
  /// failed to save.
  public func shown(dirty: Bool) -> SaveFeedback {
    switch self {
    case .success where dirty: .idle
    case .failed where !dirty: .idle
    default: self
    }
  }

  /// Whether the bar shows at all: while there are edits, and while it reports on a save.
  public func barVisible(dirty: Bool) -> Bool { dirty || shown(dirty: dirty) != .idle }
}

/// How long "Saved" shows before the bar goes, as the web's.
public let SAVED_SHOWN: Duration = .milliseconds(1_400)

/// A message from a save that failed, without the blank one some errors carry.
public func saveFailure(_ message: String?) -> SaveFeedback {
  let trimmed = message?.trimmingCharacters(in: .whitespacesAndNewlines)
  return .failed(trimmed?.isEmpty == false ? trimmed : nil)
}
