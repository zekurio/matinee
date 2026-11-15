import Foundation
import Network
import Observation

public enum Unreachability: Sendable {
  case noNetwork, refused, notFound, timeout, certificate, other
}
public enum AuthState: Sendable, Equatable {
  case noServer(canCancel: Bool = false)
  case connecting(server: String)
  case unreachable(server: String, reason: Unreachability, retrying: Bool = false)
  case signedOut(server: String, config: AuthConfig, adding: Bool = false)
  case signedIn(server: String, user: User)
  case offline(server: String, user: User)
}
public struct SavedServer: Sendable, Identifiable {
  public var id: String { origin }
  public let origin: String
  public let address: String
  public let name: String?
  public let user: User?
  public let active: Bool
}
public struct ServerClient: Sendable { public let api: MatineeApi }
/// Why `connect` didn't reach a server, for the app to word in its own
/// language: Android's `connect_empty`, `connect_not_matinee`, and
/// `connect_failed`. `server` is the address last tried, without the
/// trailing slash; `local` when its host is on the local network, where iOS
/// may be keeping the app away from it.
public enum ConnectFailure: Error, Sendable, Equatable {
  case empty
  case notMatinee(server: String)
  case unreachable(server: String, local: Bool)
}
public struct SessionChanged: Error {}

@Observable @MainActor public final class MatineeSession {
  public private(set) var state: AuthState = .noServer()
  public private(set) var servers: [SavedServer] = []
  public private(set) var activeServer: String?
  public private(set) var removing: Set<String> = []
  public private(set) var version = 0
  public private(set) var api: MatineeApi?
  public var onRemove: ((String, MatineeApi?) async -> Void)?
  public let deviceName: String
  public let platform = ClientCapabilities.sessionPlatform
  #if os(tvOS)
  public let isTv = true
  #else
  public let isTv = false
  #endif
  private let store: SessionStore
  private let configuration: URLSessionConfiguration
  private var candidate: (origin: String, name: String?)?
  private var beforeAdding: AuthState?
  private var tokens: [String: String] = [:]
  private var revisions: [String: Int] = [:]
  private let monitor = NWPathMonitor()

