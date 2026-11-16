import MatineeCore
import MatineeKit
import SwiftUI

/*
 * DetailRows.kt: the rows under a detail page's header, shared by the
 * title, season, and episode pages. Each is a `TVRow` of the page's focus
 * memory, and leaves itself out when it has nothing: an empty row on a
 * title's page says nothing worth the room.
 *
 * A card's long press opens its actions; Play/Pause plays it, as on Home.
 */

/// Row keys, for focus memory and the page's scroll.
enum DetailRowKey {
  static let nextUp = "nextUp"
  static let episodes = "episodes"
  static let seasons = "seasons"
  static let people = "people"
  static let links = "links"
  static func related(_ id: String) -> String { "related-\(id)" }
}

/// An episode as a 16:9 card in a row: its still, how far in the person
/// is, its name, and its number with the time left or its length. Select
/// opens its page; holding Select offers the rest; Play/Pause plays it.
struct EpisodeCard: View {
  let item: MediaItem
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.tvActions) private var actions
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    let label = itemLabel(item)
    let watched = viewer?.isWatched(item) ?? (item.progress?.completed ?? false)
    let left = isResuming(item) && !watched ? timeLeft(item) : nil
    // An episode without a name is called by its number already.
    let detail = [label.untitled ? nil : episodeNumber(item), left ?? formatRuntime(runtimeMinutes(item))]
      .compactMap(\.self).joined(separator: " · ")
    TVLandscapeCard(
      label.title, detail: detail.isEmpty ? nil : detail, progress: progressRatio(item), watched: watched,
      action: { nav.item(item) }, onLongPress: { actions?.open(.item(item)) }, onPlayPause: { nav.play(item.id, nil) }
    ) {
      Picture(api?.landscape(item, size: .medium) ?? [])
    }
  }
}

/// A season's episodes as a row titled `heading`, without `exclude`. The
/// first time focus comes into it, it lands on `start`, like the episode
/// Play starts. Nothing while they load, or if there are none; why, with
/// Try again, if they didn't load.
struct SeasonEpisodesRow: View {
  let heading: String
  let key: String
  let titleId: String
  let season: Int?
  let memory: TVFocusMemory
  var exclude: String?
  /// Where focus lands first: an episode's id, or from the whole list.
  var start: (([MediaItem]) -> String?)?
  @State private var items = Loader<[MediaItem]>()

  var body: some View {
    Group {
      switch items.state {
      case .loading: Color.clear.frame(height: 0)
      case .failed(let message, _):
        TVRowNotice(
          heading, headline: Str.titleEpisodesFailed, message: message,
          action: TVNoticeAction(Str.commonRetry, icon: .refreshCw, action: items.reload)
        )
        .detailRow(key)
      case .ready(let all):
        let list = all.filter { $0.id != exclude }.map(itemShown)
        if !list.isEmpty {
          TVRow(heading, key: key, items: list, itemKey: \.id, memory: memory) { item in EpisodeCard(item: item) }
            .detailRow(key)
            .onAppear { if let first = start?(all), list.contains(where: { $0.id == first }) { memory.prefer(row: key, item: first) } }
        }
      }
    }
    .loads(items) { [titleId, season] api in try await seasonItems(api, titleId, season) }
  }
}

/// The episode up next on a show's page, in a row of its own, as the
/// phone's page leads with it: "Continue watching" while it's in progress,
/// "Next up" otherwise.
struct NextUpRow: View {
  let item: MediaItem
  let memory: TVFocusMemory
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.tvActions) private var actions
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    let label = itemLabel(item)
    let number = episodeCode(item)
    let watched = viewer?.isWatched(item) ?? false
    let caption = number.flatMap { label.untitled ? nil : Str.titleEpisodesCodedName($0, label.title) } ?? label.title
    let detail = [formatDay(item.episode?.airDate), isResuming(item) ? timeLeft(item) : formatRuntime(runtimeMinutes(item))]
      .compactMap(\.self).joined(separator: " · ")
    TVRow(
      item.progress != nil ? Str.titleNextUpContinue : Str.titleNextUpNext, key: DetailRowKey.nextUp, items: [item],
      itemKey: \.id, memory: memory
    ) { item in
      TVLandscapeCard(
        caption, detail: detail.isEmpty ? nil : detail, progress: progressRatio(item), watched: watched,
        action: { nav.episode(item.id) }, onLongPress: { actions?.open(.item(item)) },
        onPlayPause: { nav.play(item.id, nil) }
      ) {
        Picture(api?.landscape(item, size: .medium) ?? [])
      }
    }
    .detailRow(DetailRowKey.nextUp)
  }
}

