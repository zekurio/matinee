import Foundation
import Testing

@testable import MatineeCore

/// Answers the login backdrop's request with `body`, or a 404 when it's nil, and counts requests.
final class BackdropProtocol: URLProtocol, @unchecked Sendable {
  static let lock = NSLock()
  nonisolated(unsafe) static var body: String?
  nonisolated(unsafe) static var requests: [String] = []
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let body = Self.lock.withLock {
      Self.requests.append(request.url!.path)
      return Self.body
    }
    client?.urlProtocol(
      self,
      didReceive: HTTPURLResponse(
        url: request.url!, statusCode: body == nil ? 404 : 200, httpVersion: nil, headerFields: nil)!,
      cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data((body ?? #"{"message":"Not found"}"#).utf8))
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}

private func tile(_ id: String, _ kind: String) -> LoginBackdropTile {
  LoginBackdropTile(artwork: Artwork(id: id, placeholder: nil), kind: kind)
}

@Suite(.serialized) struct LoginBackdropTests {
  /// Row for row, the order the web's seeded shuffle gives (login-backdrop.tsx, run in Node).
  @Test func shufflesAsTheWebDoes() {
    var random = SeededRandom(seed: 1)
    #expect(abs(random.next() - 0.6270739405881613) < 1e-12)
    #expect(abs(random.next() - 0.002735721180215478) < 1e-12)
    let list = Array(0..<10)
    #expect(LoginBackdropLayout.shuffled(list, seed: 1) == [7, 8, 3, 2, 1, 5, 9, 4, 0, 6])
    #expect(LoginBackdropLayout.shuffled(list, seed: 2) == [0, 9, 4, 1, 6, 5, 3, 8, 2, 7])
    #expect(LoginBackdropLayout.shuffled(list, seed: 7) == [6, 5, 8, 1, 2, 3, 4, 7, 9, 0])
  }

  @Test func rowsRepeatTheirShuffleUntilWideEnough() {
    let tiles = [tile("a", "poster"), tile("b", "thumb"), tile("c", "poster")]
    let rows = LoginBackdropLayout.rows(tiles, count: 4, minWidth: 6)
    #expect(rows.count == 4)
    for row in rows {
      let width = row.reduce(0) { $0 + LoginBackdropLayout.aspect(of: $1) }
      #expect(width >= 6)
      // Short of the last tile, it wasn't wide enough yet.
      #expect(width - LoginBackdropLayout.aspect(of: row.last!) < 6)
      // Each row is a cycle of one shuffle.
      #expect(row.count > 3 && row[3] == row[0])
    }
    #expect(Set(rows.map { $0.prefix(3).map(\.artwork.id) }).count > 1)
    let empty = LoginBackdropLayout.rows([], count: 3)
    #expect(empty.count == 3 && empty.allSatisfy { $0.isEmpty })
  }

  @Test func measures() {
    #expect(LoginBackdropLayout.rowHeight(screenHeight: 400) == 88)
    #expect(LoginBackdropLayout.rowHeight(screenHeight: 874) == 874 * 0.16)
    #expect(LoginBackdropLayout.rowHeight(screenHeight: 2000) == 200)
    #expect(LoginBackdropLayout.rowCount(screenHeight: 874, rowHeight: 139.84) == 11)
    // A phone needs a copy wider than its sloped wall; a wide screen gets the web's 30.
    #expect(LoginBackdropLayout.minRowWidth(screenWidth: 402, rowHeight: 139.84) == 7)
    #expect(LoginBackdropLayout.minRowWidth(screenWidth: 3440, rowHeight: 200) == 30)
    // A copy half as long as the web's drifts in half the time: the same speed.
    #expect(LoginBackdropLayout.duration(row: 0, copyWidth: 15 * 100, rowHeight: 100) == 48)
    #expect(LoginBackdropLayout.duration(row: 11, copyWidth: 30 * 100, rowHeight: 100) == 120)
    let row = [tile("a", "poster"), tile("b", "thumb")]
    #expect(abs(LoginBackdropLayout.copyWidth(row, rowHeight: 90) - (60 + 160 + 24)) < 1e-9)
  }

  @Test func strengthFollowsFadeAndTheme() {
    let settings = LoginBackdrop(enabled: true, artwork: "mixed", blur: 12, fade: 70)
    #expect(abs(LoginBackdropLayout.strength(settings, dark: true) - 0.3) < 1e-9)
    #expect(abs(LoginBackdropLayout.strength(settings, dark: false) - 0.3 * 0.35) < 1e-9)
    let faded = LoginBackdrop(enabled: true, artwork: "mixed", blur: 0, fade: 140)
    #expect(LoginBackdropLayout.strength(faded, dark: true) == 0)
  }

  @Test func tilesOnlyWhileOnAndAnswered() async {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [BackdropProtocol.self]
    let api = MatineeApi(base: URL(string: "https://media.example/")!, configuration: config)
    let on = LoginBackdrop(enabled: true, artwork: "mixed", blur: 12, fade: 70)
    let off = LoginBackdrop(enabled: false, artwork: "mixed", blur: 12, fade: 70)
    BackdropProtocol.lock.withLock {
      BackdropProtocol.requests = []
      BackdropProtocol.body = #"{"tiles":[{"artwork":{"id":"art1","placeholder":null},"kind":"poster"}]}"#
    }

    #expect(await LoginBackdropLayout.tiles(api, settings: off).isEmpty)
    #expect(BackdropProtocol.lock.withLock { BackdropProtocol.requests.isEmpty })

    let tiles = await LoginBackdropLayout.tiles(api, settings: on)
    #expect(tiles == [tile("art1", "poster")])
    #expect(BackdropProtocol.lock.withLock { BackdropProtocol.requests } == ["/api/v1/auth/login-backdrop"])

    // An older server, without the route: the plain background.
    BackdropProtocol.lock.withLock { BackdropProtocol.body = nil }
    #expect(await LoginBackdropLayout.tiles(api, settings: on).isEmpty)
  }
}
