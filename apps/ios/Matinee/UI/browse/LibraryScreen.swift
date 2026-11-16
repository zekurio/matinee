import MatineeCore
import MatineeKit
import SwiftUI

/*
 * LibraryScreen.kt: a library's titles as posters, with search, the
 * structured filters, and the sort, all of which the server applies. On a
 * phone they're icons at the end of the bar, as Android's, and searching
 * takes the bar over with Back out of the search and the field, as Android's
 * search bar does; from the web's `sm` width up they're its header controls
 * in words, with the field beside them. The filters in use are chips over
 * the grid that each take their own off.
 */

/// A library's titles, with sorting, filters, and search. `sort` is a `TitleSort`, or nil for the library's own.
struct LibraryScreen: View {
  let id: String
  let sort: String?

  @State private var libraries = Loader<[Library]>()
  @State private var options = Loader<TitleFilterOptions>()
  @State private var state: TitleListState
  @State private var pages = makeTitlePages()
  @State private var searching = false
  @State private var filtering = false
  @State private var fieldFocused = false
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
    let library = libraries.state.value?.first { $0.id == id }
    let offered = options.state.value
    let state = state
    let chips = titleFilterChips(state.filters, options: offered) { state.filters = $0 }
    let id = id
    let (sort, order, filters, settled) = (state.sort, state.order, state.filters, state.settled)
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
              libraryId: id, query: settled.isEmpty ? nil : settled, filters: BrowseFixtures.served(filters), sort: sort,
              order: order, limit: limit, offset: offset))
        }
      #endif
      return try await api.titles.list(
        libraryId: id, query: settled.isEmpty ? nil : settled, filters: filters, sort: sort, order: order, limit: limit,
        offset: offset)
    }
    .loads(libraries) { api in try await api.libraries.list() }
    .loadsFilterOptions(options, libraryId: id)
    .hidesSystemNavigationBar()
    .safeAreaInset(edge: .top, spacing: 0) { bar(library, offered) }
    .titleFilterSheet(
      isPresented: $filtering, kind: library?.kind == LibraryKind.shows ? TitleKind.show : TitleKind.movie,
      options: offered, state: state)
    // A hardware keyboard's ⌘F opens the search, as in iOS's own apps.
    .keyCommand("f", label: Str.librarySearchTitles, action: openSearch)
    #if DEBUG
      .onAppear(perform: devStart)
    #endif
  }

  /// The field, taking the keyboard: in the bar's place on a phone, beside the controls from `sm` up.
  private func openSearch() {
    if !wideControls(window, typeSize, shellStyle) && !searching { withMotion(Motion.enter) { searching = true } }
    fieldFocused = true
  }

  #if DEBUG
    /// The page as `-dev.browse.*` asks to start it, once (BrowseFixtures.swift).
    private func devStart() {
      guard !devStarted else { return }
      devStarted = true
      if let filters = BrowseFixtures.filters { state.filters = filters }
      if let order = TITLE_ORDERS.first(where: { $0.sort == BrowseFixtures.sort }) { state.apply(order) }
      if let query = BrowseFixtures.query {
        state.query = query
        state.settleNow()
        searching = true
      }
      switch BrowseFixtures.open {
      case "filters", "language": filtering = true
      case "search": searching = true
      default: break
      }
    }
  #endif

  /// The bar: the name and the controls, or on a phone while searching, the field.
  @ViewBuilder private func bar(_ library: Library?, _ offered: TitleFilterOptions?) -> some View {
    let placeholder = library?.kind == LibraryKind.shows ? Str.librarySearchShows : Str.librarySearchMovies
    if wideControls(window, typeSize, shellStyle) {
      TopBar(library?.name) {
        HStack(spacing: Space.s2) {
          DisconnectedAction(libraries, options)
          if offered != nil { TitleFilterButton(active: state.activeFilters) { filtering = true } }
          TitleSortButton(state: state, options: offered)
          field(placeholder, look: .field).frame(width: 288)
        }
        .padding(.trailing, gutter - 4)
      }
    } else if searching {
      // Back out of the search, then the field, as Android's search bar: an x beside the
      // field's own clear button would read as the same thing twice.
      HStack(spacing: Space.s1) {
        RoundIconButton(.arrowLeft, label: Str.libraryClearSearch, look: .ghost, size: 48, iconSize: 24) {
          state.clearQuery()
          fieldFocused = false
          withMotion(Motion.exit) { searching = false }
        }
        // The kit's field, as Android's search bar has it.
        field(placeholder, look: .field)
      }
      .padding(.leading, Space.s1)
      .padding(.trailing, gutter)
      .frame(height: 64)
      .background(PageColor().ignoresSafeArea(edges: .top))
      .transition(.opacity)
    } else {
      TopBar(library?.name) {
        DisconnectedAction(libraries, options)
        RoundIconButton(.search, label: Str.librarySearchTitles, look: .ghost, size: 48, iconSize: 22, action: openSearch)
        if offered != nil { TitleFilterButton(active: state.activeFilters) { filtering = true } }
        TitleSortButton(state: state, options: offered)
      }
    }
  }

  private func field(_ placeholder: String, look: TextFieldLook) -> some View {
    @Bindable var state = state
    return MatineeTextField(placeholder, text: $state.query, kind: .search, focused: $fieldFocused, look: look)
      .submitLabel(.search)
      .autocorrectionDisabled()
      .onSubmit { state.settleNow() }
  }
}

/// The page's background, under a bar of the page's own.
struct PageColor: View {
  @Environment(\.palette) private var palette

  var body: some View { palette.background }
}
