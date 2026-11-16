#if DEBUG
  import MatineeCore
  import SwiftUI

  /// Launch arguments for development and the remote's scripted runs, in
  /// debug builds only, as the iPhone app's DevLaunch.swift has them:
  ///
  ///     -dev.server URL -dev.token TOKEN   signed in to URL with TOKEN, without the flow
  ///     -dev.route PATH                    a page opened at launch (TVRoutePath in UI/TVNav.swift)
  ///     -dev.art YES, -dev.recommendations YES   Home's stand-ins (Matinee/UI/home/HomeDevData.swift)
  ///
  /// The token goes where a sign-in puts one, the Keychain item for that
  /// server, before the session starts, and the session checks it with the
  /// server as at every launch.
  enum TVDevLaunch {
    private static var defaults: UserDefaults { .standard }

    /// Saves `-dev.server`, and `-dev.token` as its sign-in, as the server in use.
    static func prepare(_ store: SessionStore) {
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

    private static var routeOpened = false

    /// Opens `-dev.route`, once a launch.
    static func openRoute(_ nav: TVNav) {
      guard !routeOpened, let path = defaults.string(forKey: "dev.route") else { return }
      routeOpened = true
      guard let target = TVRoutePath.parse(path) else {
        AppLog.app.error("-dev.route: no TV page at \(path, privacy: .public)")
        return
      }
      nav.open(target)
    }
  }
#endif
