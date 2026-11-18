import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvHome.kt's rows: featured as a row of posters, Continue watching and
 * Next up as stills, the recommendation rows, and each library's newest.
 * What shows for each load follows the phone: Continue watching, Next up,
 * and the recommendations show nothing while they load or when they're
 * empty, as an empty one is the usual case; a failed one says so in its
 * place, with Try again. A library's row keeps its place with a notice
 * while it loads, fails, or is empty, so the rows under it stay put.
 */
struct TVHomeRows: View {
  let loaders: HomeLoaders
  let featured: [FeaturedTitle]
  let memory: TVFocusMemory
  /// A shelf's first card, or nil, once its row knows, for first focus.
  let onShelfFirst: (_ row: String, _ first: String?) -> Void
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.tvActions) private var actions
  @Environment(\.snackbar) private var snackbar
  @Environment(\.user) private var user
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    if !featured.isEmpty {
      TVRow(Str.tvHomeFeatured, key: HomeRow.featured, items: featured, itemKey: \.title.id, memory: memory) { slide in
        poster(
          slide.title, art: api?.art(slide.title.images.poster), target: .title(slide.title, file: slide.item),
          info: featuredInfo(slide, api: api)
        ) { nav.title(slide.title) }
      }
    }
    itemRow(HomeRow.resume, title: Str.browseContinueWatching, failure: Str.homeContinueFailed, loader: loaders.resume)
    itemRow(HomeRow.nextUp, title: Str.browseNextUp, failure: Str.homeNextUpFailed, loader: loaders.nextUp)
    let hidden = actions?.hidden.keys ?? []
    ForEach(Self.rails(loaders.recommendations.state.value, hidden: hidden), id: \.key) { rail in
      TVRow(
        railName(rail.name), key: HomeRow.recommended(rail), items: rail.visible(hiding: hidden), itemKey: \.title.id,
        memory: memory
      ) { pick in
        poster(
          pick.title, art: api?.art(pick.title.images.poster), target: .title(pick.title, recommended: pick.ref),
          info: titleInfo(pick.title, api: api)
        ) { nav.title(pick.title) }
      }
    }
    libraries
  }

  /// The recommendation rows Home shows.
  static func rails(_ value: HomeRecommendations?, hidden: Set<String>) -> [HomeRecommendationRail] {
    return value?.shownRails(hiding: hidden) ?? []
  }

  private func railName(_ name: RecommendationRailName) -> String {
    switch name {
    case .forYou: Str.webDiscoverRailForYou
    case .becauseWatched(let title): Str.webDiscoverRailBecauseWatched(title)
    }
  }

  /// Continue watching or Next up.
  @ViewBuilder private func itemRow(
    _ key: String, title: String, failure: String, loader: Loader<[MediaItem]>
  ) -> some View {
    switch railState(loader.state) {
    case .loading, .empty: EmptyView()
    case .failed(let message, _):
      TVRowNotice(
        title, headline: failure, message: message,
        action: TVNoticeAction(Str.commonRetry, icon: .refreshCw, action: loader.reload)
      )
      .id(key)
    case .shown(let items):
      TVRow(title, key: key, items: items, itemKey: \.id, memory: memory) { item in TVStillCard(item: item).focusedValue(\.tvHomeFocused, itemInfo(item, api: api)) }
    }
  }

  @ViewBuilder private var libraries: some View {
    let libraries = loaders.libraries
    switch libraries.state {
    case .loading:
      TVLoadingRow().id("libraries-loading")
    case .failed(let message, _):
      TVRowNotice(
        nil, headline: Str.homeLoadFailed, message: message,
        action: TVNoticeAction(Str.commonRetry, icon: .refreshCw, action: libraries.reload)
      )
      .id("libraries-failed")
    case .ready(let list) where list.isEmpty:
      switch NoLibraries(admin: user?.isAdmin == true) {
      case .noneExist:
        TVMessage(Str.browseHomeNoLibraries, message: Str.browseHomeNoLibrariesAdmin, centered: false)
      case .noneOpen:
        TVMessage(Str.browseHomeNothingYet, message: Str.browseHomeNothingYetDescription, centered: false)
      }
    case .ready(let list):
      ForEach(list, id: \.id) { library in
        TVShelfRow(library: library, memory: memory, onFirst: onShelfFirst)
      }
    }
  }

  // MARK: Cards

  /// A movie or show as its poster, telling the header when it's focused.
  private func poster(
    _ title: TitleSummary, art: ImageSource?, target: TVActionTarget, info: FocusedItem,
    open: @escaping () -> Void
  ) -> some View {
    TVPosterCard(
      title.name, watched: viewer?.isWatched(title) ?? title.watched, action: open,
      onLongPress: { actions?.open(target) },
      onPlayPause: { actions?.play(target, api: api, viewer: viewer, nav: nav, snackbar: snackbar) }
    ) {
      Picture(art)
    }
    .focusedValue(\.tvHomeFocused, info)
  }
}

