import Foundation
import Testing
@testable import MatineeCore

/// RequestNotices.swift: what a check shows, keeps, and marks read.
struct RequestNoticeCheckTests {
  let now = Date(timeIntervalSince1970: 1_800_000_000)

  func notice(_ id: String, _ kind: String, hoursAgo: Double = 1, title: CatalogTitleSummary? = nil, read: Bool = false) -> MatineeCore.Notification {
    let at = ISO8601DateFormatter().string(from: now.addingTimeInterval(-hoursAgo * 3600))
    return MatineeCore.Notification(id: id, kind: kind, title: title, season: nil, count: 2, createdAt: at, readAt: read ? at : nil)
  }

  func store() -> RequestNoticeStore {
    let name = "test.\(UUID().uuidString)"
    return RequestNoticeStore(server: "http://s", account: "u") { UserDefaults(suiteName: name)! }
  }

  var dune: CatalogTitleSummary {
    var availability = Availability(
      state: "here", action: nil, progress: nil, etaSeconds: nil, releaseDate: nil, stillLooking: false, reason: nil,
      askedBySelf: true, following: false, requestId: nil, others: .init(count: 0, names: []), limit: nil,
      libraryTitleId: "t", disabledReason: nil)
    availability.libraryTitleId = "t"
    return CatalogTitleSummary(ref: CatalogRef(kind: "movie", provider: "tmdb", providerId: "1"), name: "Dune", year: nil, poster: nil, availability: availability)
  }

  @Test func freshNoticesShowOnceAndEveryUnreadOneIsMarkedRead() async throws {
    let store = store()
    let items = [notice("a", "ready", title: dune), notice("b", "waiting"), notice("old", "waiting", hoursAgo: 100), notice("r", "waiting", read: true)]
    let marked = Box<[String]>([])
    let shown = try await checkRequestNotices(
      store: store, now: now, fetch: { items }, markRead: { marked.value = $0 }, present: { $0 })
    #expect(shown.map(\.id) == ["a", "b"])
    #expect(marked.value == ["a", "b", "old"])
    #expect(store.seen == ["a", "b", "old"])
    #expect(store.lastCheck == now)
    // The server hasn't caught up: nothing shows twice.
    let again = try await checkRequestNotices(store: store, now: now, fetch: { items }, markRead: { _ in }, present: { $0 })
    #expect(again.isEmpty)
  }

  @Test func nothingIsMarkedWhenShowingFailed() async throws {
    let store = store()
    let marked = Box<[String]>([])
    let shown = try await checkRequestNotices(
      store: store, now: now, fetch: { [notice("a", "waiting")] }, markRead: { marked.value = $0 }, present: { _ in nil })
    #expect(shown.isEmpty && marked.value.isEmpty && store.seen.isEmpty)
  }

  @Test func atMostAFewAtOnce() async throws {
    let items = (0..<8).map { notice("n\($0)", "waiting") }
    let shown = try await checkRequestNotices(store: store(), now: now, fetch: { items }, markRead: { _ in }, present: { $0 })
    #expect(shown.count == 5)
  }

  @Test func settingsAreKeptPerAccount() {
    let name = "test.\(UUID().uuidString)"
    let one = RequestNoticeStore(server: "http://s", account: "u") { UserDefaults(suiteName: name)! }
    let other = RequestNoticeStore(server: "http://s", account: "v") { UserDefaults(suiteName: name)! }
    #expect(one.settings == RequestNoticeSettings())
    one.settings = RequestNoticeSettings(background: false, askedPermission: true)
    #expect(one.settings.background == false && one.settings.askedPermission)
    #expect(other.settings == RequestNoticeSettings())
  }

  @Test func wordsAndLinks() {
    #expect(requestNoticeWords(notice("a", "waiting")) == .waiting(2))
    #expect(requestNoticeWords(notice("a", "needsAttention")) == .attention(2))
    #expect(requestNoticeWords(notice("a", "ready", title: dune)) == .ready(name: "Dune", season: nil))
    #expect(requestNoticeWords(notice("a", "ready")) == nil)
    #expect(requestNoticeWords(notice("a", "unavailable", title: dune)) == .unavailable(name: "Dune", reason: nil))
    #expect(requestNoticeWords(notice("a", "other")) == nil)
    let ref = CatalogRef(kind: "show", provider: "tmdb", providerId: "1396")
    for target in [RequestNoticeTarget.title("t"), .catalog(ref), .queue("waiting")] {
      let link = RequestNoticeLink(server: "http://s", account: "u", target: target)
      #expect(RequestNoticeLink(userInfo: link.userInfo)?.parsed == target)
    }
    #expect(requestNoticeTarget(notice("a", "ready", title: dune)) == .title("t"))
  }
}

/// A value a `@Sendable` closure can change, for a test to read after.
final class Box<T>: @unchecked Sendable {
  var value: T
  init(_ value: T) { self.value = value }
}
