import MatineeKit
import SwiftUI
import UIKit

/*
 * LocalNetwork.kt's part, for iOS. Android asks for local network access
 * at run time, before it connects. iOS asks by itself, once, the first
 * time the app reaches into the local network, with the reason in
 * Info.plist's NSLocalNetworkUsageDescription, and has no way to ask
 * again or to say whether it was allowed.
 *
 * So the app says nothing before: most servers are reached by a name on
 * the internet and never bring the prompt up, and the system's prompt
 * already says why. After, it does two things:
 *
 * - A server on the local network that didn't answer gets a note on
 *   where the access is turned on, with the way to the app's settings.
 * - It tries again by itself when the app comes back to the front. The
 *   prompt takes the app out of the front while it shows, and the request
 *   under it can fail before it's answered; so once it's allowed, the
 *   server answers without a second tap. The same goes for coming back
 *   from Settings.
 */

/// The note under a server on the local network that didn't answer, and the button to the app's settings.
struct LocalNetworkHint: View {
  @Environment(\.openURL) private var openURL

  var body: some View {
    Callout(nil, description: Str.iosConnectLocalNetwork, icon: .info) {
      MatineeButton(Str.iosOpenSettings, icon: .settings, look: .outline, size: .sm) {
        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
      }
    }
  }
}

extension View {
  /// Runs `action` each time the app comes back to the front: after the
  /// local network prompt, or from Settings.
  func onReturnToFront(_ action: @escaping () -> Void) -> some View {
    modifier(ReturnToFront(action: action))
  }
}

private struct ReturnToFront: ViewModifier {
  let action: () -> Void
  @Environment(\.scenePhase) private var phase

  func body(content: Content) -> some View {
    content.onChange(of: phase) { old, new in
      if new == .active, old != .active { action() }
    }
  }
}