/// A library's newest titles as posters, loading in its own place.
private struct TVShelfRow: View {
  let library: Library
  let memory: TVFocusMemory
  let onFirst: (_ row: String, _ first: String?) -> Void
  @State private var entries = Loader<[ShelfEntry]>()
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.tvActions) private var actions
  @Environment(\.snackbar) private var snackbar
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    let key = HomeRow.shelf(library)
    let title = Str.browseRecentlyAdded(library.name)
    let id = library.id
    Group {
      switch railState(entries.state) {
      case .loading:
        TVRowNotice(title, height: TVRowNotice.posterHeight).id(key)
      case .failed(let message, _):
        TVRowNotice(
          title, headline: Str.homeShelfFailed, message: message, height: TVRowNotice.posterHeight,
          action: TVNoticeAction(Str.commonRetry, icon: .refreshCw, action: entries.reload)
        )
        .id(key)
      case .empty:
        TVRowNotice(title, headline: Str.browseEmptyShelf, height: TVRowNotice.posterHeight).id(key)
      case .shown(let shown):
        TVRow(title, key: key, items: shown, itemKey: \.title.id, memory: memory) { entry in card(entry) }
      }
    }
    .loads(entries) { api in try await api.media.shelf(libraryId: id, limit: 12) }
    .onChange(of: entries.state.value?.first?.title.id, initial: true) { _, first in onFirst(key, first) }
  }

  private func card(_ entry: ShelfEntry) -> some View {
    let card = shelfCardModel(entry)
    let target = TVActionTarget.title(entry.title, file: entry.title.kind == TitleKind.movie ? entry.item : nil)
    return TVPosterCard(
      entry.title.name, watched: viewer?.isWatched(entry.title) ?? entry.title.watched, action: { card.open(nav) },
      onLongPress: { actions?.open(target) },
      onPlayPause: { actions?.play(target, api: api, viewer: viewer, nav: nav, snackbar: snackbar) }
    ) {
      Picture(api?.art(card.poster))
    }
    .focusedValue(\.tvHomeFocused, shelfInfo(entry, detail: card.detail, api: api))
  }
}

/// A file as its still, in Continue watching, Next up, and the favorites:
/// the show, then the episode and the time left.
struct TVStillCard: View {
  let item: MediaItem
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.tvActions) private var actions
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    let label = itemLabel(item)
    let code = episodeCode(item)
    let left = item.progress?.completed == false ? timeLeft(item) : nil
    let detail = [code, left ?? (code == nil ? label.year : nil)].compactMap(\.self).joined(separator: " · ")
    TVLandscapeCard(
      label.showName, detail: detail.isEmpty ? nil : detail, progress: progressRatio(item),
      watched: viewer?.isWatched(item) ?? false, action: { nav.item(item) },
      onLongPress: { actions?.open(.item(item)) },
      onPlayPause: { nav.play(item.id, nil) }
    ) {
      Picture(api?.landscape(item) ?? [])
    }
  }
}
