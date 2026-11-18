import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvFavorites.kt: the person's favorites on a TV, a row for each kind in
 * the phone's order, shows, seasons, episodes, and movies, each only when
 * it has any, newest first: shows, seasons, and movies as posters,
 * episodes as stills. The focused one's name, facts, and overview sit at
 * the top, its backdrop behind the page, and whichever row takes focus
 * scrolls up under them, as on Home. What still shows is MatineeCore's
 * (Browse/FavoritesData.swift), with the marks made here over what the
 * server sent, so one taken off goes at once.
 */

/// Row keys, for focus memory and the pinned scroll.
private enum FavoriteRow {
  static let shows = "shows"
  static let seasons = "seasons"
  static let episodes = "episodes"
  static let movies = "movies"
}

/// The header's room above the rows, so the rows start in the same place whatever it says.
private let HEADER_TOP: CGFloat = TVGrid.top
private let HEADER_HEIGHT: CGFloat = 320

struct TVFavoritesScreen: View {
  @State private var favorites = Loader<Favorites>()
  @State private var memory = TVFocusMemory()
  @State private var focused: FocusedItem?
  @FocusState private var noticeFocused: Bool
  @FocusedValue(\.tvBrowseFocused) private var focusedNow
  @Environment(\.user) private var user
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette

  var body: some View {
    let lists = favorites.state.value.map { all in viewer.map { all.live($0) } ?? all }
    ZStack(alignment: .topLeading) {
      TVBackdrop(focused?.backdrop.isEmpty == false ? focused?.backdrop : nil) { sources in
        Picture(sources, alignment: .topTrailing)
      }
      switch favorites.state {
      case .failed(let message, _):
        TVMessage(
          Str.favoritesLoadFailed, message: message,
          action: TVNoticeAction(Str.commonRetry, icon: .refreshCw, action: favorites.reload),
          actionFocus: $noticeFocused
        )
        .tvPageFocus($noticeFocused)
      case .loading:
        header
        TVLoadingRow().padding(.top, HEADER_TOP + HEADER_HEIGHT)
      case .ready:
        if let lists, lists.isEmpty {
          TVMessage(
            Str.favoritesEmpty, message: Str.tvFavoritesEmptyHint, icon: .heart,
            action: TVNoticeAction(Str.tabHome, icon: .house) { nav.home() }, actionFocus: $noticeFocused
          )
          .tvPageFocus($noticeFocused)
        } else if let lists {
          header
          TVPinnedRows(memory: memory) { FavoriteRows(lists: lists, memory: memory) }
            .padding(.top, HEADER_TOP + HEADER_HEIGHT)
        }
      }
    }
    .ignoresSafeArea()
    .loads(favorites) { [user] api in
      // The server answers nil only for someone who doesn't share them, never for one's own.
      guard let username = user?.username else { return Favorites(shows: [], seasons: [], episodes: [], movies: []) }
      return try await loadFavorites(api, username: username)
    }
    .onChange(of: focusedNow) { _, item in if let item { focused = item } }
    // Rows that load wait for them, so focus doesn't land in a row that's then pushed down.
    .tvPageFocus(memory) { firstFocus(lists) }
    .onChange(of: firstFocus(lists)?.item) { _, first in
      if first != nil, memory.lastRow == nil { memory.restore(fallback: firstFocus(lists)) }
    }
  }

  /// "Favorites", and what it says about the focused card: its name and facts, and two lines of its overview.
  private var header: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(Str.favoritesTitle).textStyle(.headline).lineLimit(1)
        .padding(.trailing, TVGrid.clockRoom)
        .accessibilityAddTraits(.isHeader)
      TVFocusLine(focused?.info).padding(.top, TVSpace.s4)
      // Which season or episode, under the show's name.
      if let subtitle = focused?.info.subtitle {
        Text(subtitle).textStyle(.body).foregroundStyle(palette.foreground.opacity(0.9)).lineLimit(1)
          .id("subtitle-\(focused?.key ?? "")")
          .transition(.opacity)
      }
      if let overview = focused?.info.overview {
        Text(overview).textStyle(.body).foregroundStyle(palette.foreground.opacity(0.75)).lineLimit(2)
          .frame(maxWidth: 1200, alignment: .leading)
          .padding(.top, TVSpace.s2)
          .id(focused?.key)
          .transition(.opacity)
      }
    }
    .animation(Motion.enter, value: focused?.key)
    .padding(.leading, TVPage.start)
    .padding(.trailing, TVPage.end)
    .padding(.top, HEADER_TOP)
    .frame(height: HEADER_TOP + HEADER_HEIGHT, alignment: .topLeading)
  }

  /// The first card of the first row that has one.
  private func firstFocus(_ lists: Favorites?) -> (row: String, item: String)? {
    guard let lists else { return nil }
    if let first = lists.shows.first { return (FavoriteRow.shows, first.id) }
    if let first = lists.seasons.first { return (FavoriteRow.seasons, seasonKey(first)) }
    if let first = lists.episodes.first { return (FavoriteRow.episodes, first.id) }
    if let first = lists.movies.first { return (FavoriteRow.movies, first.id) }
    return nil
  }
}

