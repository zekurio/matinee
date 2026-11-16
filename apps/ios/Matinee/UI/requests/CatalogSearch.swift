import MatineeCore
import MatineeKit
import SwiftUI

/*
 * The catalog's parts of other pages, each a view of its own so placing
 * it is one line: search's "Not here yet", after the web's
 * catalog-search.tsx and Android's SearchScreen.kt, and a person's titles
 * the server doesn't have, after Android's PersonScreen. Each loads on its
 * own, so the page's own results never wait for the catalog, and follows
 * its cards' state while it shows.
 *
 *     NotHereSection(query: query, first: libraryFoundNothing)
 *     PersonCatalogCredits(name: name, tmdbId: tmdbId)
 */

/// "Not here yet": titles the catalog found for `query` that no library
/// here has, under the library's results with that heading, or without it
/// when the library found nothing (`first`). A viewer who can't ask gets
/// none. It waits a moment after the last key before asking.
struct NotHereSection: View {
  let query: String
  var first = false
  @State private var results = RequestPages<CatalogTitleSummary> { $0.ref.requestKey }
  @Environment(\.api) private var api
  @Environment(\.gutter) private var gutter
  @Environment(\.palette) private var palette

  var body: some View {
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
    let items = results.items
    Group {
      if needle.isEmpty || (!results.loading && results.failure == nil && items.isEmpty && results.nextPage == nil) {
        Color.clear.frame(height: 0)
      } else {
        VStack(alignment: .leading, spacing: Space.s3) {
          if !first {
            HStack(alignment: .firstTextBaseline, spacing: Space.s2) {
              SectionTitle(Str.webCatalogNotHere)
              if !items.isEmpty {
                Text(Str.browseTitleCount(items.count)).textStyle(.sm).foregroundStyle(palette.mutedForeground)
              }
            }
            .padding(.horizontal, gutter)
          }
          if results.failure != nil && items.isEmpty {
            Text(Str.webCatalogSearchFailed).textStyle(.sm).foregroundStyle(palette.mutedForeground)
              .padding(.horizontal, gutter)
          } else if items.isEmpty {
            RailSkeleton(title: nil, art: .poster)
          } else {
            if results.stale {
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
    .task(id: needle) {
      guard !needle.isEmpty, let api else { return }
      try? await Task.sleep(for: .milliseconds(350))
      guard !Task.isCancelled else { return }
      let data = RequestData(api: requestApi(api))
      results.configure(key: needle) { page in try await data.searchBatch(needle, page: page) }
    }
    .followsRequests(needle.isEmpty ? [] : items.map { CatalogInput(ref: $0.ref, libraryId: nil) })
  }
}

/// A person's titles the server doesn't have, under their library titles,
/// as Android's person page has them: "Not here yet" and how many, then
/// the catalog's cards in the page's grid, each with the part. Nothing
/// while there are none.
struct PersonCatalogCredits: View {
  let name: String
  var tmdbId: String?
  @State private var credits = Loader<[PersonCatalogCredit]>()
  @State private var visible: Set<Int> = []
  @Environment(\.gutter) private var gutter
  @Environment(\.palette) private var palette

  init(name: String, tmdbId: String? = nil) {
    self.name = name
    self.tmdbId = tmdbId
  }

  var body: some View {
    let items = credits.state.value ?? []
    Group {
      if items.isEmpty {
        Color.clear.frame(height: 0)
      } else {
        VStack(alignment: .leading, spacing: Space.s3) {
          HStack(alignment: .firstTextBaseline, spacing: Space.s2) {
            SectionTitle(Str.webCatalogNotHere)
            Text(Str.browseTitleCount(items.count)).textStyle(.sm).foregroundStyle(palette.mutedForeground)
          }
          .padding(.horizontal, gutter)
          CardGrid {
            ForEach(Array(items.enumerated()), id: \.element.ref) { index, credit in
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
    .loads(credits) { [name, tmdbId] api in try await RequestData(api: requestApi(api)).personCredits(name: name, tmdbId: tmdbId) }
    // The cards around the screen, in blocks, as Browse follows them.
    .followsRequests(
      Array(items[requestFollowWindow(visible: visible, count: items.count)]).map { CatalogInput(ref: $0.ref, libraryId: nil) })
  }
}

extension String {
  /// Nil for an empty string, for a line that may have nothing to say.
  fileprivate var nilIfEmpty: String? { isEmpty ? nil : self }
}
