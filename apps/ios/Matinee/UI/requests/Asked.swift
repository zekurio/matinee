import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Asked.kt, after the web's asked.tsx: what the viewer asked for. Home's
 * "My requests" row, of what's on its way and what came or was answered
 * lately; the profile's, of the latest of everything; and the whole list
 * behind both headings, with In progress and All. Each is the catalog
 * card while it isn't here, then the library's, and a declined one says
 * why in the whole list. Cancelling is the title's page's, where its
 * button is, as on Android.
 */

/// The titles of a list of requests, for one stream that follows them all.
func askedInputs(_ items: [RequestItem]) -> [CatalogInput] {
  items.map { CatalogInput(ref: $0.title.ref, libraryId: $0.library.id) }
}

/// One title the viewer asked for, as its state stands: the catalog card
/// while it isn't here, then the library's, with the accent dot while
/// `fresh`. A show that's partly here and still waits for a season is the
/// library's poster with that season's state.
struct AskedCard: View {
  let item: RequestItem
  var fresh = false
  @Environment(\.requests) private var hub
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav

  var body: some View {
    switch askedCardKind(item, live: hub?.state.titles[item.title.ref]) {
    case .pendingSeason(let titleId, let season):
      let state = season.asTitle
      let line = requestNextSeasonLine(season)
      Pressable(shape: .kit(Radius.md), wash: false, action: { nav.titleId(titleId) }) {
        VStack(alignment: .leading, spacing: 0) {
          PosterArt(name: item.title.name, poster: api?.art(item.title.poster))
            .overlay(alignment: .topTrailing) { CatalogBadge(availability: state).padding(Space.s1_5) }
          CardText(item.title.name, line)
        }
      }
      .accessibilityElement(children: .combine)
    case .catalog(let hereAtFirst):
      CatalogCard(item.title, library: item.library.id, hereAtFirst: hereAtFirst, fresh: fresh)
    }
  }
}

/// "My requests" as a row: on Home what's on its way and what came or was
/// answered in the last three days, nothing when there's none, so Home
/// stays about what's here; on the profile the latest of everything. The
/// heading opens the whole list.
struct AskedRail: View {
  enum Place { case home, profile }
  let place: Place
  @State private var mine = Loader<RequestPage>()
  @Environment(\.navigator) private var nav

  init(_ place: Place) { self.place = place }

  var body: some View {
    let items = mine.state.value?.items ?? []
    Group {
      if items.isEmpty {
        // Something to show, so it loads.
        Color.clear.frame(height: 0)
      } else {
        Rail(Str.webAskMineTitle, onTitleTap: nav.asked) {
          ForEach(items, id: \.id) { item in
            RailItem(.poster) { AskedCard(item: item, fresh: place == .home) }
          }
        }
        // A new ask at the front starts the row there again.
        .id(items.first?.id)
      }
    }
    .loads(mine) { [place] api in
      try await requestApi(api).requests.mine(limit: 24, filter: place == .home ? AskedFilter.inProgress.rawValue : AskedFilter.all.rawValue)
    }
    .reloadsOnAsk(mine)
    .followsRequests(askedInputs(items))
  }
}

