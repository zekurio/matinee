import Testing
@testable import MatineeCore

@MainActor struct TitleFiltersTests {
  @Test func ordersMatchAndroid() {
    #expect(TITLE_ORDERS.count == 10)
    #expect(TitleListState().order == SortOrder.asc)
    #expect(TitleListState(initialSort: "invalid").sort == TitleSort.name)
    for sort in [TitleSort.recent, TitleSort.year, TitleSort.score, TitleSort.runtime] {
      let state = TitleListState(initialSort: sort)
      #expect(state.sort == sort)
      #expect(state.order == SortOrder.desc)
    }
  }

  @Test func rangesCountOnceAndSelectionsIndividually() {
    #expect(NO_TITLE_FILTERS.activeCount == 0)
    var filters = TitleFilters(genres: ["Drama", "Comedy"], studios: ["A"],
      yearFrom: 1990, yearTo: 2000, scoreMin: 4, scoreMax: 9,
      language: "de", runtimeMin: 60, runtimeMax: 120, watched: "watched")
    #expect(filters.activeCount == 8)
    filters.yearFrom = nil
    #expect(filters.activeCount == 8)
    filters.yearTo = nil
    #expect(filters.activeCount == 7)
  }

  @Test func everyListInputChangesIdentity() {
    let state = TitleListState()
    let original = state.key
    state.filters.language = "de"
    #expect(state.key != original)
    state.filters = NO_TITLE_FILTERS
    #expect(state.key == original)
    state.order = SortOrder.desc
    #expect(state.key != original)
    state.order = SortOrder.asc
    state.query = " dune "
    #expect(state.key == original)
    state.settleNow()
    #expect(state.settled == "dune")
    #expect(state.key != original)
    state.clearQuery()
    #expect(state.key == original)
  }
}
