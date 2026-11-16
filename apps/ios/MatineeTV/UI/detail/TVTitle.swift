import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvTitle.kt: a movie's or show's page on a TV. The title over its
 * backdrop: its logo or name, facts, genres, overview, and a movie's
 * file, with Play and its marks under them, focus on Play. Below, for a
 * show, the episode up next, the episodes of a show with one season or
 * its seasons; then the cast and crew, the titles related to it, and its
 * genres and studios. What the page decides is MatineeCore's (Title/),
 * and the facts' words are the iPhone's (Matinee/UI/title/TitleData.swift).
 */

struct TVTitleScreen: View {
  let id: String
  @State private var loader = Loader<Title>()
  @Environment(\.palette) private var palette

  var body: some View {
    DetailState(loader: loader, error: Str.titleLoadError) { title in TVTitlePage(title: titleShown(title)) }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .background(palette.background)
      .ignoresSafeArea()
      .loads(loader) { [id] api in try await api.titles.get(id: id) }
  }
}

private struct TVTitlePage: View {
  let title: Title
  @State private var memory = TVFocusMemory()
  /// A movie's files, when it has more than one, for More.
  @State private var files = Loader<[MediaItem]>()
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    let next = title.next.map(itemShown)
    let marks = marks(next)
    ZStack(alignment: .topLeading) {
      DetailBackdrop(
        sources: [api?.art(title.images.backdrop, size: .large), next.flatMap { api?.frame($0.id, large: true) }]
          .compactMap(\.self))
      DetailScroll(memory: memory) {
        TitleHeader(title: title, next: next, marks: marks, more: more, memory: memory)
      } rows: {
        if title.isShow {
          if let next, showsNextUp(title) { NextUpRow(item: next, memory: memory) }
          if let only = inlineSeason(title) {
            // One season, so no specials either: its episodes go right on the show's page.
            SeasonEpisodesRow(
              heading: Str.titleEpisodes, key: DetailRowKey.episodes, titleId: title.id, season: only.number,
              memory: memory,
              start: { [title, viewer] list in
                seasonPlay(title, list) { viewer?.isWatched($0) ?? ($0.progress?.completed ?? false) }?.id
              })
          } else {
            SeasonsRow(title: title, memory: memory)
          }
        }
        PeopleRow(credits: title.credits, memory: memory)
        RelatedRows(title: title, memory: memory)
        LinksRow(title: title, memory: memory)
      }
    }
    .tvPageFocus(memory) { (DetailKey.actions, DetailActions.first(marks)) }
    .loads(files) { [id = title.id, several = showsFiles(title)] api in several ? try await api.titleItems(id) : [] }
  }

  private func marks(_ next: MediaItem?) -> DetailMarks {
    let summary = title.summary
    return DetailMarks(
      play: next, playDetail: playDetail(next, showsEpisode: title.isShow),
      restart: !title.isShow && isResuming(next),
      trailer: preferredTrailer(title.trailers, language: Locale.app.identifier),
      name: title.name, watched: viewer?.isWatched(summary) ?? title.watched,
      onWatched: title.itemCount == 0
        ? nil
        : { [api, viewer] watched, at in
          guard let api, let viewer else { return }
          try await viewer.setWatched(api, summary, watched, watchedAt: at)
        },
      favorite: viewer?.isFavorite(summary) ?? title.favorite,
      onFavorite: { [api, viewer] in
        guard let api, let viewer else { return }
        try await viewer.setFavorite(api, summary, !viewer.isFavorite(summary))
      })
  }

  /// More: a movie's files, each to play by itself, when it has several,
  /// as a director's cut beside the film: each by where the server says it
  /// sits, with how long it runs or how much is left, and its picture.
  private var more: [DetailMoreRow] {
    guard let list = files.state.value, list.count > 1 else { return [] }
    return list.map { item in
      let label = itemLabel(item)
      let watched = viewer?.isWatched(item) ?? (item.progress?.completed ?? false)
      let left = isResuming(item) && !watched ? timeLeft(item) : nil
      let subtitle = [left ?? formatRuntime(runtimeMinutes(item)), fileInfo(item, tracks: nil)?.video]
        .compactMap(\.self).joined(separator: " · ")
      return DetailMoreRow(
        id: item.id, title: fileFolders(item) ?? label.title, subtitle: subtitle.isEmpty ? nil : subtitle,
        icon: .playOutline
      ) { nav.play(item.id, nil) }
    }
  }
}

/// The top of a title's page: its logo or name, the original name, the
/// facts and genres, the overview with a movie's file beside it, and the buttons.
private struct TitleHeader: View {
  let title: Title
  let next: MediaItem?
  let marks: DetailMarks
  let more: [DetailMoreRow]
  let memory: TVFocusMemory
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette

  var body: some View {
    HeaderColumn {
      TitleMark(title: title)
      if let original = title.originalName, original != title.name {
        Text(original).textStyle(.body).foregroundStyle(palette.mutedForeground).lineLimit(1)
      }
      DetailFacts(
        facts: titleFacts(title), contentRating: title.contentRating, rating: title.rating, flags: titleFlags(title)
      )
      .padding(.top, TVSpace.s4)
      if !title.genres.isEmpty {
        Text(title.genres.prefix(4).joined(separator: ", ")).textStyle(.label)
          .foregroundStyle(palette.mutedForeground).lineLimit(1)
          .padding(.top, TVSpace.s1)
      }
      // A movie's file. A show's differ by episode.
      DetailAbout(overview: title.overview, tagline: title.tagline, file: title.isShow ? nil : next)
        .padding(.top, TVSpace.s5)
      DetailActions(marks: marks, memory: memory, more: more, moreTitle: title.name, moreSubtitle: formatYear(title.year))
        .padding(.top, TVSpace.s7)
    }
  }
}

/// The title as its logo, or as its name when it has none or the logo won't load.
private struct TitleMark: View {
  let title: Title
  @Environment(\.api) private var api

  var body: some View {
    if let logo = logo {
      TVLogo(name: title.name, source: logo, width: 840, height: 200)
    } else {
      TVTitleLogo(title.name, style: .hero, width: 1440, height: 200)
    }
  }

  private var logo: ImageSource? {
    #if DEBUG
      if let url = TitleFixture.logo(title.summary) { return ImageSource(url: url) }
    #endif
    return api?.art(title.images.logo, size: .medium)
  }
}