/// A show's seasons by their posters, with how many episodes are left in
/// each, or the dot once none are; without `current`, on a season's page.
struct SeasonsRow: View {
  let title: Title
  var current: Season?
  let memory: TVFocusMemory
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.tvActions) private var actions

  var body: some View {
    let seasons = titleSeasons(title, current: current)
    if !seasons.isEmpty {
      TVRow(
        current == nil ? Str.titleSeasons : Str.titleSeasonsMore, key: DetailRowKey.seasons, items: seasons,
        itemKey: { "\($0.number ?? -1)" }, memory: memory
      ) { season in
        let left = season.itemCount - season.watchedCount
        TVCaptionedPoster(
          seasonName(season.number), detail: Str.mediaEpisodeCount(season.itemCount),
          badge: left > 0 ? formatCount(left) : nil, watched: season.itemCount > 0 && left <= 0,
          action: { nav.season(title.id, season.number) },
          onLongPress: { actions?.open(.season(title.summary, season)) }
        ) {
          Picture(api?.art(season.poster ?? title.images.poster, size: .medium))
        }
      }
      .detailRow(DetailRowKey.seasons)
    }
  }
}

/// The cast with their parts, then the creators, directors, and writers
/// with their jobs, each once, each opening their page.
struct PeopleRow: View {
  let credits: [Credit]
  let memory: TVFocusMemory
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav

  private struct Credited: Hashable {
    let key: String
    let name: String
    let role: String?
    let photo: Artwork?
    let tmdbId: String?
  }

  var body: some View {
    let people = Self.people(credits)
    if !people.isEmpty {
      TVRow(Str.tvDetailPeople, key: DetailRowKey.people, items: people, itemKey: \.key, memory: memory) { person in
        TVPersonCard(person.name, role: person.role, action: { nav.person(person.name, person.tmdbId) }) {
          Picture(api?.art(person.photo, size: .small))
        }
      }
      .detailRow(DetailRowKey.people)
    }
  }

  /// Android's `tvPeople`: the cast in billing order, the same actor in two
  /// parts twice, then each kind of crew, each name once.
  private static func people(_ credits: [Credit]) -> [Credited] {
    let cast = credits.enumerated().filter { $0.element.kind == CreditKind.actor }.map { index, credit in
      Credited(key: "cast-\(index)", name: credit.name, role: credit.role, photo: credit.photo, tmdbId: credit.tmdbId)
    }
    let crew = [CreditKind.creator, CreditKind.director, CreditKind.writer].flatMap { kind in
      creditNames(credits, kind).map { name in
        Credited(
          key: "\(kind)-\(name)", name: name, role: titleCreditLabel(kind, count: 1),
          photo: credits.first { $0.kind == kind && $0.name == name }?.photo,
          tmdbId: credits.first { $0.kind == kind && $0.name == name }?.tmdbId)
      }
    }
    return cast + crew
  }
}

/// A title's genres and studios, each opening its titles across the server.
struct LinksRow: View {
  let title: Title
  let memory: TVFocusMemory
  @Environment(\.navigator) private var nav

  private struct Named: Hashable {
    let key: String
    let name: String
    let genre: Bool
  }

