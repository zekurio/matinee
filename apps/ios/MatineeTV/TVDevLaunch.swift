#if DEBUG
  import MatineeCore
  import SwiftUI

  /// Launch arguments for development and the remote's scripted runs, in
  /// debug builds only, as the iPhone app's DevLaunch.swift has them:
  ///
  ///     -dev.server URL -dev.token TOKEN   signed in to URL with TOKEN, without the flow
  ///     -dev.route PATH                    a page opened at launch (TVRoutePath in UI/TVNav.swift)
  ///
  /// The token goes where a sign-in puts one, the Keychain item for that
  /// server, before the session starts, and the session checks it with the
  /// server as at every launch.
  enum TVDevLaunch {
    private static var defaults: UserDefaults { .standard }

    /// Saves `-dev.server`, and `-dev.token` as its sign-in, as the server in use.
    static func prepare(_ store: SessionStore) {
      devSignIn(store)
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
