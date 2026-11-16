import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvKind.kt: every movie or every show on a TV, from all libraries
 * together, the drawer's Movies and Shows. The name and count, the sort,
 * the filters, and a search sit at the top, with the filters in use under
 * them, and step aside while focus is below the first row of posters; the
 * focused title's name and facts are on the line under them, its backdrop
 * behind the page. The sort and the filters open a panel at the right
 * (TitleFilterPanel.swift). The server sorts, filters, and searches; the
 * filters are the phone's, which Android TV's genre button stands in for.
 */

/// How wide the search field is beside the sort and the filters, Android TV's 300 dp.
private let SEARCH_WIDTH: CGFloat = 600

struct TVKindScreen: View {
  /// A `TitleKind`.
  let kind: String
  @State private var state = TitleListState()
  @State private var options = Loader<TitleFilterOptions>()
  @State private var pages = makeTVTitlePages()
  @State private var memory = TVFocusMemory()
  @State private var filterPage: TVFilterPage?
  @State private var sorting = false
  @State private var devStarted = false
  @FocusState private var fieldFocused: Bool

  var body: some View {
    @Bindable var state = state
    let shows = kind == TitleKind.show
    let (kind, sort, order, filters, settled) = (kind, state.sort, state.order, state.filters, state.settled)
    TVTitleGrid(pages: pages, memory: memory, listKey: state.key, sort: sort, empty: empty) {
      TVGridHeader(
        title: shows ? Str.browseKindShow : Str.browseKindMovie, detail: pages.total.map(Str.browseTitleCount),
        chips: activeTitleFilters(filters, options: options.state.value),
        onRemove: { chip in state.filters = chip.removed(from: state.filters) }, onClear: state.clearFilters
      ) {
        GridSortAndFilters(state: state, memory: memory, onSort: { sorting = true }, onFilters: { filterPage = .filters })
        TVSearchField(
          text: $state.query, placeholder: shows ? Str.librarySearchShows : Str.librarySearchMovies,
          focus: $fieldFocused, onSubmit: state.settleNow
        )
        .frame(width: SEARCH_WIDTH)
      }
    }
    .ignoresSafeArea()
    .tvTitlePages(pages, key: state.key) { api, offset, limit in
      let query = settled.isEmpty ? nil : settled
      #if DEBUG
        // The fixtures' filters aren't the server's: ask for what it can answer, and score what it sends.
        if BrowseFixtures.on {
          let page = try await api.titles.browse(
            query: query, kind: kind, filters: BrowseFixtures.served(filters), sort: sort, order: order, limit: limit,
            offset: offset)
          return BrowseFixtures.rated(TitleList(items: page.items, total: page.total))
        }
      #endif
      let page = try await api.titles.browse(
        query: query, kind: kind, filters: filters, sort: sort, order: order, limit: limit, offset: offset)
      return TitleList(items: page.items, total: page.total)
    }
    .tvLoadsFilterOptions(options, kind: kind)
    .tvTitleFilters(page: $filterPage, sorting: $sorting, options: options, state: state, kind: kind)
    .tvBrowseFocus(memory, field: $fieldFocused) { firstFocus }
    #if DEBUG
      .onAppear(perform: devStart)
    #endif
  }

  /// The first poster; with none to show, the sort, so the drawer and the filters are still in reach.
  private var firstFocus: (row: String, item: String)? {
    if let first = pages.items.first { return (TVGrid.row, first.id) }
    if pages.done || pages.error != nil { return (GridControls.row, GridControls.sort) }
    return nil
  }

  /// Why there are no titles: nothing matches the search, nothing the filters, or there are none.
  private var empty: TVGridEmpty {
    let shows = kind == TitleKind.show
    switch libraryEmpty(state) {
    case .noMatch(let query):
      return TVGridEmpty(
        icon: .searchX, title: shows ? Str.libraryNoMatchShows(query) : Str.libraryNoMatchMovies(query),
        action: TVNoticeAction(Str.libraryClearSearch, icon: .x, action: state.clearQuery))
    case .noFilterMatch:
      return TVGridEmpty(
        icon: .listFilter, title: shows ? Str.libraryNoFilterMatchShows : Str.libraryNoFilterMatchMovies,
        message: Str.webFiltersNoneHint,
        action: TVNoticeAction(Str.browseClearFilters, icon: .x, action: state.clearFilters))
    case .none:
      return TVGridEmpty(icon: shows ? .tv : .film, title: shows ? Str.libraryNoneShows : Str.libraryNoneMovies)
    }
  }

  #if DEBUG
    /// The page as `-dev.browse.*` asks to start it, once (BrowseFixtures.swift).
    private func devStart() {
      guard !devStarted else { return }
      devStarted = true
      tvBrowseDevStart(state, filterPage: &filterPage, sorting: &sorting)
    }
  #endif
}

#if DEBUG
  /// A grid page's start as `-dev.browse.filters`, `.sort`, `.query`, and `.open` ask
  /// (`filters`, `genres`, `language`, or `sort`), for screenshots.
  func tvBrowseDevStart(_ state: TitleListState, filterPage: inout TVFilterPage?, sorting: inout Bool) {
    if let filters = BrowseFixtures.filters { state.filters = filters }
    if let order = TITLE_ORDERS.first(where: { $0.sort == BrowseFixtures.sort }) { state.apply(order) }
    if let query = BrowseFixtures.query {
      state.query = query
      state.settleNow()
    }
    switch BrowseFixtures.open {
    case "filters": filterPage = .filters
    case "genres": filterPage = .genres
    case "language": filterPage = .language
    case "sort": sorting = true
    default: break
    }
  }
#endif
