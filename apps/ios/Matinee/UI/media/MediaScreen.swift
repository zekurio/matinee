import MatineeCore
import MatineeKit
import SwiftUI

/*
 * MediaScreen.kt, after the web's media.tsx and Findroid's MediaScreen.kt:
 * the Media tab, every library as a card, which opens the library. On a
 * phone, search lives here, as in Findroid: the page's top is only the
 * wide search field. Tapped, it opens search, with Discover's rows under
 * it while nothing's typed; typing searches the server, its results as
 * the search page shows them (search/SearchScreen.swift); Back, in place
 * of the field's magnifier while search is open, goes back to the
 * libraries. What shows for the field's state
 * is MatineeCore's `MediaSearch`. On an iPad, where search has a tab of
 * its own, it's the libraries under the web's page heading.
 */

/// The Media tab: every library as a card, and on a phone the search field over them.
struct MediaScreen: View {
  @Environment(\.shellStyle) private var style

  var body: some View {
    if style == .tablet {
      TabletMediaPage()
    } else {
      PhoneMediaPage()
    }
  }
}

/// A phone's Media: the search field at the top, and under it the libraries,
/// Discover's rows, or what a search found.
private struct PhoneMediaPage: View {
  @State private var libraries = Loader<[Library]>()
  @State private var field = MediaSearch()
  @State private var focused = false
  @State private var search = SearchState()
  /// Moves with the keyboard's Search key and Try again, which search without waiting.
  @State private var submitted = 0
  /// Whether the server has Discover on, and its rows, for under the empty field.
  @State private var discover = Loader<DiscoverRails>()
  /// The catalog's answer for the text, for "Not here yet" and for whether nothing matched at all.
  @State private var catalog = CatalogSearch()
  @State private var devStarted = false
  /// Search was asked for and the field is to take the keyboard once it can.
  @State private var focusWanted = false
  @Environment(ShellNav.self) private var nav
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.gutter) private var gutter

  var body: some View {
    page
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      .safeAreaInset(edge: .top, spacing: 0) { top }
      .hidesSystemNavigationBar()
      .loads(libraries) { api in try await api.libraries.list() }
      .searchEffect(search, query: field.query, submitted: submitted)
      .catalogSearch(catalog, query: field.query)
      .loadsDiscover(discover)
      // A hardware keyboard's ⌘F goes to the field, as in iOS's own apps.
      .keyCommand("f", label: Str.searchTitle, action: focus)
      .onChange(of: focused) { _, now in if now { withMotion(Motion.move) { field.begin() } } }
      // Home's search button, or a link to search: the field takes the keyboard.
      .onChange(of: nav.searchPending, initial: true) { _, pending in if pending { takeSearch() } }
      .onChange(of: scenePhase) { appCameForward() }
    #if DEBUG
      .onAppear(perform: devStart)
    #endif
  }

  /// The field, full width, with Back in place of its magnifier while
  /// search is open, as Findroid's, and the cloud after it while the
  /// libraries from before show and the server can't be reached.
  private var top: some View {
    HStack(spacing: Space.s2) {
      SearchPill(query: query, focused: $focused, searching: search.searching, back: back, submit: submit)
      if !field.open { DisconnectedAction(libraries) }
    }
    .padding(.horizontal, gutter)
    .padding(.top, Space.s2)
    .padding(.bottom, Space.s3)
    .background(PageColor().ignoresSafeArea(edges: .top))
  }

  /// Back out of search to the libraries, while search is open.
  private var back: TextFieldBack? {
    field.open ? TextFieldBack(Str.commonBack, action: cancel) : nil
  }

  private var query: Binding<String> {
    Binding(get: { field.query }, set: { field.type($0) })
  }

  @ViewBuilder private var page: some View {
    switch field.content {
    case .libraries: librariesPage
    case .suggestions: SearchSuggestions(discover: discover)
    case .results(let text):
      SearchFound(text: text, search: search, catalog: catalog, libraries: libraries, retry: submit)
    }
  }

  @ViewBuilder private var librariesPage: some View {
    switch libraries.state {
    case .loading: LoadingBox()
    case .failed(let message, let disconnected):
      ErrorBox(Str.homeLoadFailed, message, disconnected: disconnected, onRetry: libraries.reload)
    case .ready(let list):
      ScrollView {
        if list.isEmpty {
          NoLibrariesNote()
        } else {
          LibraryGrid { ForEach(list, id: \.id) { library in LibraryCard(library: library) } }
            .padding(.top, Space.s1)
        }
      }
      .scrollsToTopOnReselect()
      .refreshable { await refresh() }
    }
  }

  private func refresh() async {
    libraries.reload()
    await libraries.settled()
  }

  private func submit() { submitted += 1 }

  private func focus() { focused = true }

  /// Search asked for from elsewhere, once: open, the field focused. The
  /// focus waits for the tab to be up and the app in front, as a field
  /// can't take it before: Media's is made in this very update when Home's
  /// search button opens the tab the first time, and a link opens it as
  /// the app launches.
  private func takeSearch() {
    nav.searchPending = false
    field.begin()
    focusWanted = true
    if scenePhase == .active { Task { await focusSoon() } }
  }

  private func appCameForward() {
    if scenePhase == .active, focusWanted { Task { await focusSoon() } }
  }

  private func focusSoon() async {
    try? await Task.sleep(for: .milliseconds(250))
    guard focusWanted else { return }
    focusWanted = false
    focused = true
  }

  /// Back to the libraries: the text gone, the keyboard down.
  private func cancel() {
    focusWanted = false
    focused = false
    withMotion(Motion.move) { field.cancel() }
  }

  #if DEBUG
    /// `-dev.browse.query TEXT`: the field starts with that text, searched.
    private func devStart() {
      guard !devStarted else { return }
      devStarted = true
      if let asked = BrowseFixtures.query { field = MediaSearch(query: asked) }
    }
  #endif
}

