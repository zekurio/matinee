import Foundation
import Testing
@testable import MatineeCore

private final class ActionStub: URLProtocol, @unchecked Sendable {
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let denied = request.url!.host == "denied"
    let allowedPaths = ["/api/v1/media/item-1/favorite", "/api/v1/media/item-1/watched"]
    // Unknown endpoints must fail rather than silently pass a routing test.
    let ok = allowedPaths.contains(request.url!.path) && request.httpMethod == "PUT"
    let status = denied || !ok ? 403 : 200
    client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data((status == 200 ? "null" : "{\"message\":\"Denied\"}").utf8))
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}

@MainActor struct CardActionsTests {
  private func api(_ host: String = "allowed") -> MatineeApi {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [ActionStub.self]
    return MatineeApi(transport: ApiTransport(base: URL(string: "https://\(host)")!, configuration: configuration))
  }
  private var title: TitleSummary {
    TitleSummary(id: "t", libraryId: "l", kind: TitleKind.show, name: "Show", year: nil, overview: nil,
      images: Images(poster: nil, backdrop: nil, logo: nil), genres: [], rating: nil, contentRating: nil,
      runtimeMinutes: nil, originalLanguage: nil, favorite: false, watched: false)
  }
  @Test func seasonAndMetadataPolicy() {
    let viewer = ViewerState()
    let season = Season(number: 1, name: "Season 1", overview: nil, poster: nil, itemCount: 3, watchedCount: 3, favorite: true)
    let p = ActionPermissions(admin: true, mayDownload: true, providerConfigured: true, downloads: true, adminPages: true, imageEditing: true)
    let offered = cardActions(for: .season(title, season), viewer: viewer, permissions: p)
    #expect(offered == [.setWatched(false), .setFavorite(false), .download, .details, .editImages])
    #expect(cardActions(for: .title(title), viewer: viewer, permissions: p).suffix(3) == [.fixMatch, .refreshMetadata, .editImages])
    var loose = season
    loose.number = nil
    #expect(!cardActions(for: .season(title, loose), viewer: viewer, permissions: p).contains(.editImages))
    #expect(!cardActions(for: .season(title, loose), viewer: viewer, permissions: p).contains(.setFavorite(false)))
    var tv = p
    tv.downloads = false; tv.adminPages = false; tv.imageEditing = false
    #expect(cardActions(for: .title(title, here: true), viewer: viewer, permissions: tv).isEmpty)
  }
  @Test func ownPageLeavesOutMarksAndPlayButKeepsStartOverAndRemoval() {
    var item = Answers.item()
    item.progress = WatchState(positionSeconds: 10, completed: false, updatedAt: "now")
    let viewer = ViewerState()
    let p = ActionPermissions(stored: [item.id], downloads: true)
    #expect(cardActions(for: .item(item, here: true), viewer: viewer, permissions: p) == [.playFromStart, .removeDownload])
    #expect(cardActions(for: .item(item, here: true), viewer: viewer, permissions: .init(downloads: false)).contains(.removeDownload) == false)
  }
  @Test func mutationsUpdateSharedMarksAndFailureRollsBack() async throws {
    let viewer = ViewerState()
    let item = Answers.item()
    let target = CardTarget.item(item)
    _ = try await performCardAction(.setFavorite(true), target: target, viewer: viewer, permissions: .init(), api: api())
    #expect(viewer.isFavorite(item))
    do {
      _ = try await performCardAction(.setFavorite(false), target: target, viewer: viewer, permissions: .init(), api: api("denied"))
      Issue.record("Expected refusal")
    } catch { #expect(viewer.isFavorite(item)) }
    _ = try await performCardAction(.setWatched(true), target: target, viewer: viewer, permissions: .init(), api: api(), watchedAt: WatchedAt.unknown)
    #expect(viewer.isWatched(item))
  }
  @Test func deviceAndAccountMustBothAllowNewDownloads() {
    let target = CardTarget.item(Answers.item())
    let viewer = ViewerState()
    #expect(!cardActions(for: target, viewer: viewer, permissions: .init(mayDownload: false, downloads: true)).contains(.download))
    #expect(!cardActions(for: target, viewer: viewer, permissions: .init(mayDownload: true, downloads: false)).contains(.download))
    #expect(cardActions(for: target, viewer: viewer, permissions: .init(mayDownload: true, downloads: true)).contains(.download))
  }
}
