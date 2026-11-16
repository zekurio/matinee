import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Related.kt, for a library title's page: the rows of titles related to
 * it, as the server works them out from the title at its provider: the
 * rest of its film series, and more like it. Android and the web show
 * these on a catalog title's page; a library title gets them too once it's
 * matched (`titleCatalogRef`). A title the viewer can watch is the
 * library's card; the rest show the server's state for them.
 *
 * The catalog title's page, where those open on Android, is the requests
 * screens' (requests/CatalogScreen.swift): a catalog card opens it through
 * `openCatalogTitle`.
 */

/// The rows related to `title`, each loading on its own. Nothing until the
/// title is matched, and nothing for a list of rows that didn't load: the
/// page is whole without them.
struct TitleRelatedRows: View {
  let title: Title
  @State private var rails = Loader<RelatedRails>()

  var body: some View {
    if let ref = titleCatalogRef(title) {
      Group {
        if let list = rails.state.value?.rails, !list.isEmpty {
          VStack(alignment: .leading, spacing: Space.s6) {
            ForEach(list, id: \.id) { rail in
              RelatedRow(rail: rail, ref: ref, libraryId: title.libraryId)
            }
          }
        } else {
          // Something to show, so the rows load.
          Color.clear.frame(height: 0)
        }
      }
      .loads(rails) { [ref, libraryId = title.libraryId] api in
        try await api.catalog.related(catalogInput: CatalogInput(ref: ref, libraryId: libraryId))
      }
    }
  }
}

/// One related row: its titles once they load, gone when it has none.
private struct RelatedRow: View {
  let rail: RelatedRail
  let ref: CatalogRef
  let libraryId: String
  @State private var page = Loader<RelatedPage>()

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
              RailItem(.poster) { RelatedCard(item: item) }
            }
          }
        }
      }
    }
    .loads(page) { [ref, libraryId, id = rail.id] api in
      try await api.catalog.relatedTitles(ref: ref, rail: id, libraryId: libraryId)
    }
  }
}

/// Opens the catalog page of a title the server doesn't have, as a catalog
/// card does on Android (`CatalogRoute`).
@MainActor func openCatalogTitle(_ ref: CatalogRef, name: String, nav: Navigator) { nav.catalog(ref, nil) }

/// A related title: the library's card when the viewer can watch it, else
/// its poster with the server's state for it, in the corner and under its name.
private struct RelatedCard: View {
  let item: RelatedTitle
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette

  var body: some View {
    if let library = relatedLibraryTitle(item) {
      PosterCard(library, detail: formatYear(library.year))
    } else {
      let line = item.availability.stateWord(today: todayDay(), percent: true).map(requestStateText) ?? formatYear(item.year)
      Pressable(shape: .kit(Radius.md), wash: false, action: { openCatalogTitle(item.ref, name: item.name, nav: nav) }) {
        VStack(alignment: .leading, spacing: 0) {
          PosterArt(name: item.name, poster: api?.art(item.poster))
            .overlay(alignment: .topTrailing) {
              if let badge = item.availability.badge { RequestStateBadge(badge: badge).padding(Space.s1_5) }
            }
          CardText(item.name, line)
        }
      }
      .accessibilityElement(children: .combine)
    }
  }
}