/// Everything the viewer asked for, newest first, with "In progress" and
/// "All", a page at a time as it scrolls. Declined titles say why.
struct AskedScreen: View {
  @State private var filter = AskedFilter.inProgress
  @State private var pages = RequestPages<RequestItem> { $0.id }
  @State private var configured: AskedFilter?
  @Environment(\.api) private var api
  @Environment(\.requests) private var hub
  @Environment(\.gutter) private var gutter
  @Environment(\.palette) private var palette

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: Space.s4) {
        HStack(spacing: Space.s2) {
          Chip(Str.webAskMineInProgress, selected: filter == .inProgress) { filter = .inProgress }
          Chip(Str.webAskMineAll, selected: filter == .all) { filter = .all }
        }
        .padding(.horizontal, gutter)
        content
      }
      .padding(.bottom, Space.s8)
    }
    .refreshable { pages.reset() }
    .topBar(Str.webAskMineTitle)
    .onAppear(perform: configure)
    .onChange(of: filter) { configure() }
    .onChange(of: hub?.version) { pages.reset() }
    .followsRequests(askedInputs(Array(pages.items.prefix(100))))
  }

  @ViewBuilder private var content: some View {
    if let failure = pages.failure, pages.items.isEmpty {
      ErrorState(
        Str.askedLoadFailed, describeFailure(failure), disconnected: failure.isDisconnect, retrying: pages.loading,
        onRetry: pages.more
      )
      .frame(maxWidth: .infinity)
      .padding(.vertical, Space.s12)
    } else if pages.items.isEmpty && pages.nextPage != nil || pages.items.isEmpty && pages.loading {
      Spinner(size: 32, tint: palette.accent).frame(maxWidth: .infinity).padding(.vertical, Space.s16)
    } else if pages.items.isEmpty {
      EmptyState(
        icon: .clock, title: filter == .inProgress ? Str.webAskMineEmptyInProgress : Str.webAskMineEmpty,
        description: filter == .inProgress ? nil : Str.webAskMineEmptyHint
      )
      .padding(.vertical, Space.s12)
      .frame(maxWidth: .infinity)
    } else {
      CardGrid {
        ForEach(pages.items, id: \.id) { item in
          VStack(alignment: .leading, spacing: 0) {
            AskedCard(item: item)
            DeclinedNote(item: item)
          }
        }
      }
      PageEnd(loading: pages.loading, failed: pages.failure != nil, more: pages.nextPage != nil, onMore: pages.more)
    }
  }

  private func configure() {
    guard let api, configured != filter else { return }
    configured = filter
    let mine = requestApi(api)
    let filter = filter.rawValue
    let cursors = CursorBook()
    pages.configure(key: filter) { number in
      let page = try await mine.requests.mine(cursor: await cursors.cursor(number), limit: 40, filter: filter)
      await cursors.set(number + 1, page.nextCursor)
      return RequestPageBatch(items: page.items, nextPage: page.nextCursor == nil ? nil : number + 1, stale: false)
    }
  }
}

/// Why a declined title isn't coming, under its card in the whole list.
private struct DeclinedNote: View {
  let item: RequestItem
  @Environment(\.requests) private var hub
  @Environment(\.palette) private var palette

  var body: some View {
    let availability = hub?.availability(item.title.ref, item.availability) ?? item.availability
    if let reason = askedDeclined(availability) {
      VStack(alignment: .leading, spacing: 2) {
        Text(requestDeclineText(reason)).textStyle(.px13).foregroundStyle(palette.mutedForeground).lineLimit(2)
        if let note = reason.note {
          Text(note).textStyle(.px13).italic().foregroundStyle(palette.foreground.opacity(0.7)).lineLimit(2)
        }
      }
      .padding(.top, Space.s1)
    }
  }
}

/// The end of a grid that loads more as it scrolls: a spinner while the
/// next page comes, the failure with Retry, or nothing. Showing it asks for
/// the next page.
struct PageEnd: View {
  let loading: Bool
  let failed: Bool
  let more: Bool
  var end: String?
  let onMore: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Group {
      if failed {
        ErrorSection(Str.gridMoreFailed, nil, onRetry: onMore)
      } else if loading || more {
        Spinner(size: 24, tint: palette.accent).onAppear(perform: onMore)
      } else if let end {
        Text(end).textStyle(.sm).foregroundStyle(palette.mutedForeground)
      }
    }
    .frame(maxWidth: .infinity)
    .padding(Space.s4)
  }
}

/// Which cursor fetches which page, for MatineeCore's `RequestPages`, which counts pages.
actor CursorBook {
  private var cursors: [Int: String] = [:]
  func cursor(_ page: Int) -> String? { cursors[page] }
  func set(_ page: Int, _ cursor: String?) { cursors[page] = cursor }
}
