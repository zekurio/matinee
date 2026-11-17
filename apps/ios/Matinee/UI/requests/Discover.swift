import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Discover.kt, after the web's discover-rails.tsx: for when there's
 * nothing in mind yet. Rows of titles under the empty search field, as
 * the web's phone has them, in the server's order, each loading on its
 * own. Each row but "Because you watched" is the start of a browse, which
 * its heading opens with the row's filters and sort (CatalogBrowse.swift).
 * Nothing of it shows when the server says Discover is off. A long press
 * on a recommendation offers "Not interested".
 *
 *     DiscoverRows(discover: discover)     // under the empty search field
 */

/// Discover's rows, for the search page's empty field: one stream follows
/// the cards they show. Rows whose titles are all here already leave
/// nothing to show and stay out; one that failed says so in its place.
/// `discover` is the page's answer to whether Discover is on, which it
/// loads with `loadsDiscover`: search needs it too, to leave the keyboard down.
struct DiscoverRows: View {
  let discover: Loader<DiscoverRails>
  @State private var pages = DiscoverPages()
  @Environment(\.actions) private var actions

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
                DiscoverRailRow(rail: rail, page: pages.page(rail), cards: shown[discoverRailKey(rail)] ?? [])
              }
            }
          }
        }
      }
    }
    .followsRequests(pages.followed(discover.state.value?.rails ?? []))
  }
}

extension View {
  /// Loads whether Discover is on and its rows into `loader`, for a page that
  /// hands it to `DiscoverRows`.
  func loadsDiscover(_ loader: Loader<DiscoverRails>) -> some View {
    loads(loader) { api in try await api.discover.rails() }
  }
}

/// Each of Discover's rows' cards, kept for the rows and their one stream.
@Observable final class DiscoverPages {
  private(set) var pages: [String: Loader<DiscoverRow>] = [:]

  func page(_ rail: DiscoverRail) -> Loader<DiscoverRow> {
    let key = discoverRailKey(rail)
    if let page = pages[key] { return page }
    let page = Loader<DiscoverRow>()
    DispatchQueue.main.async { self.pages[key] = page }
    return page
  }

  func reload() { pages.values.forEach { $0.reload() } }

  /// Each row's cards, by its key.
  func shown(_ rails: [DiscoverRail], hidden: Set<String>) -> [String: [CatalogBrowseTitle]] {
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

  /// The catalog cards the rows show, once each, under the stream's hundred.
  func followed(_ rails: [DiscoverRail]) -> [CatalogInput] {
    discoverRailFollowed(rails.compactMap { pages[discoverRailKey($0)]?.state.value })
  }
}

/// One of Discover's rows: its heading, which opens its browse, and its cards.
struct DiscoverRailRow: View {
  let rail: DiscoverRail
  let page: Loader<DiscoverRow>
  let cards: [CatalogBrowseTitle]
  @Environment(\.navigator) private var nav

  var body: some View {
    let title = discoverRailName(rail)
    Group {
      switch page.state {
      case .loading: RailSkeleton(title: title, art: .poster)
      case .failed(_, let disconnected):
        RailFailed(title: title, retrying: page.refreshing, disconnected: disconnected, onRetry: page.reload)
      case .ready(let row):
        if cards.isEmpty {
          Color.clear.frame(height: 0)
        } else {
          // The heading opens the row's browse; a row without one has none.
          let browse = discoverRailBrowse(rail)
          Rail(title, onTitleTap: browse.map { start in { nav.catalogBrowse(start) } }) {
            ForEach(cards, id: \.ref) { item in
              RailItem(.poster) {
                // Without a date or a score to say, the year and the kind, since a row can hold both.
                BrowseCard(
                  item: item, detail: row.detail.flatMap { browseDetailText(browseCardDetail($0, item)) },
                  recommended: discoverRecommends(rail))
              }
            }
          }
        }
      }
    }
    .loads(page) { [rail] api in try await RequestData(api: api).row(rail) }
    #if DEBUG
      // `-requests.heading forYou`: that row's heading pressed once its cards show, for a screenshot of what it opens.
      .task(id: cards.isEmpty) {
        guard !cards.isEmpty, !DiscoverDebug.pressed, UserDefaults.standard.string(forKey: "requests.heading") == rail.id,
          let start = discoverRailBrowse(rail)
        else { return }
        DiscoverDebug.pressed = true
        try? await Task.sleep(for: .seconds(1.5))
        nav.catalogBrowse(start)
      }
    #endif
  }
}

#if DEBUG
  /// `-requests.heading` presses a heading once a launch, not each time the rows come back.
  enum DiscoverDebug {
    static var pressed = false
  }
#endif

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