/// An iPad's Media: the web's page heading over the libraries.
private struct TabletMediaPage: View {
  @State private var libraries = Loader<[Library]>()

  var body: some View {
    page
      .hidesSystemNavigationBar()
      .loads(libraries) { api in try await api.libraries.list() }
  }

  @ViewBuilder private var page: some View {
    switch libraries.state {
    case .loading:
      // A spinner, as Android's, under the page's heading.
      VStack(spacing: 0) {
        heading
        LoadingBox()
      }
    case .failed(let message, let disconnected):
      ErrorBox(Str.homeLoadFailed, message, disconnected: disconnected, onRetry: libraries.reload)
    case .ready(let list):
      ScrollView {
        heading
        if list.isEmpty {
          NoLibrariesNote()
        } else {
          LibraryGrid { ForEach(list, id: \.id) { library in LibraryCard(library: library) } }
        }
      }
      .scrollsToTopOnReselect()
      .refreshable { await refresh() }
    }
  }

  private func refresh() async {
    libraries.reload()
    await libraries.settled()
  }

  /// The page's name, where no bar carries it: the web's heading, the cloud at its end.
  private var heading: some View {
    PageHeading(Str.tabMedia) { DisconnectedAction(libraries) }
  }
}

/// Library cards as wide as fit at 160 or more on a phone, 288 from the
/// web's `sm` up, as its `libraryGrid`; a whole row each at the largest
/// text sizes, where a name over the art needs the width.
private struct LibraryGrid<Content: View>: View {
  @ViewBuilder let content: () -> Content
  @Environment(\.windowSize) private var window
  @Environment(\.gutter) private var gutter
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    let wide = window.width >= 640
    let minimum: CGFloat = typeSize.isAccessibilitySize ? 280 : wide ? 288 : 160
    LazyVGrid(
      columns: [GridItem(.adaptive(minimum: minimum), spacing: wide ? Space.s6 : Space.s4, alignment: .top)],
      alignment: .leading, spacing: wide ? Space.s8 : Space.s5, content: content
    )
    .padding(.horizontal, gutter)
    .padding(.bottom, Space.s6)
  }
}

/// A library as the backdrop the server picked for it today, with its name
/// across it, as Jellyfin shows one, and how many titles it holds below.
private struct LibraryCard: View {
  let library: Library
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette
  @Environment(\.windowSize) private var window
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    let art = api?.art(library.backdrop, size: .medium)
    // Android's `headlineSmall` in a phone's two columns, the web's `text-2xl` with room.
    let roomy = window.width >= 640 || typeSize.isAccessibilitySize
    let icon: CGFloat = roomy ? 28 : 20
    let inset = roomy ? Space.s3 : Space.s2_5
    Pressable(shape: .kit(Radius.md), action: { nav.library(library.id, nil) }) {
      VStack(alignment: .leading, spacing: Space.s2) {
        ArtFrame(library.id, aspect: 16 / 9) {
          if let art {
            Picture(art)
            Color.black.opacity(0.35)
          } else {
            LucideIcon(library.kind == LibraryKind.shows ? .tv : .film, size: icon, tint: palette.mutedForeground)
              .padding(inset)
              .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
          }
          // Big enough to read across the room: white over the backdrop, as the web's; the
          // theme's text over the tone in its place, which here follows the theme, kept clear
          // of the icon in the corner.
          Text(library.name)
            .textStyle(roomy ? .xl2 : .px22, weight: .bold, tracking: .tight)
            .foregroundStyle(art != nil ? .white : palette.foreground.opacity(0.85))
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .keepsWordsWhole(library.name, roomy ? .xl2 : .px22, weight: .bold, tracking: .tight, alignment: .center)
            .shadow(color: .black.opacity(art != nil ? 0.6 : 0), radius: 6, y: 1)
            .padding(.horizontal, art != nil ? Space.s3 : icon + inset + Space.s1)
        }
        Text(Str.browseTitleCount(library.titleCount))
          .textStyle(.px13)
          .foregroundStyle(palette.mutedForeground)
          .lineLimit(1)
      }
      .contentShape(Rectangle())
    }
    .accessibilityElement(children: .combine)
  }
}
