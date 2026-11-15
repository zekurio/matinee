import Foundation
import Testing

@testable import MatineeCore

@MainActor private struct FakeBrowser: BrowserAuthenticator {
  func authenticate(url: URL) async throws -> URL {
    let items = URLComponents(url: url, resolvingAgainstBaseURL: false)!.queryItems!
    #expect(items.first { $0.name == "code_challenge_method" }?.value == "S256")
    #expect(items.first { $0.name == "redirect_uri" }?.value == BrowserSignIn.REDIRECT_URI)
    let state = items.first { $0.name == "state" }!.value!
    return URL(string: "matinee://auth/callback?code=fake&state=" + state)!
  }
}

extension AuthTests {
  @Test(.enabled(if: ClientCapabilities.browserSignIn)) @MainActor func browserAndPendingRestoration() async throws {
    AuthProtocol.lock.withLock { AuthProtocol.mode = "ok" }
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [AuthProtocol.self]
    let store = testStore()
    let session = MatineeSession(store: store, configuration: config, automaticallyStart: false)
    _ = await session.connect("http://one.example")
    try await session.browserSignIn(using: FakeBrowser())
    #expect(session.lastUser == authUser)
    session.addServer()
    _ = await session.connect("http://new.example")
    _ = try session.browserSignInUrl()
    let pending = try #require(store.pendingSignIn)
    let restored = MatineeSession(store: store, configuration: config, automaticallyStart: false)
    await #expect(throws: URLError.self) {
      try await restored.finishBrowserSignIn(
        URL(string: "matinee://auth/callback?state=wrong&code=fake")!)
    }
    #expect(store.pendingSignIn != nil)
    try await restored.finishBrowserSignIn(
      URL(string: "matinee://auth/callback?state=" + pending.state + "&code=fake")!)
    #expect(restored.activeServer == "http://new.example/")
    #expect(restored.servers.count == 2)
    #expect(store.pendingSignIn == nil)
  }
}
