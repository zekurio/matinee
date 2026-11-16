import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Discover.kt, after the web's discover-rails.tsx and rail-grid.tsx: for
 * when there's nothing in mind yet. Rows of titles under the empty search
 * field, as the web's phone has them, in the server's order, each loading
 * on its own, and each row's whole list behind its heading; the popular
 * rows' headings browse their kind instead. Nothing of it shows when the
 * server says Discover is off. A long press on a recommendation offers
 * "Not interested".
 *
 *     DiscoverRows()                       // under the empty search field
 */

/// Discover's rows, for the search page's empty field: one stream follows
/// the cards they show. Rows whose titles are all here already leave
/// nothing to show and stay out; one that failed says so in its place.
struct DiscoverRows: View {
  @State private var discover = Loader<DiscoverRails>()
  @State private var pages = DiscoverPages()
  @Environment(\.actions) private var actions
  @Environment(\.palette) private var palette

  var body: some View {
    Group {
      switch discover.state {
      case .loading: RailSkeleton(title: nil, art: .poster)
      case .failed(_, let disconnected):
        DiscoverFailed(disconnected: disconnected) { discover.reload() }
      case .ready(let answer):
        if answer.enabled {
          let shown = pages.shown(answer.rails, hidden: actions?.hidden.keys ?? [])
          if pages.allEmpty(answer.rails) {
            EmptyState(icon: .compass, title: Str.webDiscoverEmpty, description: Str.webDiscoverEmptyHint)
              .padding(.vertical, Space.s12).frame(maxWidth: .infinity)
          } else if pages.allFailed(answer.rails) {
            DiscoverFailed(disconnected: false) {
              discover.reload()
              pages.reload()
            }
          } else {
            VStack(alignment: .leading, spacing: Space.s6) {
              ForEach(answer.rails, id: \.self) { rail in
                DiscoverRow(rail: rail, page: pages.page(rail), cards: shown[discoverRailKey(rail)] ?? [])
              }
            }
          }
        }
      }
    }
    .loads(discover) { api in try await requestApi(api).discover.rails() }
    .followsRequests(pages.followed(discover.state.value?.rails ?? []))
  }
}

/// The first page of each of Discover's rows, kept for the rows and their one stream.
@Observable final class DiscoverPages {
  private(set) var pages: [String: Loader<CatalogPage>] = [:]

  func page(_ rail: DiscoverRail) -> Loader<CatalogPage> {
    let key = discoverRailKey(rail)
    if let page = pages[key] { return page }
    let page = Loader<CatalogPage>()
    DispatchQueue.main.async { self.pages[key] = page }
    return page
  }

  func reload() { pages.values.forEach { $0.reload() } }

  /// Each row's cards, by its key.
  func shown(_ rails: [DiscoverRail], hidden: Set<String>) -> [String: [CatalogTitleSummary]] {
    return Dictionary(
      rails.compactMap { rail in
        pages[discoverRailKey(rail)]?.state.value.map { (discoverRailKey(rail), discoverRailCards(rail, $0.items, hidden: hidden)) }
      }, uniquingKeysWith: { first, _ in first })
  }

  func allEmpty(_ rails: [DiscoverRail]) -> Bool {
    rails.allSatisfy { pages[discoverRailKey($0)]?.state.value?.items.isEmpty == true }
  }

  func allFailed(_ rails: [DiscoverRail]) -> Bool {
    !rails.isEmpty && rails.allSatisfy { pages[discoverRailKey($0)]?.state.isFailed == true }
  }

  /// The cards the rows show, once each, under the stream's hundred.
  func followed(_ rails: [DiscoverRail]) -> [CatalogInput] {
    rails.flatMap { rail in (pages[discoverRailKey(rail)]?.state.value?.items ?? []).prefix(DISCOVER_RAIL_CARDS) }
      .map { CatalogInput(ref: $0.ref, libraryId: nil) }
  }
}

/// One of Discover's rows: its heading, which leads to the rest, and its cards.
struct DiscoverRow: View {
  let rail: DiscoverRail
  let page: Loader<CatalogPage>
  let cards: [CatalogTitleSummary]
  @Environment(\.navigator) private var nav

  var body: some View {
    let title = discoverRailName(rail)
    Group {
      switch page.state {
      case .loading: RailSkeleton(title: title, art: .poster)
      case .failed(_, let disconnected):
        RailFailed(title: title, retrying: page.refreshing, disconnected: disconnected, onRetry: page.reload)
      case .ready:
        if cards.isEmpty {
          Color.clear.frame(height: 0)
        } else {
          Rail(title, onTitleTap: open) {
            ForEach(cards, id: \.ref) { item in
              RailItem(.poster) {
                CatalogCard(item, detail: discoverReleaseLine(rail.id, item), recommended: discoverRecommends(rail))
              }
            }
          }
        }
      }
    }
    .loads(page) { [rail] api in try await requestApi(api).discover.page(rail: rail, page: 1) }
  }

  private func open() {
    switch discoverRailTarget(rail) {
    case .browse(let kind): nav.catalogBrowse(kind)
    case .rail(let key): nav.discoverRail(key)
    }
  }
}

