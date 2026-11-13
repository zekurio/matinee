import MatineeCore
import SwiftUI

/*
 * TitleScreens.kt: a movie's or show's page, a season's, and an episode's,
 * each over its backdrop with Back and Home floating on it. The type names
 * and parameters are the ones Nav.swift opens them with.
 */

/// Loading and failure for a page that shows nothing else until it has its data.
private struct PageState<T: Sendable, Content: View>: View {
  let loader: Loader<T>
  let error: String
  @ViewBuilder let content: (T) -> Content

  var body: some View {
    switch loader.state {
    case .loading:
      LoadingBox().frame(maxWidth: .infinity, maxHeight: .infinity).itemTopBar()
    case .failed(let message, let disconnected):
      VStack(spacing: 0) {
        // Under the floating Back and Home, as Android stacks them.
        Color.clear.frame(height: 56)
        ErrorBox(error, message, disconnected: disconnected, onRetry: loader.reload)
        Spacer(minLength: 0)
      }
      .itemTopBar()
    case .ready(let value):
      content(value)
    }
  }
}

/// A page's rows, over its backdrop, under the floating bar.
private struct ItemPage<Content: View>: View {
  var spacing: CGFloat = 20
  var parent: String?
  var onParent: (() -> Void)?
  @ViewBuilder let content: () -> Content

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: spacing) { content() }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 32)
    }
    .ignoresSafeArea(edges: .top)
    .statusBarScrim()
    .itemTopBar(parent: parent, onParent: onParent)
  }
}

/// A movie's or show's page.
struct TitleScreen: View {
  let id: String
  @State private var loader = Loader<Title>()

  var body: some View {
    PageState(loader: loader, error: Str.titleLoadError) { TitlePage(title: shown($0)) }
      .loads(loader) { [id] api in try await api.titles.get(id: id) }
  }
}

private struct TitlePage: View {
  let title: Title
  @Environment(\.api) private var api
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.windowSize) private var window

  var body: some View {
    let summary = title.summary
    let next = title.next
    let wide = isWide(window)
    // One season, so no specials either: its episodes go right on the show's page.
    let only = title.seasons.count == 1 ? title.seasons.first : nil
    ItemPage(spacing: 24) {
      ZStack(alignment: .topLeading) {
        Backdrop(
          [api?.art(title.images.backdrop, size: .large), next.flatMap { api?.frame($0.id, large: true) }],
          toneKey: title.name)
        // Phones leave the poster out, for the name to have the width; seasons keep theirs.
        TitleHeading(title: title, flags: title.isShow ? [] : next.map(mediaFlags) ?? [], poster: wide)
          .padding(.top, wide ? headingTop(window) : phoneHeadingTop(window))
      }
      if let overview = title.overview {
        Overview(overview, tagline: title.tagline).padding(.horizontal, Gutter)
      }
      CrewLines(credits: title.credits, studios: title.studios)
      // A movie's file: its picture, audio, and subtitles. A show's differ by episode.
      if !title.isShow, let next {
        MediaInfo(next).padding(.horizontal, Gutter)
      }
      ActionRow(
        play: next, resume: isResumable(next), name: title.name,
        watched: viewer?.isWatched(summary) ?? title.watched, favorite: viewer?.isFavorite(summary) ?? title.favorite,
        trailer: preferredTrailer(title.trailers, language: Locale.app.identifier),
        onWatched: { watched, at in
          guard let api, let viewer else { return }
          try await viewer.setWatched(api, summary, watched, watchedAt: at)
        },
        onFavorite: {
          guard let api, let viewer else { return }
          try await viewer.setFavorite(api, summary, !viewer.isFavorite(summary))
        },
        more: .title(summary, file: title.isShow ? nil : next, here: true))
      if title.isShow {
        if let next, showsNextUp(title) {
          NextUpEpisode(item: shown(next))
        }
        if let only {
          SeasonEpisodesRail(title: title, season: only, next: next)
        } else {
          SeasonsRail(title: title)
        }
      }
      CastRail(credits: title.credits)
    }
  }
}

/// A season's episodes as a row of stills, starting at the one up next.
private struct SeasonEpisodesRail: View {
  let title: Title
  let season: Season
  let next: MediaItem?
  @State private var items = Loader<[MediaItem]>()

  var body: some View {
    Group {
      if let list = items.state.value {
        VStack(alignment: .leading, spacing: 12) {
          SectionTitle(Str.titleEpisodes).padding(.horizontal, Gutter)
          ScrollView(.horizontal) {
            LazyHStack(alignment: .top, spacing: 12) {
              ForEach(list, id: \.id) { item in
                RailItem(.landscape) { EpisodeCard(shown(item), showName: false) }.id(item.id)
              }
            }
            .scrollTargetLayout()
          }
          .contentMargins(.horizontal, Gutter, for: .scrollContent)
          .scrollIndicators(.hidden)
          .scrollTargetBehavior(.viewAligned)
          .defaultScrollAnchor(.leading)
          .scrollPosition(id: .constant(list.contains { $0.id == next?.id } ? next?.id : nil), anchor: .leading)
        }
      } else {
        Color.clear.frame(height: 0)
      }
    }
    .loads(items) { [id = title.id, number = season.number] api in try await seasonItems(api, id, number) }
  }
}

