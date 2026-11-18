import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TitleScreens.kt, after the web's title-page.tsx, season-page.tsx, and
 * episodes.$itemId.tsx: a movie's or show's page, a season's, and an
 * episode's, each over its art with Back and Home floating on it
 * (`ItemTopBar`). The type names and parameters are the ones Nav.swift
 * opens them with. The pieces are TitleParts.swift's, the show's gaps
 * ShowGaps.swift's, and what the pages decide MatineeCore's (Title/).
 */

// MARK: Frame

/// Loading and failure for a page that shows nothing else until it has its
/// data, under Back and Home.
private struct PageState<T: Sendable, Content: View>: View {
  let loader: Loader<T>
  let error: String
  @ViewBuilder let content: (T) -> Content

  var body: some View {
    switch loader.state {
    case .loading:
      LoadingBox().overlay(alignment: .top) { ItemTopBar() }
    case .failed(let message, let disconnected):
      ErrorBox(error, message, disconnected: disconnected, onRetry: loader.reload)
        .overlay(alignment: .top) { ItemTopBar() }
    case .ready(let value):
      content(value)
    }
  }
}

/// A page's sections over its art, under Back, Home, and the page above,
/// which stay while it scrolls; the cloud beside them while `stale` shows
/// what loaded before and the server can't be reached. A pull fetches
/// `stale` again.
private struct ItemPage<Content: View>: View {
  let spacing: CGFloat
  var parent: String?
  var onParent: (() -> Void)?
  var stale: [any Reloadable] = []
  @ViewBuilder let content: () -> Content

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: spacing) { content() }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, Space.s10)
    }
    .ignoresSafeArea(edges: .top)
    .refreshable {
      stale.forEach { $0.reload() }
      // Long enough for the spinner to mean something; the loaders settle on their own.
      try? await Task.sleep(for: .milliseconds(600))
    }
    .overlay(alignment: .top) { ItemTopBar(parent: parent, onParent: onParent) }
    .overlay(alignment: .topTrailing) {
      DisconnectedAction(stale).padding(.horizontal, Space.s2).padding(.vertical, Space.s1_5 + 2)
    }
  }
}

// MARK: Title

/// A movie's or show's page.
struct TitleScreen: View {
  let id: String
  @State private var loader = Loader<Title>()

  var body: some View {
    PageState(loader: loader, error: Str.titleLoadError) { TitlePage(title: $0, loader: loader) }
      .loads(loader) { [id] api in try await api.titles.get(id: id) }
      .hidesSystemNavigationBar()
  }
}

private struct TitlePage: View {
  let title: Title
  let loader: Loader<Title>
  @State private var gaps = TitleGaps()
  @Environment(\.api) private var api
  @Environment(\.windowSize) private var window

  var body: some View {
    let layout = TitleLayout(window: window)
    let next = title.next
    ItemPage(spacing: layout.sectionSpacing, stale: [loader]) {
      TitleHeader(title: title, layout: layout)
      if title.isShow {
        if let next, showsNextUp(title) {
          NextUpEpisode(item: next)
        }
        if let only = inlineSeason(title) {
          // One season, so no specials either: its episodes go right on the show's page.
          InlineEpisodes(title: title, season: only, gaps: gaps)
          SeasonsRail(title: title, gaps: gaps, extraOnly: true)
        } else {
          SeasonsRail(title: title, gaps: gaps)
        }
      }
      CastRail(credits: title.credits)
    }
    .task(id: title.id) {
      guard let api else { return }
      await gaps.load(api, title: title) { loader.reload() }
    }
    .onDisappear { gaps.hide() }
  }
}

