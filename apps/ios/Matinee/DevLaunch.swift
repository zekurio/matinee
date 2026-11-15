#if DEBUG
  import MatineeCore
  import MatineeKit
import SwiftUI

  /// Launch arguments for development and scripted screenshots, in debug
  /// builds only: release builds don't compile this file's code, so nothing
  /// there reads a token or a route from the command line.
  ///
  ///     -dev.server URL -dev.token TOKEN   signed in to URL with TOKEN, without the flow
  ///     -dev.route PATH                    a page opened at launch (RoutePath in Nav.swift)
  ///     -dev.offline YES                   offline mode on (NO turns it off), as Settings' switch
  ///
  /// The token goes where a sign-in puts one, the Keychain item for that
  /// server, before the session starts, and the session checks it with the
  /// server as it does at every launch. So it stays signed in after a launch
  /// without the arguments, until the server ends the session or Sign out.
  enum DevLaunch {
    private static var defaults: UserDefaults { .standard }

    /// Saves `-dev.server`, and `-dev.token` as its sign-in, as the server in use.
    static func prepare(_ store: SessionStore) {
      // On its own too, for the server already in use.
      if defaults.object(forKey: "dev.offline") != nil {
        store.offlineMode = defaults.bool(forKey: "dev.offline")
      }
      guard let address = defaults.string(forKey: "dev.server"),
        let url = MatineeSession.serverCandidates(address).first
      else { return }
      let key = url.absoluteString
      if !store.servers.contains(where: { $0.origin == key }) {
        store.servers.append(StoredServer(origin: key))
      }
      if let token = defaults.string(forKey: "dev.token"), !token.isEmpty,
        (try? store.secrets.token(for: key)) != token
      {
        try? store.secrets.setToken(token, for: key)
        // Another token may be another account: the session fetches it anew.
        store.servers = store.servers.map {
          var server = $0
          if server.origin == key { server.user = nil }
          return server
        }
      }
      store.active = key
      store.lastServer = key
    }

    /// Offline mode needs the account, which a new token only gets once the
    /// server answered: then it goes offline.
    static func follow(_ session: MatineeSession) {
      guard defaults.bool(forKey: "dev.offline") else { return }
      Task {
        for _ in 0..<150 {
          switch session.state {
          case .offline: return
          case .signedIn:
            await session.setOfflineMode(true)
            return
          default: try? await Task.sleep(for: .milliseconds(200))
          }
        }
      }
    }

    private static var routeOpened = false

    /// Opens `-dev.route`, once a launch.
    static func openRoute(_ nav: ShellNav) {
      guard !routeOpened, let path = defaults.string(forKey: "dev.route") else { return }
      routeOpened = true
      guard let target = RoutePath.parse(path) else {
        AppLog.app.error("-dev.route: no page at \(path, privacy: .public)")
        return
      }
      nav.open(target)
    }
  }
#endif
