import MatineeCore
import MatineeKit
import SwiftUI

/*
 * The names the screens not yet rebuilt use for a failure in a section's
 * place and for Try again, drawn now as the unified error states
 * (components/States.swift). A rebuilt screen uses `ErrorSection`,
 * `RailFailed`, or `ErrorState`'s own Try again instead. These go with the
 * rest of legacy/.
 */

/// `ErrorSection`, under the name the screens not yet rebuilt call it by.
struct Notice: View {
  let headline: String
  var message: String?
  var retrying = false
  var disconnected = false
  var onRetry: (() -> Void)?

  init(
    _ headline: String, _ message: String? = nil, retrying: Bool = false, disconnected: Bool = false,
    onRetry: (() -> Void)? = nil
  ) {
    self.headline = headline
    self.message = message
    self.retrying = retrying
    self.disconnected = disconnected
    self.onRetry = onRetry
  }

  var body: some View {
    ErrorSection(headline, message, retrying: retrying, disconnected: disconnected, onRetry: onRetry)
  }
}

/// Try again, as the unified error states draw it.
struct RetryButton: View {
  let action: () -> Void

  var body: some View {
    MatineeButton(Str.commonRetry, look: .outline, action: action)
  }
}
