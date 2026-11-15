import MatineeCore
import MatineeKit
import SwiftUI

/*
 * LibraryScreen.kt: a library's titles as posters, with search, a genre
 * filter, and the sort at the end of its bar. Searching puts the field
 * under the bar, where Android swaps the bar for it, so back and the
 * edge swipe stay the system's.
 */

/// A library's titles, with sorting, a genre filter, and search. `sort` is a `TitleSort`, or nil for the library's own.
struct LibraryScreen: View {
  let id: String
  let sort: String?

  @State private var libraries = Loader<[Library]>()
  @State private var filters: LibraryFilters
  @State private var pages = makeTitlePages()
  @State private var searching = false
  @State private var filtering = false
  @State private var fieldFocused = false
  @Environment(\.palette) private var palette

  init(id: String, sort: String?) {
    self.id = id
    self.sort = sort
    _filters = State(initialValue: LibraryFilters(sort: sort))
  }

  var body: some View {
    let library = libraries.state.value?.first { $0.id == id }
    let filters = filters
    let id = id
    let sort = filters.sort
    let genre = filters.genre
    let settled = filters.settled
    PosterGrid(
      pages,
      // The year whatever the order, as the web's cards, so the cards don't change as the person sorts.
      detail: { formatYear($0.year) },
      empty: { GridEmpty(libraryEmptyMessage(library, filters)) }
    ) {
      if let genre {
        LegacyChip(genre, selected: true, trailingIcon: .x) { filters.genre = nil }
          .accessibilityHint(Str.libraryFilter)
          .padding(.bottom, 12)
      }
    }
    .pages(pages, key: filters.key) { api, offset, limit in
      try await api.titles.list(
        libraryId: id, query: settled.isEmpty ? nil : settled, filters: genre.map { TitleFilters(genres: [$0]) }, sort: sort, limit: limit,
        offset: offset)
    }
    .loads(libraries) { api in try await api.libraries.list() }
    .safeAreaInset(edge: .top, spacing: 0) {
      if searching { searchBar(library) }
    }
    .legacyTopBar(library?.name) { actions }
    .sheet(isPresented: $filtering) {
      GenreSheet(libraryId: id, current: genre) { picked in
        filtering = false
        filters.genre = picked
      }
    }
    .background {
      // A hardware keyboard's Cmd-F opens the search, as in iOS's own apps.
      Button(Str.librarySearchTitles, action: openSearch).keyboardShortcut("f").hidden()
    }
  }

  /// Search, a genre filter, and the sort, at the end of the bar.
  @ViewBuilder private var actions: some View {
    @Bindable var filters = filters
    // Search stays while searching, where it puts the keyboard back in the
    // field, so the bar's title doesn't move as the field opens. The labels
    // have words for when an iPad's tabs crowd them into the bar's overflow menu.
    Button(action: openSearch) {
      Label { Text(Str.librarySearchTitles) } icon: { Image(Lucide.search) }
    }
    .tint(palette.foreground)
    Button { filtering = true } label: {
      Label { Text(Str.libraryFilter) } icon: { Image(Lucide.listFilter) }
    }
    // In the accent while a genre filters, as Android tints it.
    .tint(filters.genre != nil ? palette.accent : palette.foreground)
    .accessibilityValue(filters.genre ?? "")
    Menu {
      Picker(Str.librarySort, selection: $filters.sort) {
        ForEach(LIBRARY_SORTS, id: \.self) { value in Text(librarySortLabel(value)).tag(value) }
      }
      .pickerStyle(.inline)
    } label: {
      Label { Text(Str.librarySort) } icon: { Image(Lucide.arrowUpDown) }
    }
    .tint(palette.foreground)
    .accessibilityValue(librarySortLabel(filters.sort))
  }

  /// The field while searching the library, and Cancel, which closes it.
  private func searchBar(_ library: Library?) -> some View {
    @Bindable var filters = filters
    let shows = library?.kind == LibraryKind.shows
    return HStack(spacing: 12) {
      SearchField(
        $filters.query, placeholder: shows ? Str.librarySearchShows : Str.librarySearchMovies,
        focused: $fieldFocused
      )
      .onSubmit(of: .text) { filters.settleNow() }
      Button(Str.commonCancel) {
        filters.clearQuery()
        withMotion(Motion.exit) { searching = false }
      }
      .textStyle(.base)
      .foregroundStyle(palette.accent)
      .frame(minHeight: TouchTarget)
    }
    .padding(.horizontal, Space.gutter)
    .padding(.vertical, 8)
    .background(palette.background)
    .transition(.opacity)
  }

  private func openSearch() {
    withMotion(Motion.enter) { searching = true }
    fieldFocused = true
  }
}

/// The genres the library's titles have, with how many each, and Any genre first.
private struct GenreSheet: View {
  let libraryId: String
  let current: String?
  let onPick: (String?) -> Void
  @State private var genres = Loader<[Facet]>()
  @Environment(\.palette) private var palette

  var body: some View {
    let libraryId = libraryId
    VStack(spacing: 0) {
      LegacySheetHeader(Str.libraryGenre).padding(.top, 12)
      ScrollView {
        LazyVStack(spacing: 0) {
          GenreRow(name: Str.libraryAnyGenre, count: nil, selected: current == nil) { onPick(nil) }
          switch genres.state {
          case .loading:
            ProgressView().tint(palette.accent).padding(24).accessibilityLabel(Str.loadingInProgress)
          case .failed(let message, let disconnected):
            Notice(message, disconnected: disconnected, onRetry: genres.reload).padding(.vertical, 12)
          case .ready(let list):
            ForEach(list, id: \.name) { facet in
              GenreRow(name: facet.name, count: facet.titleCount, selected: current == facet.name) {
                onPick(facet.name)
              }
            }
          }
        }
      }
    }
    .loads(genres) { api in
      #if DEBUG
        if BrowseFixtures.on { return BrowseFixtures.genres }
      #endif
      return try await api.titles.facets(libraryId: libraryId).genres
    }
    .legacySheet()
  }
}

private struct GenreRow: View {
  let name: String
  let count: Int?
  let selected: Bool
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Button(action: action) {
      HStack(spacing: 12) {
        Text(name).textStyle(.base).foregroundStyle(palette.foreground)
          .frame(maxWidth: .infinity, alignment: .leading)
          .multilineTextAlignment(.leading)
        if let count { Text(formatCount(count)).textStyle(.sm).foregroundStyle(palette.mutedForeground) }
        if selected { LucideIcon(.check, size: 18, tint: palette.accent) }
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 14)
      .frame(minHeight: TouchTarget)
      .contentShape(Rectangle())
    }
    .buttonStyle(LegacyRowPress())
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}
