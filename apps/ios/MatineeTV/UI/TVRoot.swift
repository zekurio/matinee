import MatineeCore
import MatineeKit
import Nuke
import SwiftUI

/*
 * TvRoot.kt: the app on a TV, from picking a server to signed in, each
 * step a TV screen of its own, fading from one to the next. A TV has no
 * downloads, so no offline mode: a server that doesn't answer shows the
 * unreachable screen, with Retry, whatever is saved.
 *
 * And the part of the iPhone app's Root.swift that follows the session:
 * the images' sign-in, and the theme's accent, the server's own before
 * anyone signs in, as its web login page has it. Toasts show over all of
 * it, from the one host here.
 */
struct TVRoot: View {
  @Environment(TVTopShelf.self) private var topShelf
  @Environment(MatineeSession.self) private var session
  @Environment(ThemeStore.self) private var theme
  @Environment(ToastState.self) private var toasts
  @Environment(\.palette) private var palette
  @State private var pipeline = ImagePipeline.anonymous

  var body: some View {
    ZStack {
      palette.background.ignoresSafeArea()
      screen
        // Into or out of the signed-in app at once: it shouldn't outlive its session, even by a fade.
        .transition(signedIn ? .identity : .opacity)
    }
    .animation(signedIn ? nil : Motion.enter, value: stateKey)
    .tvToastHost(toasts)
    .environment(\.snackbar, Snackbar(post: toasts.post))
    .environment(\.imagePipeline, pipeline)
    // Images ask with the sign-in in use; a new server or sign-in gets a pipeline of its own.
    .onChange(of: session.version, initial: true) {
      pipeline = .matinee(server: session.activeServer.flatMap(URL.init(string:)), headers: session.playerHeaders())
    }
    .onChange(of: session.state, initial: true) { old, state in
      follow(state)
      switch state {
      case .signedOut, .noServer, .connecting: topShelf.clear()
      default: break
      }
      if signedOut(from: old, to: state) { ImagePipeline.forgetAll() }
    }
  }

  @ViewBuilder private var screen: some View {
    switch session.state {
    case .noServer(let canCancel):
      TVConnectScreen(canCancel: canCancel).id(stateKey)
    case .connecting(let server):
      TVConnecting(server: server).id(stateKey)
    case .unreachable(let server, let reason, let retrying):
      TVUnreachableScreen(server: server, reason: reason, retrying: retrying).id(stateKey)
    case .signedOut(let server, let config, let adding):
      // Another server's sign-in starts afresh, with its own code.
      TVSignInScreen(server: server, config: config, adding: adding).id(stateKey)
    case .signedIn(_, let user):
      // A new account starts the screens, and what they keep, afresh.
      TVSignedInApp(user: user).id(stateKey)
    case .offline(let server, _):
      // Not reached: a TV never turns offline mode on (ClientCapabilities).
      TVUnreachableScreen(server: server, reason: .other, retrying: false).id(stateKey)
    }
  }

  private var signedIn: Bool {
    if case .signedIn = session.state { true } else { false }
  }

  /// One screen per state: a retry under way, or the account's details changing, is the same screen.
  private var stateKey: String {
    switch session.state {
    case .noServer: "no-server"
    case .connecting: "connecting"
    case .unreachable: "unreachable"
    case .signedOut(let server, _, _): "out-\(server)"
    case .signedIn(let server, let user): "in-\(user.id)-\(server)"
    case .offline(let server, _): "offline-\(server)"
    }
  }

  private func follow(_ state: AuthState) {
    switch state {
    case .signedIn:
      guard let api = session.api else { return }
      Task { await theme.pull(api) }
    case .signedOut(_, let config, _):
      theme.setAccents(config.themeAccents)
    default: break
    }
  }
}

/// Checking the saved server and session, as the app starts.
struct TVConnecting: View {
  let server: String
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: TVSpace.s8) {
      LogoMark(size: 144)
      Spinner(size: 64, tint: palette.mutedForeground)
      Text(Str.connectConnecting(server.components(separatedBy: "://").last ?? server))
        .textStyle(.body).foregroundStyle(palette.mutedForeground)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .ignoresSafeArea()
  }
}

/// The saved server didn't answer: what happened and why on the left, and
/// Retry, focused, over the way to the server list on the right. The
/// session tries again by itself when the network comes back.
struct TVUnreachableScreen: View {
  let server: String
  let reason: Unreachability
  let retrying: Bool
  @Environment(MatineeSession.self) private var session
  @Environment(\.palette) private var palette
  @State private var switching = false
  @FocusState private var focused: Row?

  private enum Row: Hashable { case retry, change }

  var body: some View {
    let noNetwork = reason == .noNetwork
    TVAuthFrame(
      noNetwork ? Str.unreachableOfflineTitle : Str.unreachableTitle,
      description: unreachableMessage(reason, server: server, canWatchOffline: false)
    ) {
      Text(server).textStyle(.label).foregroundStyle(palette.mutedForeground)
        .padding(.top, TVAuthFrameSide.gap)
    } content: {
      VStack(spacing: TVListItems.gap) {
        TVListItem(
          retrying ? Str.tvUnreachableRetrying : Str.commonRetry, icon: .refreshCw,
          // While it tries, Select waits for the answer.
          action: { if !retrying { Task { await session.start() } } }
        ) {
          if retrying { Spinner(size: 44) }
        }
        .focused($focused, equals: .retry)
        TVListItem(Str.connectChangeServer, icon: .server, quiet: true) { switching = true }
          .focused($focused, equals: .change)
      }
      .defaultFocus($focused, .retry)
    }
    .tvPageFocus($focused, on: .retry)
    .tvServerPanel(isPresented: $switching)
  }
}
