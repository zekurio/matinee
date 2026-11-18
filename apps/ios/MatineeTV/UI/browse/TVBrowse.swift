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
  @State private var kinds = BrowseKinds()
  @State private var state = TitleListState()
  @State private var options = Loader<TitleFilterOptions>()
  @State private var pages = TitlePages()
  @State private var memory = TVFocusMemory()
  @State private var filterPage: TVFilterPage?
  @State private var sorting = false
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
          TVButton(browseKindLabel(choice.kind), icon: kindIcon(choice.kind), active: kind == choice.kind) {
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
    .pages(pages, key: "\(kind ?? "")\n\(state.key)") { api, offset, limit in
      let sent = browseFilters(genre: genre, studio: studio, picked: filters)
      let page = try await api.titles.browse(
        kind: kind, filters: sent, sort: sort, order: order, limit: limit, offset: offset)
      await kinds.show(page.kinds)
      return TitleList(items: page.items, total: page.total)
    }
    .loadsFilterOptions(options, kind: kind, genre: genre, studio: studio)
    .tvTitleFilters(
      page: $filterPage, sorting: $sorting, options: options, state: state, kind: kind, own: (genre, studio))
    .tvBrowseFocus(memory, sort: $sortFocused) { firstFocus }
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

private func kindIcon(_ kind: String?) -> Lucide {
  switch kind {
  case TitleKind.movie: .film
  case TitleKind.show: .tv
  default: .libraryBig
  }
}
