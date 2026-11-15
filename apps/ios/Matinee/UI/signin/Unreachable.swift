import MatineeCore
import SwiftUI

/// The saved server didn't answer. Laid out like sign-in: what happened, one
/// line on why, then the ways on. Without a network the downloads come first.
/// The session tries again on its own once a network comes back.
struct UnreachableScreen: View {
  let server: String
  let reason: Unreachability
  let retrying: Bool
  @Environment(MatineeSession.self) private var session
  @Environment(Downloads.self) private var downloads
  @Environment(\.palette) private var palette

  var body: some View {
    let canWatchOffline = !downloads.store.items.isEmpty && session.lastUser != nil
    let noNetwork = reason == .noNetwork
    AuthLayout {
      Text(noNetwork ? Str.unreachableOfflineTitle : Str.unreachableTitle)
        .textStyle(.headlineMedium).accessibilityAddTraits(.isHeader)
      Gap(8)
      Text(unreachableMessage(reason, server: server, canWatchOffline: canWatchOffline))
        .textStyle(.bodyMedium).foregroundStyle(palette.muted)
      // A saved server on the local network can't be reached without the access, which Settings can take back.
      if !noNetwork, isLocal {
        Gap(12)
        LocalNetworkHint()
      }
      Gap(28)
      if !canWatchOffline {
        retry(.primary)
      } else if noNetwork {
        watchOffline(.primary)
        Gap(10)
        retry(.outline)
      } else {
        retry(.primary)
        Gap(10)
        watchOffline(.outline)
      }
      Gap(32)
      ChangeServerButton().frame(maxWidth: .infinity)
    }
  }

  private var isLocal: Bool { URL(string: server).map(MatineeSession.isLocalNetwork) ?? false }

  private func retry(_ look: ButtonLook) -> some View {
    Button {
      Task { await session.start() }
    } label: {
      HStack(spacing: 8) {
        if retrying {
          ProgressView().controlSize(.small).tint(look == .primary ? palette.accentForeground : palette.foreground)
        } else {
          LucideIcon(.refreshCw, size: 18)
        }
        Text(Str.commonRetry)
      }
      .frame(maxWidth: .infinity)
    }
    .buttonStyle(.matinee(look))
    .disabled(retrying)
  }

  private func watchOffline(_ look: ButtonLook) -> some View {
    Button {
      Task { await session.setOfflineMode(true) }
    } label: {
      HStack(spacing: 8) {
        LucideIcon(.download, size: 18)
        Text(Str.downloadsWatchOffline)
      }
      .frame(maxWidth: .infinity)
    }
    .buttonStyle(.matinee(look))
  }
}
