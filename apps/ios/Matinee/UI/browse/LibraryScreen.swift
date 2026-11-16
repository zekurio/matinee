import MatineeCore
import MatineeKit
import SwiftUI

/*
 * LibraryScreen.kt: a library's titles as posters, with the structured
 * filters and the sort, both of which the server applies. On a phone
 * they're icons at the end of the bar, as Android's; from the web's `sm`
 * width up they're its header controls in words. The filters in use are
 * chips over the grid that each take their own off. Searching is Media's
 * field on a phone and the search tab on an iPad, across every library,
 * so a library's page has no field of its own.
 */

/// A library's titles, with sorting and filters. `sort` is a `TitleSort`, or nil for the library's own.
struct LibraryScreen: View {
  let id: String
  let sort: String?

  @State private var libraries = Loader<[Library]>()
  @State private var options = Loader<TitleFilterOptions>()
  @State private var state: TitleListState
  @State private var pages = makeTitlePages()
  @State private var filtering = false
  @State private var devStarted = false
  @Environment(\.windowSize) private var window
  @Environment(\.dynamicTypeSize) private var typeSize
  @Environment(\.shellStyle) private var shellStyle
  @Environment(\.gutter) private var gutter

  init(id: String, sort: String?) {
    self.id = id
    self.sort = sort
    _state = State(initialValue: TitleListState(initialSort: sort))
  }

  var body: some View {
    // First, since the closure below reads it: Xcode 26 refuses a closure that
    // captures a local declared after it, even one shadowing a property.
    let id = id
    let library = libraries.state.value?.first { $0.id == id }
    let offered = options.state.value
    let state = state
    let chips = titleFilterChips(state.filters, options: offered) { state.filters = $0 }
    let (sort, order, filters) = (state.sort, state.order, state.filters)
    PosterGrid(
      pages,
      // The year, or with the score or runtime while sorted by it.
      detail: { titleCardDetailText($0, sort: sort) },
      empty: { libraryEmptyState(library, state) }
    ) {
      if !chips.isEmpty {
        ActiveFilterChips(chips: chips, onClear: state.clearFilters)
          .padding(.top, Space.s1)
          .padding(.bottom, Space.s4)
      }
    }
    .pages(pages, key: state.key) { api, offset, limit in
      #if DEBUG
        // The fixtures' filters aren't the server's: ask for what it can answer, and score what it sends.
        if BrowseFixtures.on {
          return BrowseFixtures.rated(
            try await api.titles.list(
              libraryId: id, filters: BrowseFixtures.served(filters), sort: sort, order: order, limit: limit,
              offset: offset))
        }
      #endif
      return try await api.titles.list(
        libraryId: id, filters: filters, sort: sort, order: order, limit: limit, offset: offset)
    }
    .loads(libraries) { api in try await api.libraries.list() }
    .loadsFilterOptions(options, libraryId: id)
    .hidesSystemNavigationBar()
    .safeAreaInset(edge: .top, spacing: 0) { bar(library, offered) }
    .titleFilterSheet(
      isPresented: $filtering, kind: library?.kind == LibraryKind.shows ? TitleKind.show : TitleKind.movie,
      options: offered, state: state)
    #if DEBUG
      .onAppear(perform: devStart)
    #endif
  }

  #if DEBUG
    /// The page as `-dev.browse.*` asks to start it, once (BrowseFixtures.swift).
    private func devStart() {
      guard !devStarted else { return }
      devStarted = true
      if let filters = BrowseFixtures.filters { state.filters = filters }
      if let order = TITLE_ORDERS.first(where: { $0.sort == BrowseFixtures.sort }) { state.apply(order) }
      switch BrowseFixtures.open {
      case "filters", "language": filtering = true
      default: break
      }
    }
  #endif

  /// The bar: the name, then the filters and the sort, icons on a phone
  /// and the web's header controls in words from `sm` up.
  private func bar(_ library: Library?, _ offered: TitleFilterOptions?) -> some View {
    let wide = wideControls(window, typeSize, shellStyle)
    return TopBar(library?.name) {
      HStack(spacing: wide ? Space.s2 : 0) {
        DisconnectedAction(libraries, options)
        if offered != nil { TitleFilterButton(active: state.activeFilters) { filtering = true } }
        TitleSortButton(state: state, options: offered)
      }
      .padding(.trailing, wide ? gutter - 4 : 0)
    }
  }
}

/// The page's background, under a bar of the page's own.
struct PageColor: View {
  @Environment(\.palette) private var palette

  var body: some View { palette.background }
}
