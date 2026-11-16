import MatineeCore
import MatineeKit
import SwiftUI

/*
 * The catalog's parts of other pages: search's "Not here yet", after the
 * web's catalog-search.tsx and Android's SearchScreen.kt, and a person's
 * titles the server doesn't have, after the web's people.$name.tsx. Each
 * loads on its own, so the page's own results never wait for the catalog.
 *
 *     @State private var catalog = CatalogSearch()
 *     … .catalogSearch(catalog, query: query)
 *     NotHereSection(search: catalog, first: libraryFoundNothing)
 *     PersonCatalogCredits(credits: person.catalog, stale: person.stale)
 */

/// The catalog's answer for what's typed, kept by the search page, which
/// needs it twice: for "Not here yet", and to know whether nothing matched
/// at all. It asks once typing pauses, as Android's `CatalogSearchEffect`;
/// a viewer who can't ask gets none (`searchBatch` leaves them out).
@Observable final class CatalogSearch {
  @ObservationIgnored let pages = RequestPages<CatalogTitleSummary> { $0.ref.requestKey }
  /// What's typed now.
  private(set) var wanted = ""
  /// What the catalog was last asked for.
  private(set) var asked: String?

  /// The catalog's answer is for what's typed.
  private var current: Bool { !wanted.isEmpty && asked == wanted }
  var items: [CatalogTitleSummary] { current ? pages.items : [] }
  var failed: Bool { current && pages.failure != nil && pages.items.isEmpty }
  var stale: Bool { current && pages.stale }
  /// Still out for what's typed, or waiting for typing to pause.
  var pending: Bool {
    !wanted.isEmpty && !failed && (!current || (pages.items.isEmpty && (pages.loading || pages.nextPage != nil)))
  }
  /// The catalog has something for what's typed, or may yet.
  var mayHave: Bool { pending || !items.isEmpty }

  fileprivate func want(_ text: String) { wanted = text }

  fileprivate func ask(_ text: String, api: MatineeApi) {
    asked = text
    let data = RequestData(api: api)
    pages.configure(key: text) { page in try await data.searchBatch(text, page: page) }
  }
}

extension View {
  /// Asks the catalog for `query` once typing pauses, into `search`, and
  /// follows its titles' state while the page shows, so they stay live while
  /// their heading is scrolled away.
  func catalogSearch(_ search: CatalogSearch, query: String) -> some View {
    modifier(CatalogSearching(search: search, query: query))
  }
}

private struct CatalogSearching: ViewModifier {
  let search: CatalogSearch
  let query: String
  @Environment(\.api) private var api

  func body(content: Content) -> some View {
    let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
    content
      .task(id: text) {
        search.want(text)
        guard !text.isEmpty, let api else { return }
        try? await Task.sleep(for: .milliseconds(350))
        guard !Task.isCancelled else { return }
        search.ask(text, api: requestApi(api))
      }
      .followsRequests(search.items.map { CatalogInput(ref: $0.ref, libraryId: nil) })
  }
}

/// "Not here yet": titles the catalog found that no library here has,
/// under the library's results with that heading and how many, or first
/// and unheaded when the library found nothing (`first`). A row of
/// placeholders while the catalog is still out; nothing once it has none.
struct NotHereSection: View {
  let search: CatalogSearch
  var first = false
  @Environment(\.gutter) private var gutter
  @Environment(\.palette) private var palette

  var body: some View {
    let items = search.items
    if search.mayHave || search.failed {
      VStack(alignment: .leading, spacing: Space.s3) {
        if !first {
          SectionTitle(Str.webCatalogNotHere, count: items.isEmpty ? nil : items.count)
            .padding(.horizontal, gutter)
        }
        if search.failed {
          ErrorSection(Str.catalogSearchFailed).padding(.horizontal, gutter)
        } else if items.isEmpty {
          NotHereSkeleton()
        } else {
          if search.stale {
            Text(Str.webCatalogSearchStale).textStyle(.sm).foregroundStyle(palette.mutedForeground)
              .padding(.horizontal, gutter)
          }
          CardGrid {
            ForEach(items, id: \.ref) { CatalogCard($0) }
          }
        }
      }
      .accessibilityElement(children: .contain)
      .accessibilityLabel(first ? Str.webCatalogNotHere : "")
    }
  }
}

