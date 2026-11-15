import MatineeCore
import MatineeKit
import SwiftUI

/// The saved server didn't answer. Laid out like sign-in: what happened, one
/// line on why, then the ways on. Without a network the downloads come first.
/// The session tries again on its own once a network comes back, and this
/// page does when the app comes back to the front, as from Settings.
struct UnreachableScreen: View {
  let server: String
  let reason: Unreachability
  let retrying: Bool
  @Environment(MatineeSession.self) private var session
  @Environment(Downloads.self) private var downloads

  var body: some View {
    let canWatchOffline = !downloads.store.items.isEmpty && session.lastUser != nil
    let noNetwork = reason == .noNetwork
    AuthLayout {
      AuthHeading(
        noNetwork ? Str.unreachableOfflineTitle : Str.unreachableTitle,
        description: unreachableMessage(reason, server: server, canWatchOffline: canWatchOffline))
      // A saved server on the local network can't be reached without the access, which Settings can take back.
      if !noNetwork, isLocal {
        Gap(Space.s6)
        LocalNetworkHint()
      }
      Gap(Space.s8)
      VStack(spacing: Space.s2_5) {
        if !canWatchOffline {
          retry(.primary)
        } else if noNetwork {
          watchOffline(.primary)
          retry(.outline)
        } else {
          retry(.primary)
          watchOffline(.outline)
        }
      }
      Gap(Space.s8)
      ChangeServerButton().frame(maxWidth: .infinity)
    }
    .onReturnToFront {
      if isLocal, !retrying { Task { await session.start() } }
    }
  }

  private var isLocal: Bool { URL(string: server).map(MatineeSession.isLocalNetwork) ?? false }

  private func retry(_ look: MatineeKit.ButtonLook) -> some View {
    MatineeKit.MatineeButton(Str.commonRetry, icon: .refreshCw, look: look, pending: retrying, fullWidth: true) {
      Task { await session.start() }
    }
  }

  private func watchOffline(_ look: MatineeKit.ButtonLook) -> some View {
    MatineeKit.MatineeButton(Str.downloadsWatchOffline, icon: .download, look: look, fullWidth: true) {
      Task { await session.setOfflineMode(true) }
    }
  }
}
