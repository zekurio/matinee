import MatineeCore
import Nuke
import SwiftUI

/*
 * Root.kt: server, then sign-in, then the app, by the session's state. A
 * new server's sign-in starts afresh, with its own code, and a new account
 * starts the screens, and what they keep, afresh.
 *
 * And MatineeApp.kt's part that follows the session: the images' sign-in,
 * the theme's accent, the downloads' server, and the progress watched
 * offline going to the server once it answers again.
 */
struct MatineeRoot: View {
  @Environment(MatineeSession.self) private var session
  @Environment(Downloads.self) private var downloads
  @Environment(ThemeStore.self) private var theme
  @Environment(\.palette) private var palette
  @State private var pipeline = ImagePipeline.anonymous

  var body: some View {
    Group {
      switch session.state {
      case .noServer(let canCancel):
        ConnectScreen(canCancel: canCancel)
      case .connecting(let server):
        VStack(spacing: 16) {
          ProgressView().controlSize(.large).tint(palette.accent)
          Text(Str.connectConnecting(server)).textStyle(.bodyMedium).foregroundStyle(palette.muted)
            .multilineTextAlignment(.center)
        }
        .padding(Gutter)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      case .unreachable(let server, let reason, let retrying):
        UnreachableScreen(server: server, reason: reason, retrying: retrying)
      case .signedOut(let server, let config, let adding):
        SignInScreen(server: server, config: config, adding: adding).id(server)
      case .signedIn(let server, let user):
        SignedInApp(user: user, offline: false).id("\(user.id)\n\(server)")
      case .offline(let server, let user):
        SignedInApp(user: user, offline: true).id("\(user.id)\n\(server)\noffline")
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(palette.background.ignoresSafeArea())
    .environment(\.imagePipeline, pipeline)
    // Images ask with the sign-in in use; a new server or sign-in gets a pipeline of its own.
    .onChange(of: session.version, initial: true) {
      pipeline = .matinee(server: session.activeServer.flatMap(URL.init(string:)), headers: session.playerHeaders())
    }
    .onChange(of: session.activeServer, initial: true) { downloads.store.server = session.activeServer }
    .onChange(of: session.state, initial: true) { _, state in follow(state) }
  }

  private func follow(_ state: AuthState) {
    switch state {
    case .signedIn:
      guard let api = session.api, let server = session.activeServer else { return }
      Task { await theme.pull(api) }
      // Signed in with the server answering: where the person got to in
      // downloads watched offline goes to it, of that server only.
      Task {
        do {
          try await downloads.pendingFor(server).flush { [session] origin in session.serverClient(origin: origin)?.api }
        } catch {
          AppLog.downloads.error("Could not send progress watched offline")
        }
      }
    case .signedOut(_, let config, _):
      theme.setAccents(config.themeAccents)
    default: break
    }
  }
}

extension ImagePipeline {
  /// The pipeline for the server in use: `headers`, the session's
  /// `Authorization`, go with requests to `server` and nowhere else, so an
  /// image from anywhere else never gets the token.
  nonisolated static func matinee(server: URL?, headers: [String: String]) -> ImagePipeline {
    guard let server, !headers.isEmpty else { return .anonymous }
    return ImagePipeline(delegate: SignedImages(server: server, headers: headers)) {
      $0.dataLoader = DataLoader(configuration: DataLoader.defaultConfiguration)
      $0.dataCache = try? DataCache(name: "io.github.zekurio.matinee.images")
    }
  }

  /// Every image the app keeps, in memory and on disk: a removed server's go with it.
  nonisolated static func forgetAll() {
    ImageCache.shared.removeAll()
    (try? DataCache(name: "io.github.zekurio.matinee.images"))?.removeAll()
  }
}

/// Adds the session's headers to requests for its server's origin.
private final class SignedImages: ImagePipeline.Delegate {
  let server: URL
  let headers: [String: String]

  init(server: URL, headers: [String: String]) {
    self.server = server
    self.headers = headers
  }

  func willLoadData(for request: ImageRequest, urlRequest: URLRequest, pipeline: ImagePipeline) async throws
    -> URLRequest
  {
    guard let url = urlRequest.url, url.scheme == server.scheme, url.host == server.host, url.port == server.port
    else { return urlRequest }
    var signed = urlRequest
    for (name, value) in headers { signed.setValue(value, forHTTPHeaderField: name) }
    return signed
  }
}
