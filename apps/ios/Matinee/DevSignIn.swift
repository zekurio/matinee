#if DEBUG
  import Foundation
  import MatineeCore

  /// `-dev.server URL -dev.token TOKEN`, for both apps' DevLaunch: saves the
  /// server, and the token as its sign-in, as the server in use. The token
  /// goes where a sign-in puts one, the Keychain item for that server,
  /// before the session starts, and the session checks it with the server as
  /// it does at every launch.
  func devSignIn(_ store: SessionStore) {
    let defaults = UserDefaults.standard
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
#endif
