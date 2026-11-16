import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvSeason.kt: a season's page on a TV, over its show's backdrop. The
 * show's name, the season, or tabs for every season of a show with more
 * than one, which change the season in place; its facts and overview;
 * Play, or Resume, with the episode it starts, the season's tick and
 * heart, and the way to the show. Below, its episodes as a list, by the
 * kit's `TVEpisodeRow`, the one Play starts marked. Focus starts on Play.
 */

struct TVSeasonScreen: View {
  let titleId: String
  /// Nil is the files without a season number.
  let season: Int?
  @State private var loader = Loader<Title>()
  @Environment(\.palette) private var palette

  var body: some View {
    DetailState(loader: loader, error: Str.titleSeasonShowError) { title in
      TVSeasonPage(title: titleShown(title), initial: season)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(palette.background)
    .ignoresSafeArea()
    .loads(loader) { [titleId] api in try await api.titles.get(id: titleId) }
  }
}

/// Each season's episodes, asked for once, as the tabs move between them.
private final class SeasonItems {
  private var loaders: [Int: Loader<[MediaItem]>] = [:]

  func callAsFunction(_ season: Int?) -> Loader<[MediaItem]> {
    let key = season ?? -1
    if let loader = loaders[key] { return loader }
    let loader = Loader<[MediaItem]>()
    loaders[key] = loader
    return loader
  }
}

private struct TVSeasonPage: View {
  let title: Title
  @State private var shown: Int?
  @State private var items = SeasonItems()
  @State private var memory = TVFocusMemory()
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @FocusState private var messageFocused: Bool

  init(title: Title, initial: Int?) {
    self.title = title
    _shown = State(initialValue: initial)
  }

  var body: some View {
    // Hidden specials still open from a link.
    if let season = titleSeason(title, number: shown) {
      page(season)
    } else {
      TVMessage(
        Str.titleSeasonMissing(title.name),
        action: TVNoticeAction(Str.actionsGoToShow(title.name), icon: .tv) { nav.titleUp(title.id) },
        actionFocus: $messageFocused
      )
      .tvPageFocus($messageFocused)
    }
  }

  private func page(_ season: Season) -> some View {
    let loader = items(season.number)
    let list = loader.state.value.map { $0.map(itemShown) }
    let isWatched = { [viewer] (item: MediaItem) in viewer?.isWatched(item) ?? (item.progress?.completed ?? false) }
    let up = seasonPlay(title, list, isWatched: isWatched)
    let marks = marks(season, list: list, up: up, isWatched: isWatched)
    // Hidden specials, opened from a link, get a tab while they're on screen.
    let tabs = isHiddenSpecials(title, season) ? [season] + title.seasons : title.seasons
    let listKey = "\(DetailRowKey.episodes)-\(season.number ?? -1)"
    return ZStack(alignment: .topLeading) {
      DetailBackdrop(
        sources: [api?.art(title.images.backdrop, size: .large), up.flatMap { api?.frame($0.id, large: true) }]
          .compactMap(\.self))
      DetailScroll(memory: memory, headerRows: [DetailKey.actions, DetailKey.tabs], freeRows: [listKey]) {
        SeasonHeader(
          title: title, season: season, tabs: tabs, list: list, marks: marks, memory: memory,
          onSeason: { shown = $0.number })
      } rows: {
        SeasonEpisodeList(
          loader: loader, list: list, up: up, key: listKey, memory: memory, isWatched: isWatched)
      }
    }
    // Loads the season on screen, and each one a tab moves to.
    .background {
      Color.clear.loads(loader) { [id = title.id, number = season.number] api in try await seasonItems(api, id, number) }
        .id(season.number ?? -1)
    }
    // Play shows once the episodes have said which it starts, so focus waits for them.
    .tvPageFocus(memory) { loader.state.isLoading ? nil : (DetailKey.actions, DetailActions.first(marks)) }
    .onChange(of: loader.state.isLoading) { _, loading in
      if !loading, memory.lastRow == nil { memory.restore(fallback: (DetailKey.actions, DetailActions.first(marks))) }
    }
  }

