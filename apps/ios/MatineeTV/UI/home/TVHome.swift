import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvHome.kt: Home on a TV, as Wholphin's. The focused card's backdrop
 * behind the page, its logo or name, facts, and overview in a header at
 * the top, and Home's rows under it: featured, Continue watching, Next up,
 * the recommendations, and what each library got last, the phone's rows in
 * the phone's order from the same loads. Whichever row takes focus scrolls
 * up under the header (the kit's `TVPinnedRows`), and each row remembers
 * its card. A long press of Select on a card opens its actions; Play/Pause
 * plays it.
 *
 * The rows are TVHomeRows.swift's, and what the header says FocusedItem.swift's.
 */

/// Home's loads: the libraries, Continue watching, Next up, featured, and
/// the recommendation rows. Each library's shelf loads in its own row.
/// The iPhone's `HomeLoaders`, without what offline Home keeps.
final class TVHomeLoaders {
  let libraries = Loader<[Library]>()
  let resume = Loader<[MediaItem]>()
  let nextUp = Loader<[MediaItem]>()
  let featured = Loader<[FeaturedTitle]>()
  let recommendations = Loader<HomeRecommendations>()

  /// Everything on Home again, as Try again on Home's one message asks.
  func reloadAll() {
    libraries.reload()
    resume.reload()
    nextUp.reload()
    featured.reload()
    recommendations.reload()
  }
}

/// A loader that never fetches again on its return: featured is picked at
/// random, so fetching it again would swap it under the person.
private let NEVER_STALE: Duration = .seconds(1_000_000_000)

extension View {
  /// Loads Home's sections, as the iPhone's `loadsHome`: the libraries,
  /// Continue watching, and Next up again when Home comes back, the
  /// recommendations once they're ten minutes old, and featured only when
  /// it failed.
  func loadsTVHome(_ loaders: TVHomeLoaders) -> some View {
    self
      .loads(loaders.libraries) { api in try await api.libraries.list() }
      .loads(loaders.resume) { api in try await api.home.continueWatching(limit: 20) }
      .loads(loaders.nextUp) { api in try await api.home.nextUp(limit: 20).map(\.item) }
      .loads(loaders.featured, maxAge: NEVER_STALE) { api in try await api.home.featured() }
      .loads(loaders.recommendations, maxAge: RECOMMENDATIONS_MAX_AGE) { api in try await api.recommendations.home() }
      .onAppear { if loaders.featured.state.isFailed { loaders.featured.reload() } }
  }
}

/// What Home keeps while it's on screen or under a page, so it comes back
/// as it was left: the card the header shows, and the featured titles. The
/// server picks other featured titles each time it's asked, and Home asks
/// again whenever something is watched; a row that changed under the
/// person, or on the way back from a title, would lose the card focus was
/// on. A new pick waits in `pending` until focus is in another row.
@Observable final class TVHomeModel {
  var focused: FocusedItem?
  private(set) var featured: [FeaturedTitle]?
  private(set) var pending: [FeaturedTitle]?

  func offer(_ next: [FeaturedTitle]) {
    if featured == nil { featured = next } else if next != featured { pending = next }
  }

  /// Shows the newest pick, if one is waiting.
  func swap() {
    if let pending { featured = pending }
    pending = nil
  }
}

extension FocusedValues {
  /// The card focused on Home, for its header and backdrop.
  @Entry var tvHomeFocused: FocusedItem?
}

/// The header's room above the rows, so the rows start in the same place whatever it says.
private let HEADER_TOP: CGFloat = TVOverscan.vertical + 16
private let HEADER_HEIGHT: CGFloat = 384

/// Row keys, for focus memory and the pinned scroll.
enum HomeRow {
  static let featured = "featured"
  static let resume = "continue"
  static let nextUp = "nextUp"
  static func recommended(_ rail: HomeRecommendationRail) -> String { "recommended-\(rail.key)" }
  static func shelf(_ library: Library) -> String { "shelf-\(library.id)" }
}

struct TVHomeScreen: View {
  let drawer: TVDrawerState
  @State private var loaders = TVHomeLoaders()
  @State private var model = TVHomeModel()
  @State private var memory = TVFocusMemory()
  /// Each shelf's first card once it loaded, for first focus when nothing above it has one.
  @State private var shelfFirsts: [String: String] = [:]
  @FocusedValue(\.tvHomeFocused) private var focusedNow
  @FocusState private var retryFocused: Bool
  @Environment(TVTopShelf.self) private var topShelf
  @Environment(MatineeSession.self) private var session
  @Environment(\.tvActions) private var actions
  @Environment(\.tvPageOnTop) private var onTop

  var body: some View {
    ZStack(alignment: .topLeading) {
      TVBackdrop(model.focused?.backdrop.nilIfEmpty) { sources in
        Picture(sources, alignment: .topTrailing)
      }
      if failedOutright(
        loaders.libraries.state, [loaders.resume.state, loaders.nextUp.state, loaders.featured.state])
      {
        failed
      } else {
        TVItemHeader(model.focused?.info, height: HEADER_HEIGHT) { info in
          TVLogo(name: info.name, source: model.focused?.logo)
        }
        .padding(.leading, TVPage.start)
        .padding(.trailing, 440)
        .padding(.top, HEADER_TOP)
        // Every row at once: a few rows, each library's loading by itself as Home opens.
        TVPinnedRows(memory: memory, lazy: false) {
          TVHomeRows(
            loaders: loaders, featured: slides, memory: memory,
            onShelfFirst: { row, first in shelfFirsts[row] = first })
        }
        .padding(.top, HEADER_TOP + HEADER_HEIGHT)
      }
    }
    .ignoresSafeArea()
    .loadsTVHome(loaders)
    .task(id: (loaders.resume.state.value ?? []) + (loaders.nextUp.state.value ?? [])) {
      if let resume = loaders.resume.state.value, let next = loaders.nextUp.state.value {
        await topShelf.publish(continuing: resume, next: next, session: session)
      }
    }
    .onChange(of: focusedNow) { _, item in if let item { model.focused = item } }
    .onChange(of: loaders.featured.state.value, initial: true) { _, value in if let value { model.offer(value) } }
    // A new featured pick shows once focus is in another row, which has scrolled the featured row away.
    .onChange(of: memory.lastRow) { _, row in if row != HomeRow.featured { model.swap() } }
    // The rows above the libraries show only once loaded, so focus waits for them: focus taken
    // sooner would sit in a row they then push down.
    .tvPageFocus(memory) { firstFocus }
    // Only while Home is on top: a page opened over it at launch covers it before its rows load.
    .onChange(of: firstFocus?.item) { _, first in
      if first != nil, onTop, memory.lastRow == nil { memory.restore(fallback: firstFocus) }
    }
    // Home with the drawer shut: Menu opens it. With it open, Menu leaves the app (TVShell.swift).
    .onTVBack(isActive: !drawer.isOpen) { drawer.open() }
    #if DEBUG
      .onChange(of: standIns, initial: true) { HomeDevData.standIns.titles = standIns }
    #endif
  }

  /// Home as one message, when nothing on it loaded.
  @ViewBuilder private var failed: some View {
    if case .failed(let message, _) = loaders.libraries.state {
      TVMessage(
        Str.homeFailed, message: message,
        action: TVNoticeAction(Str.commonRetry, icon: .refreshCw) { loaders.reloadAll() },
        actionFocus: $retryFocused
      )
      .tvPageFocus($retryFocused)
    }
  }

  /// The featured titles, with `-dev.art`'s stand-ins in a debug build.
  private var slides: [FeaturedTitle] {
    HomeDevData.fill(
      model.featured ?? [], standIns: (loaders.resume.state.value ?? []) + (loaders.nextUp.state.value ?? []))
  }

  /// Where focus goes the first time: the first card of the first row that
  /// has one, once the rows above the libraries have loaded.
  private var firstFocus: (row: String, item: String)? {
    if loaders.featured.state.isLoading || loaders.resume.state.isLoading || loaders.nextUp.state.isLoading {
      return nil
    }
    if let first = slides.first { return (HomeRow.featured, first.title.id) }
    if let first = loaders.resume.state.value?.first { return (HomeRow.resume, first.id) }
    if let first = loaders.nextUp.state.value?.first { return (HomeRow.nextUp, first.id) }
    if let rail = TVHomeRows.rails(loaders.recommendations.state.value, hidden: actions?.hidden.keys ?? []).first,
      let first = rail.visible(hiding: actions?.hidden.keys ?? []).first
    {
      return (HomeRow.recommended(rail), first.title.id)
    }
    for library in loaders.libraries.state.value ?? [] {
      if let first = shelfFirsts[HomeRow.shelf(library)] { return (HomeRow.shelf(library), first) }
    }
    return nil
  }

  #if DEBUG
    /// The titles on Home, for the stand-in recommendations of `-dev.recommendations`.
    private var standIns: [TitleSummary] {
      (loaders.featured.state.value ?? []).map(\.title)
        + (loaders.resume.state.value ?? []).compactMap(\.title)
        + (loaders.nextUp.state.value ?? []).compactMap(\.title)
    }
  #endif
}

extension Array {
  /// Nil when empty, for a backdrop that has no picture.
  fileprivate var nilIfEmpty: Self? { isEmpty ? nil : self }
}