/// A show's season; `season` is nil for the files without a season number.
struct SeasonScreen: View {
  let titleId: String
  let season: Int?
  @State private var loader = Loader<Title>()

  var body: some View {
    PageState(loader: loader, error: Str.titleSeasonShowError) { title in
      let title = shown(title)
      if let current = title.seasons.first(where: { $0.number == season }) {
        SeasonPage(title: title, season: current)
      } else {
        VStack(spacing: 0) {
          Color.clear.frame(height: 56)
          ErrorBox(Str.titleSeasonMissing(title.name))
          Spacer(minLength: 0)
        }
        .itemTopBar()
      }
    }
    .loads(loader) { [titleId] api in try await api.titles.get(id: titleId) }
  }
}

private struct SeasonPage: View {
  let title: Title
  let season: Season
  @State private var items = Loader<[MediaItem]>()
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.windowSize) private var window
  @Environment(\.palette) private var palette

  var body: some View {
    let list = items.state.value
    let isWatched = { (item: MediaItem) in viewer?.isWatched(item) ?? (item.progress?.completed ?? false) }
    let next = seasonNext(list, isWatched: isWatched)
    let summary = title.summary
    let name = seasonName(season.number)
    ItemPage(parent: title.name, onParent: { nav.titleUp(title.id) }) {
      ZStack(alignment: .topLeading) {
        Backdrop([api?.art(title.images.backdrop, size: .large)], toneKey: title.name)
        HStack(alignment: .bottom, spacing: 16) {
          PosterArt(name: name, poster: api?.art(season.poster ?? title.images.poster))
            .frame(width: isWide(window) ? 180 : 112)
          VStack(alignment: .leading, spacing: 0) {
            Button { nav.titleUp(title.id) } label: {
              Text(title.name).textStyle(.titleMedium).foregroundStyle(palette.muted).multilineTextAlignment(.leading)
            }
            .buttonStyle(RoundPress())
            Text(name).textStyle(.headlineLarge).foregroundStyle(palette.foreground).accessibilityAddTraits(.isHeader)
            Text(
              [Str.mediaEpisodeCount(season.itemCount), Str.titleSeasonWatchedCount(season.watchedCount)]
                .joined(separator: " · ")
            )
            .textStyle(.bodyMedium)
            .foregroundStyle(palette.foreground.opacity(0.8))
            .padding(.top, 6)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.bottom, 4)
        }
        .padding(.horizontal, Gutter)
        .padding(.top, headingTop(window))
      }
      if let overview = season.overview {
        Overview(overview).padding(.horizontal, Gutter)
      }
      ActionRow(
        play: next, resume: isResumable(next), name: "\(title.name) · \(name)",
        watched: seasonWatched(list, isWatched: isWatched),
        favorite: viewer?.isFavorite(summary) ?? title.favorite,
        onWatched: { watched, at in
          guard let api, let viewer else { return }
          try await setSeasonWatched(api, viewer, summary, season: season.number, watched: watched, watchedAt: at)
        },
        onFavorite: {
          guard let api, let viewer else { return }
          try await viewer.setFavorite(api, summary, !viewer.isFavorite(summary))
        },
        more: .season(summary, season, here: true))
      SectionTitle(Str.titleEpisodes).padding(.horizontal, Gutter)
      switch items.state {
      case .loading:
        LoadingBox().padding(32)
      case .failed(let message, _):
        Text(Str.titleEpisodesError(message)).textStyle(.bodyMedium).foregroundStyle(palette.muted)
          .padding(.horizontal, Gutter)
      case .ready(let episodes):
        VStack(spacing: 4) {
          ForEach(episodes, id: \.id) { EpisodeRow(shown($0)) }
        }
        .padding(.horizontal, Gutter)
      }
      SeasonsRail(title: title, current: season)
    }
    .loads(items) { [id = title.id, number = season.number] api in try await seasonItems(api, id, number) }
  }
}

/// An episode's page, or any file's that isn't a movie.
struct EpisodeScreen: View {
  let itemId: String
  @State private var loader = Loader<MediaItem>()

  var body: some View {
    PageState(loader: loader, error: Str.titleEpisodeLoadError) { EpisodePage(item: shown($0)) }
      .loads(loader) { [itemId] api in try await api.media.get(id: itemId) }
  }
}

