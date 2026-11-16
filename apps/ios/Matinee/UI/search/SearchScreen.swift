import MatineeCore
import MatineeKit
import SwiftUI

/*
 * SearchScreen.kt: search across the server. On an iPad it's the search
 * tab's first page, under the web's page heading, its field taking the
 * keyboard when the tab first opens. On a phone search is the field at the
 * top of Media (media/MediaScreen.swift), which shows what's here the same
 * way: `SearchFound` for text, `SearchSuggestions` for the empty field.
 * What it finds is grouped as Android's: the titles by library, in the
 * order the server ranked them, then cast and crew, genres, and studios,
 * then the catalog's "Not here yet".
 */

/// Search across the server: an iPad's search tab.
struct SearchScreen: View {
  @State private var query = ""
  @State private var search = SearchState()
  @State private var libraries = Loader<[Library]>()
  /// Moves with the keyboard's Search key and Try again, which search without waiting.
  @State private var submitted = 0
  @State private var focusedOnce = false
  @State private var focused = false
  /// The tab opened with the field empty: the keyboard comes once it's known whether Discover is under it.
  @State private var awaitingFocus = false
  /// Whether the server has Discover on, and its rows, for under the empty field.
  @State private var discover = Loader<DiscoverRails>()
  /// The catalog's answer for the text, for "Not here yet" and for whether nothing matched at all.
  @State private var catalog = CatalogSearch()
  @Environment(\.gutter) private var gutter