/// The top of a title's page: its backdrop across the window, and over its
/// faded end the name, facts, description, makers, file, and buttons; from
/// `sm` up beside its poster, with the buttons level with the poster's foot.
private struct TitleHeader: View {
  let title: Title
  let layout: TitleLayout
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.gutter) private var gutter
  @Environment(\.palette) private var palette

  var body: some View {
    // Without a backdrop, a frame of what Play starts, as Android's; then the poster, blurred.
    let sources = [api?.art(title.images.backdrop, size: .large), title.next.flatMap { api?.frame($0.id, large: true) }]
      .compactMap(\.self)
    ZStack(alignment: .topLeading) {
      Backdrop(
        sources: sources, blurred: api?.art(title.images.poster), toneKey: title.name,
        height: layout.backdropHeight(), wide: layout.wide
      )
      .ignoresSafeArea(edges: .horizontal)
      Group {
        if layout.wide {
          HStack(alignment: .top, spacing: Space.s8) {
            HeaderPoster(name: title.name, poster: api?.art(title.images.poster, size: .medium))
              .frame(width: layout.posterWidth)
            VStack(alignment: .leading, spacing: 0) {
              heading
              details.padding(.top, Space.s4)
              Spacer(minLength: 0)
              actions.padding(.top, Space.s6)
            }
            .frame(minHeight: layout.posterWidth * 1.5, alignment: .top)
          }
        } else {
          // Phones leave the poster out, for the name to have the width.
          VStack(alignment: .leading, spacing: Space.s5) {
            heading
            VStack(alignment: .leading, spacing: 0) {
              details
              actions.padding(.top, Space.s6)
            }
          }
        }
      }
      .padding(.top, layout.headingTop())
      .padding(.horizontal, gutter)
    }
  }

  private var heading: some View {
    VStack(alignment: .leading, spacing: 0) {
      // The name in words on a phone and wider alike, as Android's; never the provider's logo.
      HeadingMark(name: title.name, size: layout.nameSize, weight: layout.nameWeight)
      if let original = title.originalName, original != title.name {
        Text(original).textStyle(.sm).foregroundStyle(palette.mutedForeground).lineLimit(1).padding(.top, Space.s1)
      }
      FactsRow(facts: titleFacts(title))
        .padding(.top, layout.wide ? Space.s3 : Space.s2)
      // The rating and the file's badges on a line of their own, as Android's,
      // so a narrow screen doesn't strand the last one under the facts.
      RatingBadges(contentRating: title.contentRating, rating: title.rating, flags: titleFlags(title))
        .padding(.top, Space.s1_5)
      if !title.genres.isEmpty {
        LinkedNames(names: Array(title.genres.prefix(4)), sentence: false, color: palette.mutedForeground, onTap: nav.genre)
          .padding(.top, Space.s1_5)
      }
    }
  }

  private var details: some View {
    VStack(alignment: .leading, spacing: Space.s4) {
      if let overview = title.overview {
        Overview(text: overview, tagline: title.tagline, size: layout.overviewSize)
      }
      CrewLines(credits: title.credits, studios: Array(title.studios.prefix(2)))
      // A movie's file. A show's differ by episode.
      if !title.isShow, let next = title.next {
        MediaInfo(next)
      }
    }
  }

  private var actions: some View {
    TitleActions(title: title, wide: layout.wide)
  }
}

/// A title's buttons. A movie's several files, as a director's cut beside
/// the film, are in its sheet, each to play or download on its own.
private struct TitleActions: View {
  let title: Title
  let wide: Bool
  @Environment(\.api) private var api
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    let summary = title.summary
    let next = title.next
    ActionRow(
      play: next, name: title.name, watched: viewer?.isWatched(summary) ?? title.watched,
      favorite: viewer?.isFavorite(summary) ?? title.favorite,
      trailer: preferredTrailer(title.trailers, language: Locale.app.identifier),
      onWatched: onWatched, onFavorite: onFavorite,
      more: .title(summary, file: title.isShow ? nil : next, here: true, severalFiles: showsFiles(title)), wide: wide)
  }

  // Outside the body, with their types written out: Xcode 26's compiler
  // gives up on the body when it has to work these out inside the call.
  private var onWatched: ((_ watched: Bool, _ watchedAt: String?) async throws -> Void)? {
    guard title.itemCount != 0 else { return nil }
    let summary = title.summary
    return { [api, viewer] watched, at in
      guard let api, let viewer else { return }
      try await viewer.setWatched(api, summary, watched, watchedAt: at)
    }
  }

  private var onFavorite: (() async throws -> Void)? {
    let summary = title.summary
    return { [api, viewer] in
      guard let api, let viewer else { return }
      try await viewer.setFavorite(api, summary, !viewer.isFavorite(summary))
    }
  }
}

/// A one-season show's episodes on its own page, as a row starting on the
/// one up next, ending with the ask for the rest when only some are here.
private struct InlineEpisodes: View {
  let title: Title
  let season: Season
  let gaps: TitleGaps
  @State private var items = Loader<[MediaItem]>()
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    Group {
      switch items.state {
      case .loading: RailSkeleton(title: Str.titleEpisodes, art: .landscape)
      case .failed(_, let disconnected):
        RailFailed(title: Str.titleEpisodes, retrying: items.refreshing, disconnected: disconnected, onRetry: items.reload)
      case .ready(let list):
        let start = seasonPlay(title, list) { viewer?.isWatched($0) ?? ($0.progress?.completed ?? false) }
        let partial = gaps.partial(season.number)
        EpisodesRail(
          title: Str.titleEpisodes, items: list, start: episodeRailStart(list, next: start),
          rest: partial.map { AnyView(SeasonRestCard(title: title, season: $0, gaps: gaps)) })
      }
    }
    .loads(items) { [id = title.id, number = season.number] api in try await seasonItems(api, id, number) }
  }
}

