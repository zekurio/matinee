import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvSearch.kt: search on a TV. The field at the top, which opens the
 * system's keyboard on Select, and the results under it as rows in the
 * phone's order: the titles of each library, in the order the server
 * ranked them, cast and crew, genres, and studios. The focused result's
 * name and facts sit between them, its backdrop behind the page, and
 * whichever row takes focus scrolls up under them. With no text, only the
 * field. The search itself, waiting for typing to pause and cancelling the
 * one still out, is MatineeCore's `SearchState` (Browse/SearchData.swift).
 */

/// Row keys, for focus memory and the pinned scroll.
private enum SearchRow {
  static func library(_ id: String) -> String { "lib-\(id)" }
  static let people = "people"
  static let genres = "genres"
  static let studios = "studios"
}

/// How wide the field grows, Android TV's 640 dp less the room its keyboard row would need.
private let FIELD_WIDTH: CGFloat = 1120
/// The field and the focused result's line above the rows.
private let HEADER_HEIGHT: CGFloat =
  TVOverscan.vertical + TVButtons.height + TVSpace.s5 + TVFocusLineHeight + TVSpace.s5

struct TVSearchScreen: View {
  @State private var query = ""
  @State private var search = SearchState()
  @State private var libraries = Loader<[Library]>()
  @State private var memory = TVFocusMemory()
  @State private var focused: FocusedItem?
  /// Moves with the keyboard's Search key and Try again, which search without waiting.
  @State private var submitted = 0
  @FocusState private var fieldFocused: Bool
  @FocusedValue(\.tvBrowseFocused) private var focusedNow
  @Environment(\.palette) private var palette

  var body: some View {
    let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
    ZStack(alignment: .topLeading) {
      TVBackdrop(!text.isEmpty && focused?.backdrop.isEmpty == false ? focused?.backdrop : nil) { sources in
        Picture(sources, alignment: .topTrailing)
      }
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: TVSpace.s5) {
          TVSearchField(text: $query, placeholder: Str.searchField, focus: $fieldFocused) { submitted += 1 }
            .frame(maxWidth: FIELD_WIDTH)
          if search.searching, search.results != nil {
            Text(Str.searchSearching).textStyle(.caption).foregroundStyle(palette.mutedForeground)
              .transition(.opacity)
          }
        }
        .animation(Motion.color, value: search.searching)
        .padding(.trailing, TVPage.end + TVGrid.clockRoom)
        .padding(.top, TVOverscan.vertical)
        if !text.isEmpty {
          TVFocusLine(focused?.info).padding(.top, TVSpace.s5).padding(.trailing, TVPage.end)
        }
      }
      .padding(.leading, TVPage.start)
      .focusSection()
      results(text).padding(.top, HEADER_HEIGHT)
    }
    .ignoresSafeArea()
    .loads(libraries) { api in try await api.libraries.list() }
    .searchEffect(search, query: query, submitted: submitted)
    // A new query's results replace what was focused in the last.
    .onChange(of: text) { focused = nil }
    .onChange(of: focusedNow) { _, item in if let item { focused = item } }
    // The page's focus, when the focus engine looks for one, is the field.
    .defaultFocus($fieldFocused, true)
    .tvBrowseFocus(memory, field: $fieldFocused) { .field }
  }

  @ViewBuilder private func results(_ text: String) -> some View {
    if text.isEmpty {
      // The field's placeholder already says what search finds.
      EmptyView()
    } else if search.failed {
      GridNotice(
        icon: .cloudOff, headline: Str.searchFailedTitle, message: Str.searchFailed,
        action: TVNoticeAction(Str.commonRetry, icon: .refreshCw) { submitted += 1 }
      )
      .inSearch
    } else if let found = search.results {
      if !found.hasShown {
        GridNotice(icon: .searchX, headline: Str.searchNoMatch(text), message: Str.searchNoMatchHint).inSearch
      } else {
        TVPinnedRows(memory: memory) { SearchRows(found: found, names: names, memory: memory) }
          // An answer for older text, while the newer one is out.
          .opacity(search.searching && search.resultsFor != text ? 0.5 : 1)
          .animation(Motion.color, value: search.searching)
      }
    } else {
      TVLoadingRow().accessibilityLabel(Str.searchSearching)
    }
  }

  private var names: [String: String] {
    Dictionary((libraries.state.value ?? []).map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
  }
}