  private func marks(
    _ season: Season, list: [MediaItem]?, up: MediaItem?, isWatched: @escaping (MediaItem) -> Bool
  ) -> DetailMarks {
    let summary = title.summary
    let number = season.number
    // Until the episodes load, the season's counts say.
    let watched =
      list.map { seasonWatched($0, isWatched: isWatched) }
      ?? (season.itemCount > 0 && season.watchedCount >= season.itemCount)
    return DetailMarks(
      play: up, playDetail: playDetail(up, showsEpisode: true),
      name: Str.titleSeasonOf(title.name, seasonName(number)), watched: watched,
      onWatched: { [api, viewer] watched, at in
        guard let api, let viewer else { return }
        try await setSeasonWatched(api, viewer, summary, season: number, watched: watched, watchedAt: at)
      },
      // The files without a season number aren't a season to mark.
      favorite: number.map { viewer?.isSeasonFavorite(summary, number: $0, fallback: season.favorite) ?? season.favorite },
      onFavorite: number.map { number in
        { [api, viewer] in
          guard let api, let viewer else { return }
          let on = viewer.isSeasonFavorite(summary, number: number, fallback: season.favorite)
          try await viewer.setSeasonFavorite(api, summary, number: number, favorite: !on)
        }
      })
  }
}

/// The top of a season's page: the show's name, the season's or the tabs,
/// the facts and overview, and the buttons.
private struct SeasonHeader: View {
  let title: Title
  let season: Season
  let tabs: [Season]
  let list: [MediaItem]?
  let marks: DetailMarks
  let memory: TVFocusMemory
  let onSeason: (Season) -> Void
  @FocusState private var tabFocused: String?
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette

  var body: some View {
    HeaderColumn {
      Text(title.name).textStyle(.title).foregroundStyle(palette.foreground.opacity(0.9)).lineLimit(1)
      if tabs.count > 1 {
        HStack(spacing: TVSpace.s3) {
          ForEach(tabs, id: \.number) { tab in
            TVChip(seasonName(tab.number), selected: tab.number == season.number) { onSeason(tab) }
              .focused($tabFocused, equals: "\(tab.number ?? -1)")
          }
        }
        .tvFocusRow(DetailKey.tabs, memory: memory, focused: $tabFocused, first: "\(season.number ?? -1)")
        .padding(.top, TVSpace.s3)
        .padding(.bottom, TVSpace.s1)
      } else {
        Text(seasonName(season.number)).textStyle(.hero).lineLimit(1)
      }
      DetailFacts(facts: seasonFacts(season, items: list), contentRating: title.contentRating)
        .padding(.top, TVSpace.s3)
      if let overview = season.overview {
        DetailOverview(text: overview).padding(.top, TVSpace.s5)
      }
      DetailActions(
        marks: marks, memory: memory,
        links: [TVAction(Str.actionsGoToShow(title.name), icon: .tv, id: "show") { nav.titleUp(title.id) }]
      )
      .padding(.top, TVSpace.s7)
    }
  }
}

/// The season's episodes, a row each, the one Play starts marked once the
/// season has more than it; while they load, a spinner; why, with Try
/// again, if they didn't.
private struct SeasonEpisodeList: View {
  let loader: Loader<[MediaItem]>
  let list: [MediaItem]?
  let up: MediaItem?
  let key: String
  let memory: TVFocusMemory
  let isWatched: (MediaItem) -> Bool
  @FocusState private var focused: String?
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.tvActions) private var actions

  var body: some View {
    switch loader.state {
    case .loading: TVLoadingRow()
    case .failed(let message, _):
      TVRowNotice(
        Str.titleEpisodes, headline: Str.titleEpisodesFailed, message: message,
        action: TVNoticeAction(Str.commonRetry, icon: .refreshCw, action: loader.reload)
      )
      .detailRow(key)
    case .ready:
      let list = list ?? []
      VStack(alignment: .leading, spacing: TVEpisodeRows.gap) {
        ForEach(list, id: \.id) { item in
          row(item, marked: item.id == up?.id && list.count > 1)
            .focused($focused, equals: item.id)
        }
      }
      .padding(.leading, TVPage.start)
      .padding(.trailing, TVPage.end)
      .tvFocusRow(key, memory: memory, focused: $focused, first: up?.id ?? list.first?.id)
    }
  }

  private func row(_ item: MediaItem, marked: Bool) -> some View {
    let label = itemLabel(item)
    let watched = isWatched(item)
    return TVEpisodeRow(
      label.title, number: label.untitled ? nil : item.episodeNumber.map { String($0) },
      marker: marked ? (isResuming(item) ? Str.titleNextUpContinue : Str.titleNextUpNext) : nil,
      facts: episodeFacts(item, watched: watched), overview: item.episode?.overview, progress: progressRatio(item),
      watched: watched, action: { nav.episode(item.id) }, onLongPress: { actions?.open(.item(item)) },
      onPlayPause: { nav.play(item.id, nil) }
    ) {
      Picture(api?.landscape(item, size: .medium) ?? [])
    }
  }
}