  public init(
    store: SessionStore = SessionStore(), configuration: URLSessionConfiguration = .default,
    deviceName: String = ProcessInfo.processInfo.hostName, automaticallyStart: Bool = true
  ) {
    self.store = store
    self.configuration = Self.apiConfiguration(configuration)
    self.deviceName = deviceName
    for saved in store.servers {
      tokens[saved.origin] = try? store.secrets.token(for: saved.origin)
    }
    activeServer = store.active ?? store.servers.first?.origin
    store.active = activeServer
    rebind()
    publish()
    monitor.pathUpdateHandler = { [weak self] path in
      guard path.status == .satisfied else { return }
      Task { @MainActor in
        if case .unreachable(_, _, false) = self?.state { await self?.start() }
      }
    }
    if automaticallyStart {
      monitor.start(queue: DispatchQueue(label: "matinee.reachability"))
      Task { await start() }
    }
  }
  deinit { monitor.cancel() }
  /// The servers' clients' configuration: no cookies, as the token is the
  /// sign-in, and no cache on disk, as OkHttp keeps none on Android. The
  /// server's answers are the account's, its sessions, favorites, and
  /// settings, and stay nowhere once it signs out.
  nonisolated static func apiConfiguration(_ configuration: URLSessionConfiguration)
    -> URLSessionConfiguration
  {
    // SAFETY: Foundation's configuration copy preserves its concrete class.
    let config = configuration.copy() as! URLSessionConfiguration
    config.httpShouldSetCookies = false
    config.httpCookieStorage = nil
    config.urlCache = nil
    config.requestCachePolicy = .reloadIgnoringLocalCacheData
    config.timeoutIntervalForRequest = 60
    config.httpAdditionalHeaders = (config.httpAdditionalHeaders ?? [:]).merging([
      "User-Agent": "Matinee (iOS)"
    ]) { _, new in new }
    return config
  }
  nonisolated public static func serverCandidates(_ input: String) -> [URL] {
    let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return [] }
    return (text.contains("://") ? [text] : ["https://" + text, "http://" + text]).compactMap {
      guard var c = URLComponents(string: $0),
        ["http", "https"].contains(c.scheme?.lowercased() ?? ""),
        let host = c.host, !host.isEmpty,
        host.rangeOfCharacter(from: .whitespacesAndNewlines) == nil,
        c.port.map({ (1...65535).contains($0) }) ?? true
      else { return nil }
      c.scheme = c.scheme?.lowercased()
      c.host = host.lowercased()
      c.user = nil
      c.password = nil
      c.path = "/"
      c.query = nil
      c.fragment = nil
      if (c.scheme == "https" && c.port == 443) || (c.scheme == "http" && c.port == 80) {
        c.port = nil
      }
      return c.url
    }
  }
  public static func keyOf(_ url: URL) -> String {
    serverCandidates(url.absoluteString).first!.absoluteString
  }
  private func display(_ key: String) -> String { String(key.dropLast()) }
  public var offlineMode: Bool { ClientCapabilities.offlineMode && store.offlineMode }
  public var lastServer: String? {
    guard let last = store.lastServer, !store.servers.contains(where: { $0.origin == last }) else {
      return nil
    }
    return display(last)
  }
  public var lastUser: User? {
    guard let key = activeServer, tokens[key] != nil else { return nil }
    return store.servers.first { $0.origin == key }?.user
  }
  public func artworkHeaders(for url: URL) -> [String: String] {
    guard url.path.hasPrefix("/api/artwork/"),
      let key = Self.serverCandidates(url.absoluteString).first?.absoluteString,
      let token = tokens[key]
    else { return [:] }
    return ["Authorization": "Bearer \(token)"]
  }
  public func playerHeaders() -> [String: String] {
    guard let key = activeServer, let token = tokens[key] else { return [:] }
    return ["Authorization": "Bearer \(token)"]
  }
  private func client(_ key: String, bound: Bool = false, signOutTimeout: Bool = false)
    -> MatineeApi
  {
    let made = version
    let revision = revisions[key, default: 0]
    // SAFETY: Foundation's configuration copy preserves its concrete class.
    let config = configuration.copy() as! URLSessionConfiguration
    if signOutTimeout {
      config.timeoutIntervalForRequest = 10
      config.timeoutIntervalForResource = 10
    }
    return MatineeApi(
      transport: ApiTransport(
        base: URL(string: key)!, configuration: config,
        tokenProvider: { [weak self] in
          guard let self else { throw SessionChanged() }
          return try await self.credentials(key, made: bound ? made : nil)
        }, onUnauthorized: { [weak self] in await self?.unauthorized(key, revision: revision) }))
  }
  private func credentials(_ key: String, made: Int?) throws -> String? {
    if let made, version != made { throw SessionChanged() }
    guard store.servers.contains(where: { $0.origin == key }) else { throw SessionChanged() }
    return tokens[key]
  }
  private func unauthorized(_ key: String, revision: Int) async {
    guard revisions[key, default: 0] == revision, tokens[key] != nil else { return }
    try? clearToken(key)
    // In a task of its own: the request that was turned down may belong to
    // a screen the sign-out takes away, whose cancellation would otherwise
    // cut off the check that leads to the sign-in screen.
    if key == activeServer { await Task { await start() }.value }
  }
  private func rebind() {
    version += 1
    api = activeServer.map { client($0, bound: true) }
  }
  private func publish() {
    servers = store.servers.map {
      .init(
        origin: $0.origin, address: display($0.origin), name: $0.name,
        user: tokens[$0.origin] == nil ? nil : $0.user, active: $0.origin == activeServer)
    }
  }
  public func requireApi() -> MatineeApi {
    precondition(api != nil, "not connected")
    return api!
  }
  public func signInApi() -> MatineeApi {
    candidate.map { MatineeApi(base: URL(string: $0.origin)!, configuration: configuration) }
      ?? requireApi()
  }
  public func serverClient(origin: String) -> ServerClient? {
    store.servers.contains { $0.origin == origin } ? .init(api: client(origin)) : nil
  }
  public func start() async {
    candidate = nil
    beforeAdding = nil
    guard let key = activeServer else {
      state = .noServer()
      return
    }
    if offlineMode, let user = lastUser {
      state = .offline(server: display(key), user: user)
      return
    }
    let made = version
    if case .unreachable(let server, let reason, _) = state {
      state = .unreachable(server: server, reason: reason, retrying: true)
    } else {
      state = .connecting(server: display(key))
    }
    do {
      let user = tokens[key] == nil ? nil : try await requireApi().auth.session().user
      guard version == made else { return }
      if let user {
        updateSavedUser(key, user)
        state = .signedIn(server: display(key), user: user)
      } else {
        if tokens[key] != nil { try clearToken(key) }
        let checked = version
        let config = try await requireApi().auth.config()
        guard checked == version else { return }
        state = .signedOut(server: display(key), config: config)
      }
    } catch {
      guard version == made else { return }
      state = .unreachable(server: display(key), reason: reason(error))
    }
  }
  private struct ServerHealth: Decodable {
    let ok: Bool
    let contract: String
  }
  private func checkHealth(_ url: URL) async throws {
    // Android's 15 s to connect: a server that isn't there shouldn't hold
    // the connect screen for the minute an encode may take to answer.
    // SAFETY: Foundation's configuration copy preserves its concrete class.
    let config = configuration.copy() as! URLSessionConfiguration
    config.timeoutIntervalForRequest = 15
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }
    let (data, response) = try await session.data(from: url.appending(path: "api/health"))
    guard (response as? HTTPURLResponse)?.statusCode == 200,
      let health = try? JSONDecoder().decode(ServerHealth.self, from: data), health.ok,
      !health.contract.isEmpty
    else { throw URLError(.badServerResponse) }
    // Decoding auth.config below checks the fields this client needs. The health
    // fingerprint is not a version range and cannot establish compatibility alone.
  }
  public func connect(_ input: String, name: String? = nil) async -> ConnectFailure? {
    let urls = Self.serverCandidates(input)
    guard !urls.isEmpty else { return .empty }
    if let saved = urls.first(where: { url in
      store.servers.contains { $0.origin == url.absoluteString }
    }) {
      await switchTo(origin: saved.absoluteString)
      return nil
    }
    var failure = ConnectFailure.empty
    for url in urls {
      let server = display(url.absoluteString)
      do {
        try await checkHealth(url)
        let config = try await MatineeApi(base: url, configuration: configuration).auth.config()
        guard case .noServer = state else { return nil }
        let key = url.absoluteString
        if activeServer == nil {
          store.servers.append(.init(origin: key, name: name))
          activate(key)
          state = .signedOut(server: display(key), config: config)
        } else {
          candidate = (key, name)
          state = .signedOut(server: display(key), config: config, adding: true)
        }
        return nil
      } catch let error as URLError where error.code != .badServerResponse {
        failure = .unreachable(server: server, local: Self.isLocalNetwork(url))
      } catch {
        // It answered, but not as a Matinee server does: an error, or something else.
        failure = .notMatinee(server: server)
      }
    }
    return failure
  }

  /// Whether `url`'s host is on the local network, which iOS asks the person
  /// to allow: a private or link-local address, or a `.local` name. Loopback
  /// isn't; it needs no permission.
  nonisolated public static func isLocalNetwork(_ url: URL) -> Bool {
    guard let host = url.host?.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
    else { return false }
    if host.hasSuffix(".local") { return true }
    if let v4 = IPv4Address(host) {
      let b = [UInt8](v4.rawValue)
      return b[0] == 10 || (b[0] == 172 && (16...31).contains(b[1])) || (b[0] == 192 && b[1] == 168)
        || (b[0] == 169 && b[1] == 254)
    }
    if let v6 = IPv6Address(host) {
      let b = [UInt8](v6.rawValue)
      return (b[0] & 0xFE) == 0xFC || (b[0] == 0xFE && (b[1] & 0xC0) == 0x80)
    }
    // A bare name, like `nas`, resolves on the local network too.
    return !host.contains(".") && host != "localhost"
  }
  public func addServer() {
    if beforeAdding == nil { beforeAdding = state }
    candidate = nil
    state = .noServer(canCancel: activeServer != nil)
  }
  public func cancelAdd() async {
    guard activeServer != nil else { return }
    let previous = beforeAdding
    candidate = nil
    beforeAdding = nil
    switch previous {
    case .signedIn, .offline: state = previous!
    default: await start()
    }
  }
  private func activate(_ key: String) {
    if key != activeServer { store.offlineMode = false }
    activeServer = key
    store.active = key
    store.lastServer = key
    candidate = nil
    beforeAdding = nil
    rebind()
    publish()
  }
  public func switchTo(origin: String) async {
    guard store.servers.contains(where: { $0.origin == origin }) else { return }
    // The one in use, signed in and not being left for another: nothing to do.
    if origin == activeServer, candidate == nil, beforeAdding == nil, case .signedIn = state { return }
    activate(origin)
    await start()
  }
  public func signedIn(_ session: AppSession) throws {
    guard let key = candidate?.origin ?? activeServer else { return }
    try saveSignIn(session, origin: key, name: candidate?.name)
  }
  private func saveSignIn(_ session: AppSession, origin key: String, name: String?) throws {
    try store.secrets.setToken(session.token, for: key)
    if !store.servers.contains(where: { $0.origin == key }) {
      store.servers.append(.init(origin: key, name: name))
    }
    tokens[key] = session.token
    revisions[key, default: 0] += 1
    updateSavedUser(key, session.user)
    activate(key)
    state = .signedIn(server: display(key), user: session.user)
  }
  private func updateSavedUser(_ key: String, _ user: User?) {
    store.servers = store.servers.map {
      var row = $0
      if row.origin == key { row.user = user }
      return row
    }
    publish()
  }
  public func updateUser(user: User) {
    guard let key = activeServer, case .signedIn = state else { return }
    updateSavedUser(key, user)
    state = .signedIn(server: display(key), user: user)
  }
  private func clearToken(_ key: String) throws {
    try store.secrets.setToken(nil, for: key)
    tokens[key] = nil
    revisions[key, default: 0] += 1
    updateSavedUser(key, nil)
    if key == activeServer {
      store.offlineMode = false
      rebind()
    }
  }
  public func signOut() async throws {
    let made = version
    if let key = activeServer {
      try? await client(key, bound: true, signOutTimeout: true).auth.signOut()
    }
    guard made == version, let key = activeServer else { return }
    try clearToken(key)
    await start()
  }
  public func removeServer(origin: String) async throws {
    guard store.servers.contains(where: { $0.origin == origin }), !removing.contains(origin) else {
      return
    }
    removing.insert(origin)
    defer { removing.remove(origin) }
    let api = tokens[origin] == nil ? nil : client(origin, signOutTimeout: true)
    await onRemove?(origin, api)
    if let api { try? await api.auth.signOut() }
    try clearToken(origin)
    store.servers.removeAll { $0.origin == origin }
    if activeServer == origin {
      activeServer = store.servers.first?.origin
      store.active = activeServer
      store.offlineMode = false
      candidate = nil
      beforeAdding = nil
      rebind()
      await start()
    }
    publish()
  }
  #if os(tvOS)
  public func setOfflineMode(_ on: Bool) async throws {
    if on { throw UnsupportedClientFeature.offlineMode }
    store.offlineMode = false
  }
  #else
  public func setOfflineMode(_ on: Bool) async {
    store.offlineMode = on
    if on, let key = activeServer, let user = lastUser {
      state = .offline(server: display(key), user: user)
    } else {
      await start()
    }
  }
  #endif
  public func browserSignInUrl() throws -> URL {
    guard ClientCapabilities.browserSignIn else { throw UnsupportedClientFeature.browserSignIn }
    let request = try BrowserSignIn.create()
    let key = candidate?.origin ?? activeServer!
    store.pendingSignIn = .init(state: request.state, verifier: request.verifier, origin: key)
    return URL(
      string: Paths(URL(string: key)!).authorize(
        redirectUri: BrowserSignIn.REDIRECT_URI,
        state: request.state, codeChallenge: request.challenge, deviceName: deviceName,
        platform: platform))!
  }
  public func finishBrowserSignIn(_ url: URL) async throws {
    guard ClientCapabilities.browserSignIn else { throw UnsupportedClientFeature.browserSignIn }
    guard BrowserSignIn.isCallback(url), let pending = store.pendingSignIn else {
      throw URLError(.badURL)
    }
    let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    guard items.first(where: { $0.name == "state" })?.value == pending.state,
      let code = items.first(where: { $0.name == "code" })?.value
    else { throw URLError(.userAuthenticationRequired) }
    store.pendingSignIn = nil
    let result = try await MatineeApi(
      base: URL(string: pending.origin)!, configuration: configuration
    ).auth.app.token(code: code, codeVerifier: pending.verifier)
    // The pending origin survives process termination while the browser is open,
    // even when the candidate had not yet been saved.
    try saveSignIn(
      result, origin: pending.origin,
      name: candidate?.origin == pending.origin ? candidate?.name : nil)
  }
  public func browserSignIn(using browser: any BrowserAuthenticator) async throws {
    let callback = try await browser.authenticate(url: browserSignInUrl())
    try await finishBrowserSignIn(callback)
  }
  private func reason(_ error: any Error) -> Unreachability {
    switch (error as? URLError)?.code {
    case .notConnectedToInternet: .noNetwork
    case .cannotConnectToHost: .refused
    case .cannotFindHost, .dnsLookupFailed: .notFound
    case .timedOut: .timeout
    case .secureConnectionFailed, .serverCertificateUntrusted, .serverCertificateHasBadDate,
      .serverCertificateHasUnknownRoot:
      .certificate
    default: .other
    }
  }
}
