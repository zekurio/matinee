import Foundation
import Testing

@testable import MatineeCore

@MainActor final class MemorySecrets: SecretStore {
  var values: [String: String] = [:]
  func token(for origin: String) -> String? { values[origin] }
  func setToken(_ token: String?, for origin: String) { values[origin] = token }
}
@MainActor func testStore() -> SessionStore {
  let defaults = UserDefaults(suiteName: "auth-test-" + UUID().uuidString)!
  return SessionStore(defaults: defaults, secrets: MemorySecrets())
}
let authUser = User(
  id: "one", username: "viewer", displayName: nil, role: "user", avatarId: nil,
  avatarSource: "none", playback: nil, library: .init(showSpecials: false), sharing: .init(favorites: false, stats: false))
let authConfig =
  #"{"setup":null,"passkeys":true,"passkeySignUp":false,"oidc":null,"themeAccents":{"light":null,"dark":null},"loginBackdrop":{"enabled":false,"artwork":"","blur":0,"fade":0}}"#

final class AuthProtocol: URLProtocol, @unchecked Sendable {
  static let lock = NSLock()
  nonisolated(unsafe) static var mode = "ok"
  nonisolated(unsafe) static var requests: [URL] = []
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let mode = Self.lock.withLock {
      Self.requests.append(request.url!)
      return Self.mode
    }
    if mode == "offline" || (mode == "https-fails" && request.url?.scheme == "https") {
      client?.urlProtocol(self, didFailWithError: URLError(.cannotConnectToHost))
      return
    }
    let path = request.url!.path
    let status = mode == "401" && path.hasSuffix("session") ? 401 : 200
    var body = Data(authConfig.utf8)
    if path.hasSuffix("health") { body = Data(#"{"ok":true,"contract":"test"}"#.utf8) }
    if path.hasSuffix("session") {
      body = try! JSONEncoder().encode(AuthSessionOutput(user: authUser))
    }
    if path.hasSuffix("sign-out") { body = Data() }
    if path.hasSuffix("/app/token") {
      body = try! JSONEncoder().encode(AppSession(token: "secret", user: authUser))
    }
    client?.urlProtocol(
      self,
      didReceive: HTTPURLResponse(
        url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!,
      cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: body)
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}

@Suite(.serialized) struct AuthTests {
  /// The account's answers stay off the disk, as OkHttp keeps no cache on Android.
  @Test func serverClientsKeepNoCacheOrCookies() {
    let config = MatineeSession.apiConfiguration(.default)
    #expect(config.urlCache == nil)
    #expect(config.requestCachePolicy == .reloadIgnoringLocalCacheData)
    #expect(config.httpCookieStorage == nil && !config.httpShouldSetCookies)
    #expect(config.httpAdditionalHeaders?["User-Agent"] as? String == "Matinee (iOS)")
  }
  @Test func addressesAndPKCE() throws {
    #expect(
      MatineeSession.serverCandidates(" media.EXAMPLE:8420/path?x=1 ").map(\.absoluteString) == [
        "https://media.example:8420/", "http://media.example:8420/",
      ])
    #expect(
      MatineeSession.serverCandidates("https://media.example:443/path").map(\.absoluteString) == [
        "https://media.example/"
      ])
    #expect(MatineeSession.serverCandidates("file:///tmp").isEmpty)
    #expect(
      BrowserSignIn.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
        == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    let request = try BrowserSignIn.create()
    #expect(request.verifier.count == 86)
    #expect(UserCode.parse("bcdf ghjk") == "BCDF-GHJK")
    #expect(
      scannedCode("https://media.example/link?code=bcdf-ghjk")?.server == "https://media.example")
  }
  @Test @MainActor func fallbackOrderAndReload() async throws {
    AuthProtocol.lock.withLock {
      AuthProtocol.mode = "https-fails"
      AuthProtocol.requests = []
    }
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [AuthProtocol.self]
    let store = testStore()
    let session = MatineeSession(store: store, configuration: config, automaticallyStart: false)
    #expect(await session.connect("fallback.example") == nil)
    #expect(
      AuthProtocol.lock.withLock { AuthProtocol.requests.map(\.scheme) } == [
        "https", "http", "http",
      ])
    try session.signedIn(.init(token: "saved", user: authUser))
    let restored = MatineeSession(store: store, configuration: config, automaticallyStart: false)
    #expect(restored.activeServer == "http://fallback.example/")
    #expect(restored.lastUser == authUser)
    #expect(
      restored.artworkHeaders(for: URL(string: "http://other.example/api/artwork/1")!).isEmpty)
    #expect(
      restored.artworkHeaders(for: URL(string: "http://fallback.example/api/artwork/1")!)[
        "Authorization"] == "Bearer saved")
    // tvOS has no offline mode; see ClientCapabilities.
    #if !os(tvOS)
    await restored.setOfflineMode(true)
    #expect(restored.state == .offline(server: "http://fallback.example", user: authUser))
    await restored.setOfflineMode(false)
    #expect(restored.state == .signedIn(server: "http://fallback.example", user: authUser))
    #endif
  }
  @Test(.enabled(if: ClientCapabilities.browserSignIn)) @MainActor func transitionsAndStorage() async throws {
    AuthProtocol.lock.withLock {
      AuthProtocol.mode = "ok"
      AuthProtocol.requests = []
    }
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [AuthProtocol.self]
    let store = testStore()
    let session = MatineeSession(store: store, configuration: config, automaticallyStart: false)
    #expect(await session.connect("one.example") == nil)
    #expect(AuthProtocol.lock.withLock { AuthProtocol.requests.first?.scheme } == "https")
    let url = try session.browserSignInUrl()
    let state = URLComponents(url: url, resolvingAgainstBaseURL: false)!.queryItems!.first {
      $0.name == "state"
    }!.value!
    try await session.finishBrowserSignIn(
      URL(string: "matinee://auth/callback?code=code&state=" + state)!)
    #expect(session.lastUser == authUser)
    let old = session.requireApi()
    session.addServer()
    #expect(await session.connect("http://two.example") == nil)
    #expect(session.activeServer == "https://one.example/")
    await session.cancelAdd()
    #expect(session.lastUser == authUser)
    session.addServer()
    _ = await session.connect("http://two.example")
    try session.signedIn(.init(token: "two", user: authUser))
    #expect(store.servers.count == 2)
    await #expect(throws: SessionChanged.self) { try await old.auth.config() }
    await session.switchTo(origin: "https://one.example/")
    #expect(session.lastUser == authUser)
    AuthProtocol.lock.withLock { AuthProtocol.mode = "offline" }
    await session.start()
    #expect(session.state == .unreachable(server: "https://one.example", reason: .refused))
    AuthProtocol.lock.withLock { AuthProtocol.mode = "ok" }
    await session.start()
    #expect(session.state == .signedIn(server: "https://one.example", user: authUser))
    AuthProtocol.lock.withLock { AuthProtocol.mode = "401" }
    _ = try? await session.requireApi().auth.session()
    if case .signedOut = session.state {} else { Issue.record("401 did not sign out") }
    #expect(try store.secrets.token(for: "https://one.example/") == nil)
    AuthProtocol.lock.withLock { AuthProtocol.mode = "ok" }
    try await session.removeServer(origin: "https://one.example/")
    #expect(store.servers.count == 1)
    #expect(session.activeServer == "http://two.example/")
    try await session.signOut()
    #expect(try store.secrets.token(for: "http://two.example/") == nil)
    try await session.removeServer(origin: "http://two.example/")
    #expect(session.state == .noServer())
  }
  @Test @MainActor func connectFailuresSayWhy() async throws {
    AuthProtocol.lock.withLock {
      AuthProtocol.mode = "offline"
      AuthProtocol.requests = []
    }
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [AuthProtocol.self]
    let session = MatineeSession(store: testStore(), configuration: config, automaticallyStart: false)
    #expect(await session.connect("  ") == .empty)
    #expect(
      await session.connect("192.168.1.5:8420")
        == .unreachable(server: "http://192.168.1.5:8420", local: true))
    #expect(
      await session.connect("media.example") == .unreachable(server: "http://media.example", local: false))
    AuthProtocol.lock.withLock { AuthProtocol.mode = "ok" }
    #expect(await session.connect("media.example") == nil)
    #expect(MatineeSession.isLocalNetwork(URL(string: "http://nas.local:8420/")!))
    #expect(MatineeSession.isLocalNetwork(URL(string: "http://[fd00::5]/")!))
    #expect(MatineeSession.isLocalNetwork(URL(string: "http://10.0.0.2/")!))
    #expect(!MatineeSession.isLocalNetwork(URL(string: "http://localhost:18420/")!))
    #expect(!MatineeSession.isLocalNetwork(URL(string: "http://127.0.0.1:18420/")!))
    #expect(!MatineeSession.isLocalNetwork(URL(string: "https://media.example.com/")!))
  }
}
