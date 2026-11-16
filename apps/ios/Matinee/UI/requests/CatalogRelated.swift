import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Related.kt, for a catalog title's page: the rows under it, as the web's
 * related-rails.tsx has them, the rest of the film series it belongs to
 * and more like it. Titles already here are the library's cards; the rest
 * are catalog cards, with what the stream says now, and one that arrives
 * while on screen turns into the library's card in place. (A library
 * title's related rows are title/Related.swift's.)
 */

/// The rows and each row's titles, kept for the page so its one stream
/// follows the titles in them.
@Observable final class RelatedLoads {
  let rails = Loader<RelatedRails>()
  private(set) var pages: [String: Loader<RelatedPage>] = [:]

  func page(_ id: String) -> Loader<RelatedPage> {
    if let page = pages[id] { return page }
    let page = Loader<RelatedPage>()
    // Made while the rows draw; kept without telling them, as nothing they show changed yet.
    DispatchQueue.main.async { self.pages[id] = page }
    return page
  }

  func reload() {
    rails.reload()
    pages.values.forEach { $0.reload() }
  }

  /// The titles the rows show that aren't here. Empty until every row has
  /// loaded, so the stream opens again once rather than once a row.
  var followed: [CatalogInput] {
    guard let rails = rails.state.value?.rails, !rails.isEmpty else { return [] }
    let loaded = rails.compactMap { pages[$0.id]?.state }
    guard loaded.count == rails.count, !loaded.contains(where: \.isLoading) else { return [] }
    return loaded.flatMap { $0.value?.items ?? [] }.filter { $0.availability.state != "here" }
      .map { CatalogInput(ref: $0.ref, libraryId: nil) }
  }
}

/// The related rows, for the catalog page. A row with nothing in it stays
/// out; a list of rows that didn't load leaves no gap, as the page is whole without it.
struct CatalogRelatedRows: View {
  let ref: CatalogRef
  let library: String?
  let loads: RelatedLoads
  @Environment(\.gutter) private var gutter
  @Environment(\.palette) private var palette

  var body: some View {
    Group {
      switch loads.rails.state {
      case .loading: RailSkeleton(title: nil, art: .poster)
      case .failed: Color.clear.frame(height: 0)
      case .ready(let value):
        VStack(alignment: .leading, spacing: Space.s6) {
          let stale = value.stale || loads.pages.values.contains { $0.state.value?.stale == true }
          if stale && !value.rails.isEmpty {
            Text(Str.webCatalogRelatedStale).textStyle(.sm).foregroundStyle(palette.mutedForeground)
              .padding(.horizontal, gutter)
          }
          ForEach(value.rails, id: \.id) { rail in
            CatalogRelatedRow(rail: rail, ref: ref, library: library, page: loads.page(rail.id))
          }
        }
      }
    }
    .loads(loads.rails) { [ref, library] api in
      try await requestApi(api).catalog.related(catalogInput: CatalogInput(ref: ref, libraryId: library))
    }
  }
}

private struct CatalogRelatedRow: View {
  let rail: RelatedRail
  let ref: CatalogRef
  let library: String?
  let page: Loader<RelatedPage>

  var body: some View {
    let name = relatedRailName(rail) ?? Str.webCatalogRelatedMoreLikeThis
    Group {
      switch page.state {
      case .loading: RailSkeleton(title: name, art: .poster)
      case .failed(_, let disconnected):
        RailFailed(title: name, retrying: page.refreshing, disconnected: disconnected, onRetry: page.reload)
      case .ready(let loaded):
        if loaded.items.isEmpty {
          Color.clear.frame(height: 0)
        } else {
          Rail(name) {
            ForEach(loaded.items, id: \.ref) { item in
              RailItem(.poster) { RelatedTitleCard(item: item) }
            }
          }
        }
      }
    }
    .loads(page) { [ref, library, id = rail.id] api in
      try await requestApi(api).catalog.relatedTitles(ref: ref, rail: id, libraryId: library)
    }
  }
}

/// A related title: the library's card when the viewer can watch it, else
/// the catalog card. A library title's related rows can place it too.
struct RelatedTitleCard: View {
  let item: RelatedTitle
  @Environment(\.requests) private var hub

  var body: some View {
    let availability = hub?.availability(item.ref, item.availability) ?? item.availability
    if let library = browseLibraryTitle(item.title, availability) {
      PosterCard(library, detail: formatYear(library.year))
    } else {
      CatalogCard(CatalogTitleSummary(ref: item.ref, name: item.name, year: item.year, poster: item.poster, availability: item.availability))
    }
  }
}
