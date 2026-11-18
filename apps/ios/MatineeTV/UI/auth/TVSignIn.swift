import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvSignIn.kt: signing a TV in with a code, the only way it has: the QR
 * code to scan on the right, large enough for a phone across the room, and
 * on the left the address and the code to type there, read from the couch.
 * A code that runs out waits for a new one to be asked for, so a TV left
 * here doesn't keep asking the server for codes. The device grant itself is
 * the iPhone app's `DeviceCodeState` (Matinee/UI/signin/SignInState.swift).
 */
struct TVSignInScreen: View {
  let server: String
  let config: AuthConfig
  let adding: Bool
  @Environment(MatineeSession.self) private var session
  @State private var flow = DeviceCodeState()
  @State private var switching = false
  @FocusState private var focused: Row?

  private enum Row: Hashable { case again, way }

  var body: some View {
    // A code that ran out, or never came, puts focus on getting one; else on the one way out.
    let stuck = flow.expired || (flow.code == nil && flow.error != nil)
    TVAuthFrame(
      Str.tvSigninTitle,
      // A server not set up yet can't approve anyone; its setup runs in a browser.
      description: config.setup != nil ? Str.signinSetup : Str.tvSigninDescription,
      split: 0.56
    ) {
      LoginBackdropWall(api: session.signInApi(), settings: config.loginBackdrop)
    } side: {
      side(stuck: stuck)
    } content: {
      TVCodeQr(code: flow.code, expired: flow.expired, failed: flow.error != nil)
        .frame(maxWidth: .infinity)
    }
    .defaultFocus($focused, stuck ? .again : .way)
    .onChange(of: stuck) { _, stuck in focused = stuck ? .again : .way }
    .task(id: flow.attempt) { await flow.run(session, renewExpired: false) }
    // A server being added: Menu goes to finding or typing another.
    .onTVBack(isActive: adding) { session.addServer() }
    .tvServerPanel(isPresented: $switching)
  }

  @ViewBuilder private func side(stuck: Bool) -> some View {
    TVCodeSteps(code: flow.code, expired: flow.expired, error: flow.error)
      .padding(.top, TVSpace.s8)
    VStack(spacing: TVListItems.gap) {
      if stuck {
        TVListItem(flow.expired ? Str.tvSigninNewCode : Str.commonRetry, icon: .refreshCw) { flow.newCode() }
          .focused($focused, equals: .again)
      }
      way.focused($focused, equals: .way)
    }
    .frame(width: 720)
    .padding(.top, TVSpace.s6)
    .focusSection()
  }

  /// The row that leaves signing in: back to the server in use, while adding one, or to the server list.
  @ViewBuilder private var way: some View {
    let host = server.components(separatedBy: "://").last ?? server
    if adding, let current = session.servers.first(where: \.active) {
      TVListItem(Str.serversBackTo(current.title), subtitle: host, icon: .arrowLeft, quiet: true) {
        Task { await session.cancelAdd() }
      }
    } else {
      TVListItem(Str.connectChangeServer, subtitle: host, icon: .server, quiet: true) { switching = true }
    }
  }
}

/// The steps to type the code, and whether it's waiting.
private struct TVCodeSteps: View {
  let code: DeviceCode?
  let expired: Bool
  let error: String?
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if let code {
        Text(Str.tvSigninEnter(code.verificationUri.components(separatedBy: "://").last ?? code.verificationUri))
          .textStyle(.facts).foregroundStyle(palette.foreground.opacity(0.85))
        TVCodeText(code.userCode).foregroundStyle(palette.foreground)
          .padding(.top, TVSpace.s1)
          .accessibilityLabel(code.userCode.map(String.init).joined(separator: " "))
        HStack(spacing: TVSpace.s3) {
          Spinner(size: 36, tint: palette.mutedForeground)
          Text(Str.signinCodeWaiting).textStyle(.body).foregroundStyle(palette.mutedForeground)
        }
        .padding(.top, TVSpace.s3)
      } else if expired {
        Text(Str.tvSigninExpired).textStyle(.title).foregroundStyle(palette.foreground)
      } else if error == nil {
        Text(Str.signinCodeLoading).textStyle(.body).foregroundStyle(palette.mutedForeground)
      }
      if let error {
        Text(error).textStyle(.body).foregroundStyle(palette.destructive).padding(.top, TVSpace.s2)
      }
    }
  }
}

/// The QR code of the link page with the code in it; a spinner before it
/// comes, a blank card once it ran out.
private struct TVCodeQr: View {
  let code: DeviceCode?
  let expired: Bool
  let failed: Bool
  @Environment(\.palette) private var palette

  /// Large enough for a phone's camera across a room: Android TV's 272 dp.
  static let size: CGFloat = 544

  var body: some View {
    if let code {
      QrCode(code.verificationUriComplete, label: Str.signinCodeQr(code.userCode), size: Self.size)
    } else {
      let shape = RoundedRectangle(cornerRadius: Self.size / 14, style: .continuous)
      ZStack {
        if expired {
          Text(Str.tvSigninExpiredShort).textStyle(.title).foregroundStyle(palette.mutedForeground)
            .multilineTextAlignment(.center)
            .padding(TVSpace.s5)
        } else if !failed {
          Spinner(size: 64, tint: palette.accent)
        }
      }
      .frame(width: Self.size, height: Self.size)
      .background(palette.foreground.opacity(0.05), in: shape)
      .overlay { shape.strokeBorder(palette.foreground.opacity(0.1), lineWidth: 4) }
    }
  }
}