// MARK: Season

/// A show's season; `season` is nil for the files without a season number.
struct SeasonScreen: View {
  let titleId: String
  let season: Int?
  @State private var loader = Loader<Title>()
  /// Asked for alongside the title rather than after it.
  @State private var items = Loader<[MediaItem]>()

  var body: some View {
    PageState(loader: loader, error: Str.titleSeasonShowError) { title in
      // Hidden specials still open from a link.
      if let current = titleSeason(title, number: season) {
        SeasonPage(title: title, season: current, loader: loader, items: items)
      } else {
        ErrorBox(Str.titleSeasonMissing(title.name)).overlay(alignment: .top) { ItemTopBar() }
      }
    }
    .loads(loader) { [titleId] api in try await api.titles.get(id: titleId) }
    .loads(items) { [titleId, season] api in try await seasonItems(api, titleId, season) }
    .hidesSystemNavigationBar()
  }
}

private struct SeasonPage: View {
  let title: Title
  let season: Season
  let loader: Loader<Title>
  let items: Loader<[MediaItem]>
  @State private var gaps = TitleGaps()
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.gutter) private var gutter
  @Environment(\.windowSize) private var window

  var body: some View {
    let layout = TitleLayout(window: window)
    ItemPage(spacing: layout.sectionSpacing, parent: title.name, onParent: { nav.titleUp(title.id) }, stale: [loader, items]) {
      SeasonHeader(title: title, season: season, items: items.state.value, layout: layout)
      SeasonEpisodes(title: title, season: season, items: items, gaps: gaps)
      SeasonsRail(title: title, current: season, gaps: gaps)
    }
    .task(id: title.id) {
      guard let api else { return }
      await gaps.load(api, title: title) { loader.reload() }
    }
    .onDisappear { gaps.hide() }
  }
}

/// The top of a season's page, laid out as the show's: the show's backdrop,
/// the season's poster, the show's name over the season's, and Play.
private struct SeasonHeader: View {
  let title: Title
  let season: Season
  let items: [MediaItem]?
  let layout: TitleLayout
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.gutter) private var gutter
  @Environment(\.palette) private var palette

  var body: some View {
    let poster = season.poster ?? title.images.poster
    let name = Str.titleSeasonOf(title.name, seasonName(season.number))
    // Without a backdrop, a frame of the season's episode up next, as the show's page has one.
    let up = items?.first { $0.id == title.next?.id } ?? items?.first
    let sources = [api?.art(title.images.backdrop, size: .large), up.flatMap { api?.frame($0.id, large: true) }]
    ZStack(alignment: .topLeading) {
      Backdrop(
        sources: sources.compactMap(\.self), blurred: api?.art(poster),
        toneKey: title.name, height: layout.backdropHeight(), wide: layout.wide
      )
      .ignoresSafeArea(edges: .horizontal)
      Group {
        if layout.wide {
          HStack(alignment: .top, spacing: Space.s8) {
            HeaderPoster(name: name, poster: api?.art(poster, size: .medium)).frame(width: layout.posterWidth)
            VStack(alignment: .leading, spacing: 0) {
              heading
              details.padding(.top, Space.s4)
              Spacer(minLength: 0)
              SeasonActions(title: title, season: season, items: items, wide: true).padding(.top, Space.s6)
            }
            .frame(minHeight: layout.posterWidth * 1.5, alignment: .top)
          }
        } else {
          // A phone's small poster beside the names, and the rest under both.
          VStack(alignment: .leading, spacing: Space.s5) {
            HStack(alignment: .bottom, spacing: Space.s4) {
              // The season alone: the show's name over it is beside the poster already.
              HeaderPoster(name: seasonName(season.number), poster: api?.art(poster)).frame(width: layout.posterWidth)
              heading.frame(maxWidth: .infinity, alignment: .leading)
            }
            VStack(alignment: .leading, spacing: 0) {
              details
              SeasonActions(title: title, season: season, items: items, wide: false).padding(.top, Space.s6)
            }
          }
        }
      }
      .padding(.top, layout.headingTop(season: true))
      .padding(.horizontal, gutter)
    }
  }

  private var heading: some View {
    VStack(alignment: .leading, spacing: Space.s1) {
      Pressable(shape: .kit(Radius.sm), wash: false, action: { nav.titleUp(title.id) }) {
        // The show's name over the season's, muted, as Android's `titleMedium`.
        Text(title.name)
          .textStyle(layout.wide ? .xl2 : .base, weight: .semibold, tracking: layout.wide ? .tight : .normal)
          .foregroundStyle(layout.wide ? palette.foreground.opacity(0.85) : palette.mutedForeground)
          .lineLimit(2)
          .multilineTextAlignment(.leading)
      }
      Text(seasonName(season.number))
        .textStyle(layout.nameSize, weight: layout.nameWeight, tracking: .tight)
        .foregroundStyle(palette.foreground)
        .lineLimit(2)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
      // The counts alone, as Android's season heading has them.
      FactsRow(facts: seasonFacts(season, items: items))
        .padding(.top, Space.s2)
    }
  }

  @ViewBuilder private var details: some View {
    VStack(alignment: .leading, spacing: Space.s4) {
      if let overview = season.overview {
        Overview(text: overview, size: layout.overviewSize)
      }
      if isHiddenSpecials(title, season) {
        SpecialsNote()
      }
    }
  }
}