  var body: some View {
    page.hidesSystemNavigationBar()
      .safeAreaInset(edge: .top, spacing: 0) {
        VStack(alignment: .leading, spacing: 0) {
          PageHeading(Str.searchTitle)
          field.frame(maxWidth: 640, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PageColor())
      }
      .searchEffect(search, query: query, submitted: submitted)
      .catalogSearch(catalog, query: query)
      .loads(libraries) { api in try await api.libraries.list() }
      .loadsDiscover(discover)
      // A hardware keyboard's ⌘F goes to the field, as in iOS's own apps.
      .keyCommand("f", label: Str.searchTitle) { focused = true }
      .onAppear {
        // The field takes the keyboard when the tab first opens, as Android's
        // does while there's no Discover under it to look around in.
        if !focusedOnce, query.isEmpty {
          focusedOnce = true
          awaitingFocus = true
          #if DEBUG
            if let asked = BrowseFixtures.query {
              query = asked
              awaitingFocus = false
            }
          #endif
        }
      }
      // Discover is for looking around, so with it under the field the keyboard waits for a tap.
      .onChange(of: discover.state.isLoading, initial: true) { _, loading in
        guard awaitingFocus, !loading else { return }
        awaitingFocus = false
        if query.isEmpty, discover.state.value?.enabled != true { focused = true }
      }
  }

  /// The field in the search page's pill, with a spinner at its end while a search is out.
  private var field: some View {
    SearchPill(query: $query, focused: $focused, searching: search.searching, submit: submit)
      .padding(.horizontal, gutter)
      .padding(.bottom, Space.s3)
  }

  private func submit() { submitted += 1 }

  @ViewBuilder private var page: some View {
    let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
    Group {
      if text.isEmpty {
        SearchSuggestions(discover: discover)
      } else {
        SearchFound(text: text, search: search, catalog: catalog, libraries: libraries, retry: submit)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  }
}

/// The search field: Android's `SearchBarFrame`, the kit's pill, with a
/// spinner at its end while a search is out, and with `back`, Back in place
/// of its magnifier, as Findroid's while its search is open. The page puts
/// it in place.
struct SearchPill: View {
  @Binding var query: String
  @Binding var focused: Bool
  let searching: Bool
  var back: TextFieldBack?
  let submit: () -> Void
  @Environment(\.palette) private var palette
  @Environment(\.windowSize) private var window
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    MatineeTextField(placeholder, text: $query, kind: .search, focused: $focused, look: .pill, back: back) {
      if searching { Spinner(size: 16, tint: palette.mutedForeground).padding(.trailing, Space.s2) }
    }
    .submitLabel(.search)
    .autocorrectionDisabled()
    .onSubmit(submit)
  }

  /// What search finds, or at the accessibility sizes in a phone's width,
  /// where that won't fit on the field's line, only Search.
  private var placeholder: String {
    typeSize.isAccessibilitySize && window.width < 640 ? Str.searchTitle : Str.searchField
  }
}

/// Under the empty field: Discover's rows when the server has Discover on,
/// for looking around with nothing in mind, each heading opening its Browse;
/// else nothing, as Findroid's and Android's search leave it. The field's
/// placeholder already says what search finds.
struct SearchSuggestions: View {
  let discover: Loader<DiscoverRails>

  var body: some View {
    if discover.state.value?.enabled == true {
      // Interactively: the keyboard follows a drag down, and isn't put away by the rows' own
      // first layout, as `.immediately` does to a field just focused.
      ScrollView { DiscoverRows(discover: discover).padding(.top, Space.s2).padding(.bottom, Space.s6) }
        .scrollDismissesKeyboard(.interactively)
        .scrollsToTopOnReselect()
    } else {
      Color.clear
    }
  }
}

/// What search shows for `text`: the results, grouped; with nothing here,
/// the catalog's titles unheaded, then that nothing matched once the
/// catalog has nothing either; a failure with Try again; or a spinner
/// while the first answer is out. The page runs the searches
/// (`.searchEffect`, `.catalogSearch`).
struct SearchFound: View {
  let text: String
  let search: SearchState
  let catalog: CatalogSearch
  let libraries: Loader<[Library]>
  let retry: () -> Void
  @Environment(\.palette) private var palette
  @Environment(\.gutter) private var gutter

  var body: some View {
    Group {
      if search.failed {
        ErrorState(Str.searchFailedTitle, onRetry: retry)
          .frame(maxWidth: .infinity)
          .padding(.vertical, Space.s12)
      } else if let found = search.results {
        if !found.hasShown && catalog.mayHave {
          // Nothing in the libraries: the catalog's titles follow the field, unheaded, as Android's,
          // with placeholders while it's still out.
          ScrollView { NotHereSection(search: catalog, first: true).padding(.top, Space.s2).padding(.bottom, Space.s6) }
            .scrollDismissesKeyboard(.immediately)
            .scrollsToTopOnReselect()
        } else if !found.hasShown {
          // Only once the catalog has nothing either.
          VStack(spacing: 0) {
            EmptyState(icon: .searchX, title: Str.searchNoMatch(text), description: Str.searchNoMatchHint)
              .padding(.vertical, Space.s8)
            if catalog.failed { ErrorSection(Str.catalogSearchFailed).padding(.horizontal, gutter) }
          }
        } else {
          SearchResultsList(found: found, catalog: catalog, names: names)
            // An answer for older text, while the newer one is out, as the web's placeholder.
            .opacity(search.searching && search.resultsFor != text ? 0.5 : 1)
            .motion(Motion.color, value: search.searching)
        }
      } else {
        Spinner(size: 32, tint: palette.accent)
          .padding(Space.s8)
          .accessibilityLabel(Str.searchSearching)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  }

  private var names: [String: String] {
    Dictionary((libraries.state.value ?? []).map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
  }
}

/// What a search found, in Android's order.
private struct SearchResultsList: View {
  let found: SearchResults
  let catalog: CatalogSearch
  let names: [String: String]
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.gutter) private var gutter

  var body: some View {
    ScrollView {
      // Every heading, grid, and row 20 apart, as Android's one grid of them.
      LazyVStack(alignment: .leading, spacing: Space.s5) {
        ForEach(found.titlesByLibrary(), id: \.libraryId) { group in
          VStack(alignment: .leading, spacing: Space.s5) {
            SectionTitle(names[group.libraryId] ?? Str.searchTitlesHeading, count: group.titles.count)
              .padding(.horizontal, gutter)
            CardGrid {
              ForEach(group.titles, id: \.id) { title in PosterCard(title, detail: formatYear(title.year)) }
            }
          }
        }
        if !found.people.isEmpty {
          Rail(Str.searchSectionCast) {
            ForEach(found.people, id: \.name) { person in
              RailItem(.person) {
                PersonCard(person.name, role: creditKind(person.kind, count: 1), photo: api?.art(person.photo, size: .thumb))
              }
            }
          }
        }
        if !found.genres.isEmpty {
          Facets(title: Str.searchSectionGenres, facets: found.genres) { nav.genre($0) }
        }
        if !found.studios.isEmpty {
          Facets(title: Str.searchSectionStudios, facets: found.studios) { nav.studio($0) }
        }
        // "Not here yet": the catalog's titles for the text that no library here has.
        NotHereSection(search: catalog)
      }
      .padding(.top, Space.s2)
      .padding(.bottom, Space.s6)
    }
    .scrollDismissesKeyboard(.immediately)
    .scrollsToTopOnReselect()
  }
}

/// Genres or studios that matched, as chips that open their page.
private struct Facets: View {
  let title: String
  let facets: [Facet]
  let open: (String) -> Void
  @Environment(\.gutter) private var gutter

  var body: some View {
    VStack(alignment: .leading, spacing: Space.s3) {
      SectionTitle(title)
      FlowRow(spacing: Space.s1_5, lineSpacing: Space.s1_5) {
        ForEach(facets, id: \.name) { facet in Chip(facet.name) { open(facet.name) } }
      }
    }
    .padding(.horizontal, gutter)
  }
}

extension SearchResults {
  /// Something the page lists matched. People on the server match too, but
  /// no page shows them; Android leaves the page blank then, and this one
  /// says nothing matched.
  fileprivate var hasShown: Bool {
    !titles.isEmpty || !people.isEmpty || !genres.isEmpty || !studios.isEmpty
  }
}