/// One row of poster placeholders in the grid's columns, as many as fit, as
/// the web's `RowSkeleton`, while the catalog is still out.
private struct NotHereSkeleton: View {
  @Environment(\.windowSize) private var window
  @Environment(\.gutter) private var gutter

  var body: some View {
    // `CardGrid`'s columns: two on a phone, then as many of 176 and up as fit, 16 apart.
    let count = window.width < 640 ? 2 : max(2, Int((window.width - 2 * gutter + Space.s4) / (176 + Space.s4)))
    CardGrid {
      ForEach(0..<count, id: \.self) { _ in
        VStack(alignment: .leading, spacing: 0) {
          Skeleton(radius: Radius.md).aspectRatio(2 / 3, contentMode: .fit)
          Skeleton(radius: Radius.sm).frame(height: 14).padding(.trailing, Space.s8).padding(.top, Space.s2_5)
          Skeleton(radius: Radius.sm).frame(width: 48, height: 12).padding(.top, Space.s2)
        }
      }
    }
    .accessibilityElement()
    .accessibilityLabel(Str.loadingInProgress)
  }
}

/// A person's titles the server doesn't have, under their library titles,
/// as the web's person page has them: "Not here yet" and how many, then the
/// catalog's cards, each with the year and the part. Give it the credits of
/// the kind the page shows. Nothing while there are none.
struct PersonCatalogCredits: View {
  let credits: [PersonCatalogCredit]
  var stale = false
  @State private var visible: Set<Int> = []
  @Environment(\.gutter) private var gutter

  var body: some View {
    Group {
      if !credits.isEmpty {
        VStack(alignment: .leading, spacing: Space.s3) {
          SectionTitle(Str.webCatalogNotHere, count: credits.count).padding(.horizontal, gutter)
          if stale { StaleNote(text: Str.webDiscoverStale) }
          CardGrid {
            ForEach(Array(credits.enumerated()), id: \.element.ref) { index, credit in
              CatalogCard(
                CatalogTitleSummary(
                  ref: credit.ref, name: credit.name, year: credit.year, poster: credit.poster,
                  availability: credit.availability),
                detail: [formatYear(credit.year), credit.role].compactMap(\.self).joined(separator: " · ").nilIfEmpty
              )
              .onAppear { visible.insert(index) }
              .onDisappear { visible.remove(index) }
            }
          }
        }
      }
    }
    // The cards around the screen, in blocks, as Browse follows them.
    .followsRequests(
      Array(credits[requestFollowWindow(visible: visible, count: credits.count)])
        .map { CatalogInput(ref: $0.ref, libraryId: nil) })
  }
}

extension String {
  /// Nil for an empty string, for a line that may have nothing to say.
  fileprivate var nilIfEmpty: String? { isEmpty ? nil : self }
}

#if DEBUG
  /// `-requests.personKind movie|show` and `-requests.scroll catalog` on a
  /// person's page: the kind picked and the catalog credits scrolled to, for
  /// a screenshot of them.
  struct PersonCatalogDevOpen: ViewModifier {
    @Binding var kind: String?
    let proxy: ScrollViewProxy
    @State private var done = false

    func body(content: Content) -> some View {
      content.task {
        guard !done else { return }
        done = true
        if let picked = UserDefaults.standard.string(forKey: "requests.personKind") { kind = picked }
        guard UserDefaults.standard.string(forKey: "requests.scroll") == "catalog" else { return }
        try? await Task.sleep(for: .seconds(1.5))
        proxy.scrollTo("catalog", anchor: .top)
      }
    }
  }
#endif
