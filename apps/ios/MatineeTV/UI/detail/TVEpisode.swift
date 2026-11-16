import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvEpisode.kt: an episode's page on a TV, or a loose file's, over its
 * still or its show's art: the show, the season and number, the name,
 * facts, overview, and file, with Play and its marks and the ways up to
 * its season and its show. Below, the rest of its season, starting on the
 * episode after it. Focus starts on Play.
 */

struct TVEpisodeScreen: View {
  let itemId: String
  @State private var loader = Loader<MediaItem>()
  @Environment(\.palette) private var palette

  var body: some View {
    DetailState(loader: loader, error: Str.titleEpisodeLoadError) { item in TVEpisodePage(item: itemShown(item)) }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .background(palette.background)
      .ignoresSafeArea()
      .loads(loader) { [itemId] api in try await api.media.get(id: itemId) }
  }
}

private struct TVEpisodePage: View {
  let item: MediaItem
  @State private var memory = TVFocusMemory()
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    let title = item.title
    let season = item.seasonNumber
    let marks = marks
    ZStack(alignment: .topLeading) {
      DetailBackdrop(
        sources: [
          api?.art(item.episode?.still, size: .large), api?.art(title?.images.backdrop, size: .large),
          api?.frame(item.id, large: true),
        ].compactMap(\.self))
      DetailScroll(memory: memory) {
        EpisodeHeader(item: item, marks: marks, links: links, memory: memory)
      } rows: {
        if let title {
          SeasonEpisodesRow(
            heading: Str.titleEpisodeMoreFrom(seasonName(season)), key: "more", titleId: title.id, season: season,
            memory: memory, exclude: item.id,
            // Focus comes in on the episode after this one, as the phone's row starts beside it.
            start: { [id = item.id] list in episodeAfter(list, current: id)?.id })
        }
      }
    }
    .tvPageFocus(memory) { (DetailKey.actions, DetailActions.first(marks)) }
  }

  private var marks: DetailMarks {
    let label = itemLabel(item)
    let watched = viewer?.isWatched(item) ?? (item.progress?.completed ?? false)
    return DetailMarks(
      play: item, playDetail: playDetail(item, showsEpisode: false), restart: isResuming(item) && !watched,
      name: label.title, watched: watched,
      onWatched: { [api, viewer, item] watched, at in
        guard let api, let viewer else { return }
        try await viewer.setWatched(api, item, watched, watchedAt: at)
      },
      favorite: viewer?.isFavorite(item) ?? item.favorite,
      onFavorite: { [api, viewer, item] in
        guard let api, let viewer else { return }
        try await viewer.setFavorite(api, item, !viewer.isFavorite(item))
      })
  }

  /// Up to the season's page, then the show's, each the one on the stack if it's there.
  private var links: [TVAction] {
    guard let title = item.title else { return [] }
    let season = item.seasonNumber
    var links: [TVAction] = []
    if title.kind == TitleKind.show {
      links.append(
        TVAction(Str.actionsGoToShow(seasonName(season)), icon: .list, id: "season") { nav.seasonUp(title.id, season) })
    }
    links.append(TVAction(Str.actionsGoToShow(title.name), icon: .tv, id: "show") { nav.titleUp(title.id) })
    return links
  }
}

/// The top of an episode's page: its show, its season and number, its
/// name, facts, the overview with the file beside it, and the buttons.
private struct EpisodeHeader: View {
  let item: MediaItem
  let marks: DetailMarks
  let links: [TVAction]
  let memory: TVFocusMemory
  @Environment(\.palette) private var palette

  var body: some View {
    let label = itemLabel(item)
    let season = item.seasonNumber
    let place = [
      season.map { $0 == 0 ? Str.titleEpisodeSpecials : Str.titleEpisodeSeason($0) },
      item.episodeNumber.map(Str.titleEpisodeNumber),
    ].compactMap(\.self).joined(separator: "  ·  ")
    HeaderColumn {
      Text(label.showName).textStyle(.title).foregroundStyle(palette.foreground.opacity(0.9)).lineLimit(1)
      if !place.isEmpty {
        Text(place).textStyle(.facts).monospacedDigit().foregroundStyle(palette.mutedForeground).lineLimit(1)
          .padding(.top, 4)
      }
      Text(label.title).textStyle(.hero).lineLimit(2).frame(maxWidth: 1440, alignment: .leading)
        .padding(.top, TVSpace.s2)
        .accessibilityAddTraits(.isHeader)
      DetailFacts(facts: episodeFacts(item, watched: marks.watched), contentRating: item.title?.contentRating)
        .padding(.top, TVSpace.s3)
      DetailAbout(overview: item.episode?.overview, lines: 4, file: item)
        .padding(.top, TVSpace.s5)
      DetailActions(marks: marks, memory: memory, links: links)
        .padding(.top, TVSpace.s7)
    }
  }
}