/// A favorite season's key in its row.
private func seasonKey(_ entry: FavoriteSeason) -> String { "\(entry.title.id)/\(entry.season.number ?? -1)" }

/// A season by itself: its show, which season, and how many episodes.
private func seasonInfo(_ title: TitleSummary, _ season: Season, api: MatineeApi?) -> FocusedItem {
  FocusedItem(
    key: "season/\(title.id)/\(season.number ?? -1)",
    info: TVItemInfo(
      name: title.name, subtitle: seasonName(season.number),
      facts: [formatYear(title.year), season.itemCount > 0 ? Str.mediaEpisodeCount(season.itemCount) : nil]
        .compactMap(\.self),
      contentRating: title.contentRating, rating: title.rating.map(formatRating),
      overview: season.overview ?? title.overview),
    logo: api?.art(title.images.logo, size: .medium),
    backdrop: [api?.art(title.images.backdrop, size: .large)].compactMap { $0 ?? nil })
}

/// The rows, each kind only when it has any.
private struct FavoriteRows: View {
  let lists: Favorites
  let memory: TVFocusMemory
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.tvActions) private var actions
  @Environment(\.snackbar) private var snackbar
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    if !lists.shows.isEmpty {
      TVRow(Str.favoritesShows, key: FavoriteRow.shows, items: lists.shows, itemKey: \.id, memory: memory) { title in
        poster(title)
      }
    }
    if !lists.seasons.isEmpty {
      TVRow(Str.favoritesSeasons, key: FavoriteRow.seasons, items: lists.seasons, itemKey: seasonKey, memory: memory) {
        entry in season(entry)
      }
    }
    if !lists.episodes.isEmpty {
      TVRow(Str.favoritesEpisodes, key: FavoriteRow.episodes, items: lists.episodes, itemKey: \.id, memory: memory) {
        item in still(item)
      }
    }
    if !lists.movies.isEmpty {
      TVRow(Str.favoritesMovies, key: FavoriteRow.movies, items: lists.movies, itemKey: \.id, memory: memory) { title in
        poster(title)
      }
    }
  }

  private func poster(_ title: TitleSummary) -> some View {
    let target = TVActionTarget.title(title)
    return TVPosterCard(
      title.name, watched: viewer?.isWatched(title) ?? title.watched, action: { nav.title(title) },
      onLongPress: { actions?.open(target) },
      onPlayPause: { actions?.play(target, api: api, viewer: viewer, nav: nav, snackbar: snackbar) }
    ) {
      Picture(api?.art(title.images.poster))
    }
    .focusedValue(\.tvBrowseFocused, browseTitleInfo(title, api: api))
  }

  private func season(_ entry: FavoriteSeason) -> some View {
    let (title, season) = (entry.title, entry.season)
    return TVPosterCard(
      Str.titleSeasonOf(title.name, seasonName(season.number)),
      watched: season.itemCount > 0 && season.watchedCount >= season.itemCount,
      action: { nav.season(title.id, season.number) },
      onLongPress: { actions?.open(.season(title, season)) }
    ) {
      Picture(api?.art(season.poster ?? title.images.poster))
    }
    .focusedValue(\.tvBrowseFocused, seasonInfo(title, season, api: api))
  }

  /// An episode as its still: the show, then the episode and the time left, as Home's Continue watching.
  private func still(_ item: MediaItem) -> some View {
    let label = itemLabel(item)
    let code = episodeCode(item)
    let left = item.progress?.completed == false ? timeLeft(item) : nil
    let detail = [code, left ?? (code == nil ? label.year : nil)].compactMap(\.self).joined(separator: " · ")
    return TVLandscapeCard(
      label.showName, detail: detail.isEmpty ? nil : detail, progress: progressRatio(item),
      watched: viewer?.isWatched(item) ?? false, action: { nav.item(item) },
      onLongPress: { actions?.open(.item(item)) },
      onPlayPause: { nav.play(item.id, nil) }
    ) {
      Picture(api?.landscape(item) ?? [])
    }
    .focusedValue(\.tvBrowseFocused, itemInfo(item, api: api))
  }
}