/// A season's buttons: Play what's next in it, the tick for every episode,
/// the season's heart, and its sheet.
private struct SeasonActions: View {
  let title: Title
  let season: Season
  let items: [MediaItem]?
  let wide: Bool
  @Environment(\.api) private var api
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    let summary = title.summary
    let isWatched = { (item: MediaItem) in viewer?.isWatched(item) ?? (item.progress?.completed ?? false) }
    // Until the episodes load, the season's counts say.
    let watched =
      items.map { seasonWatched($0, isWatched: isWatched) }
      ?? (season.itemCount > 0 && season.watchedCount >= season.itemCount)
    let number = season.number
    ActionRow(
      play: seasonPlay(title, items, isWatched: isWatched),
      name: Str.titleSeasonOf(title.name, seasonName(number)), watched: watched,
      favorite: number.map { viewer?.isSeasonFavorite(summary, number: $0, fallback: season.favorite) ?? season.favorite }
        ?? false,
      onWatched: { watched, at in
        guard let api, let viewer else { return }
        try await setSeasonWatched(api, viewer, summary, season: number, watched: watched, watchedAt: at)
      },
      // The files without a season number aren't a season to mark.
      onFavorite: number.map { number in
        {
          guard let api, let viewer else { return }
          let on = viewer.isSeasonFavorite(summary, number: number, fallback: season.favorite)
          try await viewer.setSeasonFavorite(api, summary, number: number, favorite: !on)
        }
      },
      more: .season(summary, season, here: true), wide: wide)
  }
}

/// A season's episodes, a row each, the one Play starts marked, then the
/// ask for the rest when only some are here.
private struct SeasonEpisodes: View {
  let title: Title
  let season: Season
  let items: Loader<[MediaItem]>
  let gaps: TitleGaps
  @Environment(\.gutter) private var gutter
  @Environment(\.windowSize) private var window
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    let wide = TitleLayout(window: window).wide
    VStack(alignment: .leading, spacing: Space.s3) {
      SectionTitle(Str.titleEpisodes)
      switch items.state {
      case .loading:
        VStack(alignment: .leading, spacing: Space.s5) {
          ForEach(0..<3, id: \.self) { _ in EntrySkeleton() }
        }
      case .failed(let message, let disconnected):
        ErrorSection(
          Str.titleEpisodesFailed, message, retrying: items.refreshing, disconnected: disconnected,
          onRetry: items.reload)
      case .ready(let list):
        let up = seasonPlay(title, list) { viewer?.isWatched($0) ?? ($0.progress?.completed ?? false) }
        LazyVStack(alignment: .leading, spacing: wide ? Space.s6 : Space.s5) {
          ForEach(list, id: \.id) { item in
            EpisodeEntry(item: item, compact: true, marker: marker(item, up: up))
          }
          if let partial = gaps.partial(season.number) {
            SeasonRestCard(title: title, season: partial, gaps: gaps).frame(maxWidth: 320)
          }
        }
        .frame(maxWidth: 1024, alignment: .leading)
      }
    }
    .padding(.horizontal, gutter)
  }

  /// Play's episode is named so, once the season has more than it.
  private func marker(_ item: MediaItem, up: MediaItem?) -> String? {
    guard item.id == up?.id, let list = items.state.value, list.count > 1 else { return nil }
    return isResuming(item) ? Str.titleNextUpContinue : Str.titleNextUpNext
  }
}

