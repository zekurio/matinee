import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvBrowse.kt: a genre's or a studio's titles from every library on a TV:
 * its name, "Genre · 12 titles", the choice of movies, shows, or both,
 * always, as Android TV's, the sort and the filters a library has, and the
 * titles as a grid of posters. The page's own genre or studio goes to the
 * server with whatever the person picks (MatineeCore's `browseFilters`);
 * it isn't a filter to take off here, since it's the page.
 */

struct TVBrowseScreen: View {
  let genre: String?
  let studio: String?
  @State private var kind: String?
  @State private var kinds = TVBrowseKinds()
  @State private var state = TitleListState()
  @State private var options = Loader<TitleFilterOptions>()
  @State private var pages = makeTVTitlePages()
  @State private var memory = TVFocusMemory()
  @State private var filterPage: TVFilterPage?
  @State private var sorting = false
  @State private var devStarted = false
  @FocusState private var sortFocused: Bool

  var body: some View {
    let (genre, studio, kind, kinds) = (genre, studio, kind, kinds)
    let (sort, order, filters) = (state.sort, state.order, state.filters)
    let state = state
    TVTitleGrid(
      pages: pages, memory: memory, listKey: "\(kind ?? "")\n\(state.key)", sort: sort, showKind: kind == nil,
      empty: empty
    ) {
      TVGridHeader(
        title: genre ?? studio ?? "",
        detail: [genre != nil ? Str.browseGenre : Str.browseStudio, pages.total.map(Str.browseTitleCount)]
          .compactMap(\.self).joined(separator: "  ·  "),
        chips: activeTitleFilters(filters, options: options.state.value),
        onRemove: { chip in state.filters = chip.removed(from: state.filters) }, onClear: state.clearFilters
      ) {
        // All three always, as Android TV's, whether the page has both kinds or one.
        ForEach(browseKinds(kinds.value), id: \.kind) { choice in
          // The header's count says how many the kind picked has; on every button, five controls
          // wouldn't fit beside the sort in every language.
          TVButton(browseKindText(choice.kind), icon: kindIcon(choice.kind), active: kind == choice.kind) {
            self.kind = choice.kind
          }
          .accessibilityValue(choice.count.map { Str.browseTitleCount($0) } ?? "")
        }
        // Between the kinds and the sort: two groups of controls, not one row of five.
        Spacer().frame(width: TVSpace.s5)
        GridSortAndFilters(
          state: state, sortFocus: $sortFocused, onSort: { sorting = true }, onFilters: { filterPage = .filters })
      }
    }
    .ignoresSafeArea()
    .tvTitlePages(pages, key: "\(kind ?? "")\n\(state.key)") { api, offset, limit in
      var sent = browseFilters(genre: genre, studio: studio, picked: filters)
      #if DEBUG
        // The fixtures' genres and studios aren't the server's: show its titles.
        if BrowseFixtures.on { sent = BrowseFixtures.served(filters) }
      #endif
      let page = try await api.titles.browse(
        kind: kind, filters: sent, sort: sort, order: order, limit: limit, offset: offset)
      await kinds.show(page.kinds)
      #if DEBUG
        if BrowseFixtures.on { return BrowseFixtures.rated(TitleList(items: page.items, total: page.total)) }
      #endif
      return TitleList(items: page.items, total: page.total)
    }
    .tvLoadsFilterOptions(options, kind: kind, genre: genre, studio: studio)
    .tvTitleFilters(
      page: $filterPage, sorting: $sorting, options: options, state: state, kind: kind, own: (genre, studio))
    .tvBrowseFocus(memory, sort: $sortFocused) { firstFocus }
    #if DEBUG
      .onAppear {
        guard !devStarted else { return }
        devStarted = true
        tvBrowseDevStart(state, filterPage: &filterPage, sorting: &sorting)
      }
    #endif
  }

  /// The first poster; with none to show, the sort, so the drawer and the filters are still in reach.
  private var firstFocus: BrowseFocusTarget? {
    if let first = pages.items.first { return .card(row: TVGrid.row, item: first.id) }
    if pages.done || pages.error != nil { return .sort }
    return nil
  }

  private var empty: TVGridEmpty {
    if state.activeFilters > 0 {
      return TVGridEmpty(
        icon: .listFilter, title: Str.browseNoFilterMatch, message: Str.webFiltersNoneHint,
        action: TVNoticeAction(Str.browseClearFilters, icon: .x, action: state.clearFilters))
    }
    return TVGridEmpty(icon: .popcorn, title: genre != nil ? Str.browseGenreEmpty : Str.browseStudioEmpty)
  }
}

/// How many movies and shows the genre or studio has, as the server counted
/// them with the newest page, for the kind buttons.
@Observable final class TVBrowseKinds {
  private(set) var value: BrowsedTitles.Kinds?

  func show(_ kinds: BrowsedTitles.Kinds) { if value != kinds { value = kinds } }
}

private func kindIcon(_ kind: String?) -> Lucide {
  switch kind {
  case TitleKind.movie: .film
  case TitleKind.show: .tv
  default: .libraryBig
  }
}

/// A kind's name on a genre's or studio's page: all, movies, or shows.
private func browseKindText(_ kind: String?) -> String {
  switch kind {
  case TitleKind.movie: Str.browseKindMovie
  case TitleKind.show: Str.browseKindShow
  default: Str.browseKindAll
  }
}
