import Testing
@testable import MatineeCore
@MainActor struct RequestChooserTests {
  @Test func defaultsOnlyAndFuture() {
    let fixtures = RequestViewParityTests()
    let ref = CatalogRef(kind: "show", provider: "tmdb", providerId: "1")
    let seasons = [fixtures.season(1), fixtures.season(2), fixtures.season(0, selected: false)]
    let chooser = RequestChooser(ref: ref, seasons: seasons, first: true, defaultFuture: true, libraryId: "shows")
    #expect(chooser.picked == [1, 2] && chooser.future)
    chooser.toggle(1); chooser.toggle(2)
    #expect(chooser.label == .future)
    chooser.setFuture(false)
    #expect(chooser.label == .pickOne)
    chooser.toggle(0)
    #expect(chooser.label == .specials)
    #expect(chooser.scope == ShowScope(seasons: [0], future: false))
    let only = RequestChooser(ref: ref, seasons: seasons, first: true, defaultFuture: true, libraryId: nil, only: 2)
    #expect(only.picked == [2] && !only.future)
    let more = RequestChooser(ref: ref, seasons: seasons, first: false, defaultFuture: true, libraryId: nil)
    more.setFuture(true)
    #expect(!more.future)
  }
}
