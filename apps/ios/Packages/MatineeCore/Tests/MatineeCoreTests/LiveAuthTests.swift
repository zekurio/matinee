import Foundation
import Testing

@testable import MatineeCore

// Runs the dev fixture's scripts through Process, which only the Mac has.
#if os(macOS)

struct LiveAuthTests {
  @Test(.enabled(if: ProcessInfo.processInfo.environment["MATINEE_LIVE_AUTH"] == "1"))
  @MainActor func deviceGrant() async throws {
    let session = MatineeSession(store: testStore(), automaticallyStart: false)
    #expect(await session.connect("http://localhost:18420") == nil)
    print("LIVE connected http://localhost:18420")
    let device = DeviceCodes(api: session.signInApi())
    let code = try await device.start(name: "Swift integration test")
    let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      .deletingLastPathComponent()
      .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    let process = Process()
    process.executableURL = root.appending(path: "scripts/dev/approve")
    process.arguments = [code.userCode, "ios-viewer"]
    process.standardOutput = FileHandle.nullDevice
    try process.run()
    process.waitUntilExit()
    #expect(process.terminationStatus == 0)
    let grant = try await device.poll(code)
    try session.signedIn(grant)
    print("LIVE device approved; signed in as \(grant.user.username)")
    let api = session.requireApi()
    let watching = try await api.home.continueWatching()
    let next = try await api.home.nextUp()
    let featured = try await api.home.featured()
    let encoded = String(decoding: try JSONEncoder().encode(featured), as: UTF8.self)
    for title in ["Blade Runner", "Dune", "Jurassic Park"] { #expect(!encoded.contains(title)) }
    #expect(watching.count == 2)
    #expect(next.count == 1)
    print(
      "LIVE Home: continue-watching=\(watching.count), next-up=\(next.count), featured=\(featured.count); restricted titles absent"
    )
    let token = grant.token
    let independent = MatineeApi(
      base: URL(string: "http://localhost:18420")!, tokenProvider: { token })
    try await session.signOut()
    #expect(try await independent.auth.session().user == nil)
    do {
      _ = try await independent.home.continueWatching()
      Issue.record("Revoked token still works")
    } catch let error as ApiException { #expect(error.status == 401) }
    print("LIVE signed out; token rejected by Home; auth.session user=nil")
    var found = 0
    for await _ in discoverServers() { found += 1 }
    print("LIVE discovery: \(found) replies, loopback PUBLIC_URL is not advertised")
  }
}
#endif