extension SearchResults {
  /// Something the page lists matched. People on the server match too, but no page shows them.
  fileprivate var hasShown: Bool {
    !titles.isEmpty || !people.isEmpty || !genres.isEmpty || !studios.isEmpty
  }
}

extension GridNotice {
  /// In place of the results, from the page's edge.
  fileprivate var inSearch: some View {
    padding(.leading, TVPage.start).padding(.trailing, TVPage.end).padding(.top, TVSpace.s6)
  }
}

/// What a search found, as rows in Android's order.
private struct SearchRows: View {
  let found: SearchResults
  let names: [String: String]
  let memory: TVFocusMemory
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.tvActions) private var actions
  @Environment(\.snackbar) private var snackbar
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    ForEach(found.titlesByLibrary(), id: \.libraryId) { group in
      let heading = names[group.libraryId] ?? Str.searchTitlesHeading
      TVRow(
        "\(heading)  ·  \(Str.browseTitleCount(group.titles.count))", key: SearchRow.library(group.libraryId),
        items: group.titles, itemKey: \.id, memory: memory
      ) { title in poster(title) }
    }
    if !found.people.isEmpty {
      TVRow(Str.searchSectionCast, key: SearchRow.people, items: found.people, itemKey: \.name, memory: memory) {
        person in
        TVPersonCard(person.name, role: titleCreditLabel(person.kind, count: 1), action: { nav.person(person.name, nil) }) {
          Picture(api?.art(person.photo, size: .thumb))
        }
        .focusedValue(\.tvBrowseFocused, personInfo(person))
      }
    }
    facetRow(SearchRow.genres, title: Str.searchSectionGenres, facets: found.genres, label: genreName) { nav.genre($0) }
    facetRow(SearchRow.studios, title: Str.searchSectionStudios, facets: found.studios) { nav.studio($0) }
  }

  private func poster(_ title: TitleSummary) -> some View {
    let target = TVActionTarget.title(title)
    return TVPosterCard(
      title.name, watched: viewer?.isWatched(title) ?? title.watched, action: { nav.title(title) },
      onLongPress: { actions?.open(target) },
      onPlayPause: { actions?.play(target, api: api, viewer: viewer, nav: nav, snackbar: snackbar) }
    ) {
      Picture(api?.art(title.images.poster))
    }
    .focusedValue(\.tvBrowseFocused, browseTitleInfo(title, api: api, showKind: true))
  }

  /// Genres or studios as a row of buttons, each opening its titles.
  @ViewBuilder private func facetRow(
    _ key: String, title: String, facets: [Facet], label: @escaping (String) -> String = { $0 },
    open: @escaping (String) -> Void
  ) -> some View {
    if !facets.isEmpty {
      TVRow(title, key: key, items: facets, itemKey: \.name, memory: memory, spacing: TVButtons.gap) { facet in
        TVButton(label(facet.name), detail: formatCount(facet.titleCount)) { open(facet.name) }
          .focusedValue(\.tvBrowseFocused, facetInfo(facet, name: label(facet.name)))
      }
    }
  }

  private func personInfo(_ person: PersonSummary) -> FocusedItem {
    FocusedItem(
      key: "person/\(person.name)",
      info: TVItemInfo(name: person.name, facts: [titleCreditLabel(person.kind, count: 1), Str.browseTitleCount(person.titleCount)]),
      logo: nil, backdrop: [])
  }

  private func facetInfo(_ facet: Facet, name: String) -> FocusedItem {
    FocusedItem(
      key: "facet/\(facet.name)", info: TVItemInfo(name: name, facts: [Str.browseTitleCount(facet.titleCount)]),
      logo: nil, backdrop: [])
  }
}