/// An episode row's place while the season loads.
private struct EntrySkeleton: View {
  @Environment(\.windowSize) private var window

  var body: some View {
    let wide = TitleLayout(window: window).wide
    HStack(alignment: .top, spacing: Space.s3) {
      Skeleton(radius: Radius.md).aspectRatio(16 / 9, contentMode: .fit).frame(width: wide ? 256 : 152)
      VStack(alignment: .leading, spacing: Space.s2) {
        Skeleton(radius: Radius.sm).frame(width: 140, height: 14)
        Skeleton(radius: Radius.sm).frame(width: 90, height: 12)
      }
      .padding(.top, Space.s1)
    }
    .accessibilityHidden(true)
  }
}

/// On a page of specials the account hides from the show's seasons, which
/// still opens from a link: the switch to show them with the seasons
/// again, for every device of the account, as Settings has it.
private struct SpecialsNote: View {
  @State private var on = false
  @State private var saving = false
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar
  @Environment(MatineeSession.self) private var session
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    ListBlock {
      SwitchRow(Str.playbackSpecialsTitle, icon: .eye, isOn: Binding(get: { on }, set: { save($0) }))
        .disabled(saving)
    }
    .frame(maxWidth: 480)
  }

  private func save(_ show: Bool) {
    guard let api, !saving else { return }
    on = show
    saving = true
    let session = session
    let viewer = viewer
    launchShowing(snackbar, Str.playbackSpecialsFailed) {
      defer { saving = false }
      do {
        try await setShowSpecials(api, show) { session.updateUser(user: $0) }
        // The show's seasons are the server's to say again.
        viewer?.changed()
      } catch {
        on = !show
        throw error
      }
    }
  }
}

// MARK: Episode

/// An episode's page, or any file's that isn't a movie.
struct EpisodeScreen: View {
  let itemId: String
  @State private var loader = Loader<MediaItem>()

  var body: some View {
    PageState(loader: loader, error: Str.titleEpisodeLoadError) { EpisodePage(item: $0, loader: loader) }
      .loads(loader) { [itemId] api in try await api.media.get(id: itemId) }
      .hidesSystemNavigationBar()
  }
}

private struct EpisodePage: View {
  let item: MediaItem
  let loader: Loader<MediaItem>
  @Environment(\.navigator) private var nav
  @Environment(\.windowSize) private var window

  var body: some View {
    let layout = TitleLayout(window: window)
    let label = itemLabel(item)
    let title = item.title
    let season = item.seasonNumber
    ItemPage(
      spacing: layout.wide ? Space.s10 : Space.s8,
      parent: title == nil ? nil : season.map(seasonName) ?? label.showName,
      onParent: title.map { title in
        { if let season { nav.seasonUp(title.id, season) } else { nav.titleUp(title.id) } }
      },
      stale: [loader]
    ) {
      EpisodeHeader(item: item, layout: layout)
      if let title {
        MoreFromSeason(item: item, titleId: title.id)
      }
    }
  }
}

