import SwiftUI
import UIKit

/*
 * LocalNetwork.kt's effect. Android asks for local network access at run
 * time before it connects; iOS asks by itself, once, the first time the
 * app reaches into the local network, and has no way to ask again or to
 * say whether it was allowed. So when a server on the local network
 * doesn't answer, the error says where the access is turned on, with the
 * way there.
 */

/// The line under a failed connect to a local address, and the button to the app's settings.
struct LocalNetworkHint: View {
  @Environment(\.palette) private var palette
  @Environment(\.openURL) private var openURL

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(Str.iosConnectLocalNetwork).textStyle(.bodySmall).foregroundStyle(palette.danger)
      MatineeButton(.outline) {
        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
      } label: {
        LucideIcon(.settings, size: 18)
        Text(Str.iosOpenSettings)
      }
    }
  }
}