/// Discover's whole answer couldn't be had: the catalog is down and nothing was kept.
struct DiscoverFailed: View {
  let disconnected: Bool
  let onRetry: () -> Void

  var body: some View {
    ErrorState(Str.discoverFailed, Str.webDiscoverFailedHint, disconnected: disconnected, onRetry: onRetry)
      .frame(maxWidth: .infinity)
      .padding(.vertical, Space.s12)
  }
}

/// One of Discover's rows in full, as a grid that loads more as it
/// scrolls. It follows only the cards around the screen, in blocks, since
/// the stream takes a hundred titles and a row can hold more.
struct DiscoverRailScreen: View {
  let key: String
  @State private var discover = Loader<DiscoverRails>()
  @Environment(\.navigator) private var nav

  var body: some View {
    #if DEBUG
      if key == "_preview" {
        RequestsPreview()
      } else {
        page
      }
    #else
      page
    #endif
  }

  @ViewBuilder private var page: some View {
    let rail = discover.state.value.flatMap { $0.enabled ? $0.rails.first { discoverRailKey($0) == key } : nil }
    Group {
      switch discover.state {
      case .loading: LoadingBox()
      case .failed(_, let disconnected):
        ErrorBox(Str.discoverFailed, Str.webDiscoverFailedHint, disconnected: disconnected, onRetry: discover.reload)
      case .ready:
        if let rail {
          RailGrid(rail: rail)
        } else {
          EmptyState(icon: .compass, title: Str.webDiscoverGone) {
            MatineeButton(Str.webDiscoverBack, look: .outline) { nav.search() }
          }
          .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
    }
    .topBar(rail.map(discoverRailName) ?? Str.webDiscoverTitle)
    .loads(discover) { api in try await requestApi(api).discover.rails() }
  }
}

private struct RailGrid: View {
  let rail: DiscoverRail
  @State private var pages = RequestPages<CatalogTitleSummary> { $0.ref.requestKey }
  @State private var visible: Set<Int> = []
  @Environment(\.api) private var api
  @Environment(\.actions) private var actions
  @Environment(\.palette) private var palette

  var body: some View {
    let hidden = actions?.hidden.keys ?? []
    let items = pages.items.filter { !discoverRecommends(rail) || !hidden.contains($0.ref.key) }
    Group {
      if items.isEmpty, let failure = pages.failure {
        DiscoverFailed(disconnected: failure.isDisconnect, onRetry: pages.more)
      } else if items.isEmpty {
        LoadingBox()
      } else {
        ScrollView {
          VStack(alignment: .leading, spacing: Space.s4) {
            if pages.stale {
              StaleNote(text: Str.webDiscoverStale)
            }
            CardGrid {
              ForEach(Array(items.enumerated()), id: \.element.ref) { index, item in
                CatalogCard(item, detail: discoverReleaseLine(rail.id, item), recommended: discoverRecommends(rail))
                  .onAppear { visible.insert(index) }
                  .onDisappear { visible.remove(index) }
              }
            }
            PageEnd(
              loading: pages.loading, failed: pages.failure != nil, more: pages.nextPage != nil, end: Str.webDiscoverEnd,
              onMore: pages.more)
          }
          .padding(.bottom, Space.s8)
        }
      }
    }
    .onAppear {
      guard let api else { return }
      let data = RequestData(api: requestApi(api))
      let rail = rail
      pages.configure(key: discoverRailKey(rail)) { page in try await data.railBatch(rail, page: page) }
    }
    .followsRequests(
      Array(items[requestFollowWindow(visible: visible, count: items.count)]).map { CatalogInput(ref: $0.ref, libraryId: nil) })
  }
}

/// A line saying the provider couldn't be reached and this is what was kept.
struct StaleNote: View {
  let text: String
  @Environment(\.gutter) private var gutter
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: Space.s2) {
      LucideIcon(.cloudOff, size: 16, tint: palette.mutedForeground)
      Text(text).textStyle(.sm).foregroundStyle(palette.mutedForeground)
    }
    .padding(.horizontal, gutter)
  }
}

#if DEBUG
  /// `-dev.route discover/_preview`: the parts other pages place, on a page
  /// of their own, as they'd sit there: Discover's rows under the empty
  /// search field, "Not here yet" for a search, and a person's catalog
  /// credits. `-requests.query` names the search.
  private struct RequestsPreview: View {
    var body: some View {
      ScrollViewReader { proxy in
        ScrollView {
          VStack(alignment: .leading, spacing: Space.s8) {
            DiscoverRows().id("discover")
            NotHereSection(query: UserDefaults.standard.string(forKey: "requests.query") ?? "the").id("search")
            PersonCatalogCredits(name: "Zendaya").id("person")
          }
          .padding(.bottom, Space.s8)
        }
        // `-requests.scroll search|person`: down to a part.
        .task {
          guard let part = UserDefaults.standard.string(forKey: "requests.scroll") else { return }
          try? await Task.sleep(for: .seconds(4))
          proxy.scrollTo(part, anchor: .top)
        }
      }
      .topBar(Str.webDiscoverTitle)
    }
  }
#endif