/// The whole top of an episode's page: on a phone its still as the art,
/// with the details over its faded end; wider, the show's art, with the
/// still beside the details, which plays it.
private struct EpisodeHeader: View {
  let item: MediaItem
  let layout: TitleLayout
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.gutter) private var gutter
  @Environment(\.palette) private var palette
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    let label = itemLabel(item)
    let watched = viewer?.isWatched(item) ?? (item.progress?.completed ?? false)
    let show = [api?.art(item.title?.images.backdrop, size: .large)]
    let still = [api?.art(item.episode?.still, size: .large), api?.frame(item.id, large: true)]
    ZStack(alignment: .topLeading) {
      Backdrop(
        sources: (layout.wide ? show + still : still + show).compactMap(\.self), toneKey: label.showName,
        height: layout.backdropHeight(episode: true), shade: .episode, wide: layout.wide
      )
      .ignoresSafeArea(edges: .horizontal)
      Group {
        if layout.wide {
          HStack(alignment: .top, spacing: Space.s8) {
            StillFrame(item: item, watched: watched).frame(width: layout.stillWidth)
            VStack(alignment: .leading, spacing: 0) {
              heading(watched: watched)
              details.padding(.top, Space.s4)
              Spacer(minLength: 0)
              actions(watched: watched).padding(.top, Space.s6)
            }
            .frame(minHeight: layout.stillWidth * 9 / 16, alignment: .top)
          }
        } else {
          VStack(alignment: .leading, spacing: Space.s4) {
            heading(watched: watched)
            details
            actions(watched: watched).padding(.top, Space.s2)
          }
        }
      }
      .padding(.top, layout.headingTop(episode: true))
      .padding(.horizontal, gutter)
    }
  }

  /// The show, which opens its page; the season and number, the season
  /// opening its; then the episode's name and facts.
  private func heading(watched: Bool) -> some View {
    let label = itemLabel(item)
    let title = item.title
    let season = item.seasonNumber
    return VStack(alignment: .leading, spacing: 0) {
      link(title.map { title in { nav.titleUp(title.id) } }) {
        Text(label.showName)
          .textStyle(layout.wide ? .xl2 : .xl, weight: .semibold, tracking: .tight)
          .foregroundStyle(palette.foreground)
          .lineLimit(2)
      }
      if let season, let number = item.episodeNumber {
        HStack(spacing: 0) {
          link(title.map { title in { nav.seasonUp(title.id, season) } }) {
            Text(season == 0 ? Str.titleEpisodeSpecials : Str.titleEpisodeSeason(season))
          }
          Text(" · \(Str.titleEpisodeNumber(number))")
        }
        // Under the show's name, muted, as Android's `titleMedium`.
        .textStyle(layout.wide ? .lg : .base, weight: layout.wide ? .medium : .semibold)
        .monospacedDigit()
        .foregroundStyle(layout.wide ? palette.foreground.opacity(0.8) : palette.mutedForeground)
        .padding(.top, Space.s1)
      }
      Text(label.title)
        .textStyle(layout.nameSize, weight: layout.nameWeight, tracking: .tight)
        .foregroundStyle(palette.foreground)
        .lineLimit(3)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
        .padding(.top, Space.s1_5)
      FactsRow(facts: episodeFacts(item, watched: watched), contentRating: title?.contentRating)
        .padding(.top, Space.s3)
    }
  }

  /// What happens and the file; on a phone the file first, under the facts,
  /// as Android's heading has it, and wider after, as the web's.
  private var details: some View {
    VStack(alignment: .leading, spacing: Space.s4) {
      if !layout.wide { MediaInfo(item) }
      if let overview = item.episode?.overview {
        // Six lines of it, as Android's.
        Overview(text: overview, lines: 6, size: layout.overviewSize)
      }
      if layout.wide { MediaInfo(item) }
    }
  }

  private func actions(watched: Bool) -> some View {
    let label = itemLabel(item)
    return ActionRow(
      play: item, name: label.title, watched: watched, favorite: viewer?.isFavorite(item) ?? item.favorite,
      onWatched: { watched, at in
        guard let api, let viewer else { return }
        try await viewer.setWatched(api, item, watched, watchedAt: at)
      },
      onFavorite: {
        guard let api, let viewer else { return }
        try await viewer.setFavorite(api, item, !viewer.isFavorite(item))
      },
      more: .item(item, here: true), wide: layout.wide)
  }

  /// `content`, opening a page when there's one to open.
  @ViewBuilder private func link<C: View>(_ action: (() -> Void)?, @ViewBuilder content: @escaping () -> C)
    -> some View
  {
    if let action {
      Pressable(shape: .kit(Radius.sm), wash: false, action: action) {
        content().multilineTextAlignment(.leading)
      }
    } else {
      content()
    }
  }
}

/// The rest of the episode's season, as a row that starts on the episode
/// before this one, so the next follows it.
private struct MoreFromSeason: View {
  let item: MediaItem
  let titleId: String
  @State private var items = Loader<[MediaItem]>()
  @Environment(\.navigator) private var nav

  var body: some View {
    let season = item.seasonNumber
    Group {
      if let list = items.state.value {
        let others = list.filter { $0.id != item.id }
        if !others.isEmpty {
          EpisodesRail(
            title: Str.titleEpisodeMoreFrom(seasonName(season)), items: others,
            start: moreFromSeasonStart(list, current: item.id), onTitleTap: { nav.seasonUp(titleId, season) })
          // A new episode starts the row over.
          .id(item.id)
        }
      } else {
        // Something to show, so the row loads.
        Color.clear.frame(height: 0)
      }
    }
    .loads(items) { [titleId] api in try await seasonItems(api, titleId, season) }
  }
}