private struct EpisodePage: View {
  let item: MediaItem
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.windowSize) private var window

  var body: some View {
    let label = itemLabel(item)
    let title = item.title
    let season = item.seasonNumber
    let watched = viewer?.isWatched(item) ?? (item.progress?.completed ?? false)
    // On a phone the still is the backdrop, with the heading on it, and
    // isn't shown again; wider, the show's art is, with the still on it.
    let wide = isWide(window)
    let show = [api?.art(title?.images.backdrop, size: .large)]
    let still = [api?.art(item.episode?.still, size: .large), api?.frame(item.id, large: true)]
    ItemPage(
      parent: title == nil ? nil : season.map(seasonName) ?? label.showName,
      onParent: title.map { title in
        { if let season { nav.seasonUp(title.id, season) } else { nav.titleUp(title.id) } }
      }
    ) {
      ZStack(alignment: .topLeading) {
        Backdrop(wide ? show + still : still + show, toneKey: label.showName)
        if wide {
          // As high as the web starts it, so the season's other episodes make the first screen too.
          StillFrame(item: item, watched: watched).padding(.top, max(112, window.height * 0.2))
        } else {
          EpisodeHeading(item: item).padding(.top, phoneHeadingTop(window))
        }
      }
      if wide { EpisodeHeading(item: item) }
      if let overview = item.episode?.overview {
        Overview(overview, lines: 6).padding(.horizontal, Gutter)
      }
      ActionRow(
        play: item, resume: isResumable(item), name: label.title, watched: watched,
        favorite: viewer?.isFavorite(item) ?? item.favorite,
        onWatched: { watched, at in
          guard let api, let viewer else { return }
          try await viewer.setWatched(api, item, watched, watchedAt: at)
        },
        onFavorite: {
          guard let api, let viewer else { return }
          try await viewer.setFavorite(api, item, !viewer.isFavorite(item))
        },
        more: .item(item, here: true))
      if let title {
        MoreFromSeason(item: item, titleId: title.id)
      }
    }
  }
}

/// An episode's show, season and number, name, facts, and file, as the web's episode header has them.
private struct EpisodeHeading: View {
  let item: MediaItem
  @Environment(\.navigator) private var nav
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.palette) private var palette

  var body: some View {
    let label = itemLabel(item)
    let title = item.title
    let season = item.seasonNumber
    let watched = viewer?.isWatched(item) ?? (item.progress?.completed ?? false)
    VStack(alignment: .leading, spacing: 0) {
      link(title.map { title in { nav.titleUp(title.id) } }) {
        Text(label.showName).textStyle(.titleLarge).foregroundStyle(palette.foreground)
      }
      let place = [
        season.map { $0 == 0 ? Str.titleEpisodeSpecials : Str.titleEpisodeSeason($0) },
        item.episodeNumber.map(Str.titleEpisodeNumber),
      ].compactMap(\.self).joined(separator: " · ")
      if !place.isEmpty {
        link(title.map { title in { nav.seasonUp(title.id, season) } }) {
          Text(place).textStyle(.titleMedium).foregroundStyle(palette.muted)
        }
      }
      Text(label.title).textStyle(.headlineLarge).lineLimit(3).foregroundStyle(palette.foreground)
        .accessibilityAddTraits(.isHeader)
        .padding(.top, 6)
      let facts = episodeFacts(item, watched: watched).joined(separator: " · ")
      let rating = title?.contentRating
      if !facts.isEmpty || rating != nil {
        HStack(spacing: 10) {
          if !facts.isEmpty {
            Text(facts).textStyle(.bodyMedium).foregroundStyle(palette.foreground.opacity(0.8))
          }
          if let rating { Badge(rating, outlined: true) }
        }
        .padding(.top, 10)
      }
      MediaInfo(item).padding(.top, 12)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, Gutter)
  }

  /// `content`, opening a page when there's one to open.
  @ViewBuilder private func link(_ action: (() -> Void)?, @ViewBuilder content: () -> some View) -> some View {
    if let action {
      Button(action: action) { content().multilineTextAlignment(.leading) }.buttonStyle(RoundPress())
    } else {
      content()
    }
  }
}

/// The season's other episodes, under one's page.
private struct MoreFromSeason: View {
  let item: MediaItem
  let titleId: String
  @State private var items = Loader<[MediaItem]>()
  @Environment(\.navigator) private var nav

  var body: some View {
    let season = item.seasonNumber
    let others = items.state.value?.filter { $0.id != item.id } ?? []
    Group {
      if others.isEmpty {
        Color.clear.frame(height: 0)
      } else {
        Rail(Str.titleEpisodeMoreFrom(seasonName(season)), onTitleTap: { nav.seasonUp(titleId, season) }) {
          ForEach(others, id: \.id) { other in
            RailItem(.landscape) { EpisodeCard(shown(other), showName: false) }
          }
        }
      }
    }
    .loads(items) { [titleId] api in try await seasonItems(api, titleId, season) }
  }
}
