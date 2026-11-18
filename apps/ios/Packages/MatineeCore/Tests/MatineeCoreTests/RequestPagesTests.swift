import Foundation
import Testing
@testable import MatineeCore

@MainActor struct RequestPagesTests {
  @Test func overlappingPagesMergeAndStop() async {
    let pages = RequestPages<String>(identity: { $0 })
    pages.configure(key: "movies") { page in
      .init(items: page == 1 ? ["a", "b"] : ["b", "c"], nextPage: page == 1 ? 2 : nil, stale: page == 1, voteFloor: page, detail: "year")
    }
    await pages.settled()
    #expect(pages.items == ["a", "b"])
    pages.more(); pages.more()
    await pages.settled()
    #expect(pages.items == ["a", "b", "c"])
    #expect(pages.nextPage == nil && pages.stale)
    #expect(pages.voteFloor == 2 && pages.detail == "year")
    pages.more()
    #expect(!pages.loading)
    pages.configure(key: "shows") { _ in .init(items: ["d"], nextPage: nil, stale: false) }
    await pages.settled()
    #expect(pages.items == ["d"] && !pages.stale)
  }
  @Test func failureKeepsCursorForRetry() async {
    let pages = RequestPages<String>(identity: { $0 })
    pages.configure(key: "q") { _ in throw URLError(.cannotConnectToHost) }
    await pages.settled()
    #expect(pages.failure != nil && pages.nextPage == 1)
    pages.configure(key: "q") { _ in .init(items: ["ok"], nextPage: nil, stale: false) }
    pages.more()
    await pages.settled()
    #expect(pages.items == ["ok"] && pages.failure == nil)
  }
}