  var body: some View {
    let links =
      title.genres.map { Named(key: "genre-\($0)", name: $0, genre: true) }
      + title.studios.map { Named(key: "studio-\($0)", name: $0, genre: false) }
    if !links.isEmpty {
      TVRow(Str.tvDetailLinks, key: DetailRowKey.links, items: links, itemKey: \.key, memory: memory, spacing: TVSpace.s5)
      { link in
        TVChip(link.name) { if link.genre { nav.genre(link.name) } else { nav.studio(link.name) } }
      }
      .detailRow(DetailRowKey.links)
    }
  }
}

// MARK: Related

/// The rows of titles related to `title`, as the server works them out
/// from the title at its provider: the rest of its film series, and more
/// like it. A TV has no page for a title the server doesn't have, so a row
/// shows only what's here to watch, and leaves itself out with none.
/// Nothing until the title is matched.
struct RelatedRows: View {
  let title: Title
  let memory: TVFocusMemory
  @State private var rails = Loader<RelatedRails>()

  var body: some View {
    #if DEBUG
      if DetailFixtures.related {
        RelatedFixtureRow(title: title, memory: memory)
      }
    #endif
    if let ref = titleCatalogRef(title) {
      Group {
        if let list = rails.state.value?.rails, !list.isEmpty {
          ForEach(list, id: \.id) { rail in RelatedRow(rail: rail, ref: ref, libraryId: title.libraryId, memory: memory) }
        } else {
          // Something to show, so the rows load.
          Color.clear.frame(height: 0)
        }
      }
      .loads(rails) { [ref, libraryId = title.libraryId] api in
        try await api.catalog.related(catalogInput: CatalogInput(ref: ref, libraryId: libraryId))
      }
    }
  }
}

/// One related row: the library's titles in it, once they load.
private struct RelatedRow: View {
  let rail: RelatedRail
  let ref: CatalogRef
  let libraryId: String
  let memory: TVFocusMemory
  @State private var page = Loader<RelatedPage>()

  var body: some View {
    let titles = page.state.value?.items.compactMap(relatedLibraryTitle) ?? []
    Group {
      if titles.isEmpty {
        Color.clear.frame(height: 0)
      } else {
        TitlePosterRow(
          heading: relatedRailName(rail) ?? Str.webCatalogRelatedMoreLikeThis, key: DetailRowKey.related(rail.id),
          titles: titles, memory: memory)
      }
    }
    .loads(page) { [ref, libraryId, id = rail.id] api in
      try await api.catalog.relatedTitles(ref: ref, rail: id, libraryId: libraryId)
    }
  }
}

/// A row of movies and shows as captioned posters, each opening its page.
struct TitlePosterRow: View {
  let heading: String
  let key: String
  let titles: [TitleSummary]
  let memory: TVFocusMemory
  var detail: (TitleSummary) -> String? = { formatYear($0.year) }
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.tvActions) private var actions
  @Environment(\.snackbar) private var snackbar
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    TVRow(heading, key: key, items: titles, itemKey: \.id, memory: memory) { title in
      let target = TVActionTarget.title(title)
      TVCaptionedPoster(
        title.name, detail: detail(title), watched: viewer?.isWatched(title) ?? title.watched,
        action: { nav.title(title) }, onLongPress: { actions?.open(target) },
        onPlayPause: { actions?.play(target, api: api, viewer: viewer, nav: nav, snackbar: snackbar) }
      ) {
        Picture(api?.art(title.images.poster, size: .medium))
      }
    }
    .detailRow(key)
  }
}

#if DEBUG
  /// `-title.fixture YES`'s related row on the dev server, which matches
  /// nothing: the other titles of the same kind, as "More like this".
  private struct RelatedFixtureRow: View {
    let title: Title
    let memory: TVFocusMemory
    @State private var titles = Loader<[TitleSummary]>()

    var body: some View {
      Group {
        if let list = titles.state.value, !list.isEmpty {
          TitlePosterRow(
            heading: Str.webCatalogRelatedMoreLikeThis, key: DetailRowKey.related("fixture"), titles: list,
            memory: memory)
        } else {
          Color.clear.frame(height: 0)
        }
      }
      .loads(titles) { [id = title.id] api in
        try await api.titles.browse(limit: 12).items.filter { $0.id != id }
      }
    }
  }
#endif
