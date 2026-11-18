import Foundation
import Observation

/// Watched and favorite marks the person changed in this run of the app,
/// over what the server sent with each screen, so a mark made on one screen
/// shows on every other at once. `version` moves when something changed
/// that the marks can't say, like a whole show marked watched or a video
/// played, and screens fetch again then.
@MainActor @Observable
public final class ViewerState {
  public private(set) var version = 0

  /// The account's `playback.options` as the server last sent them in this
  /// sign-in: what it may stream, and whether it may download. Nil until it
  /// answered.
  public var options: PlaybackOptions?

  @ObservationIgnored private let onChanged: @MainActor () -> Void
  @ObservationIgnored private let titleFavorites = Marks()
  @ObservationIgnored private let seasonFavorites = Marks()
  @ObservationIgnored private let itemFavorites = Marks()
  @ObservationIgnored private let itemWatched = Marks()
  @ObservationIgnored private let titleWatched = Marks()

  /// The title and season of each file marked here, for a mark over a whole title or season.
  @ObservationIgnored private var itemPlaces: [String: (title: String, season: Int?)] = [:]

  public init(onChanged: @escaping @MainActor () -> Void = {}) {
    self.onChanged = onChanged
    for marks in [titleFavorites, seasonFavorites, itemFavorites, itemWatched, titleWatched] {
      marks.reconcile = { [weak self] in self?.changed() }
    }
  }

  /// The account may download. False until the server said so, so nothing offers a download it would refuse.
  public var mayDownload: Bool { options?.downloads == true }

  public func changed() {
    version += 1
    onChanged()
  }

  public func isFavorite(_ title: TitleSummary) -> Bool { titleFavorites[title.id] ?? title.favorite }

  /// A movie is a favorite through its title, an episode by itself.
  public func isFavorite(_ item: MediaItem) -> Bool {
    if let title = item.title, title.kind == TitleKind.movie { return isFavorite(title) }
    return itemFavorites[item.id] ?? item.favorite
  }

  public func isSeasonFavorite(_ title: TitleSummary, number: Int, fallback: Bool) -> Bool {
    seasonFavorites["\(title.id)/\(number)"] ?? fallback
  }

  public func setSeasonFavorite(_ api: MatineeApi, _ title: TitleSummary, number: Int, favorite: Bool) async throws {
    try await seasonFavorites.send("\(title.id)/\(number)", favorite) {
      try await api.favorites.setSeason(titleId: title.id, season: number, favorite: favorite)
    }
  }

  public func isWatched(_ title: TitleSummary) -> Bool { titleWatched[title.id] ?? title.watched }

  public func isWatched(_ item: MediaItem) -> Bool {
    itemWatched[item.id] ?? item.progress?.completed ?? false
  }

  public func setFavorite(_ api: MatineeApi, _ title: TitleSummary, _ favorite: Bool) async throws {
    try await titleFavorites.send(title.id, favorite) {
      try await api.favorites.set(titleId: title.id, favorite: favorite)
    }
  }

  public func setFavorite(_ api: MatineeApi, _ item: MediaItem, _ favorite: Bool) async throws {
    if let title = item.title, title.kind == TitleKind.movie {
      return try await setFavorite(api, title, favorite)
    }
    try await itemFavorites.send(item.id, favorite) {
      try await api.favorites.setItem(itemId: item.id, favorite: favorite)
    }
  }

  /// `watchedAt` is when, for watched, as the contract's `WatchedAt`:
  /// `WatchedAt.released`, `WatchedAt.unknown`, or an ISO time; nil is now.
  public func setWatched(
    _ api: MatineeApi, _ item: MediaItem, _ watched: Bool, watchedAt: String? = nil
  ) async throws {
    let title = item.title
    if let title { itemPlaces[item.id] = (title.id, item.seasonNumber) }
    try await itemWatched.send(item.id, watched) {
      try await api.playback.setWatched(
        itemId: item.id, watched: watched, watchedAt: watched ? watchedAt : nil)
    }
    if let title {
      if title.kind == TitleKind.movie {
        // A movie is watched with its one file.
        titleWatched.confirm(title.id, watched)
      } else {
        // Whether the whole show is watched now is the server's to say.
        titleWatched.forget(title.id)
      }
    }
    changed()
  }

  /// Every file of a title, or of one of its seasons. Only the whole title
  /// shows as marked before the server answers; a season's files show once
  /// it did.
  public func setWatched(
    _ api: MatineeApi, _ title: TitleSummary, _ watched: Bool, season: Int? = nil,
    watchedAt: String? = nil
  ) async throws {
    let send: () async throws -> Void = {
      try await api.playback.setTitleWatched(
        titleId: title.id, watched: watched, season: season.map { .value($0) } ?? .omitted,
        watchedAt: watched ? watchedAt : nil)
    }
    if season == nil {
      try await titleWatched.send(title.id, watched, request: send)
    } else {
      try await send()
      titleWatched.forget(title.id)
    }
    // The files marked one by one before now are this answer too.
    for (itemId, place) in itemPlaces where place.title == title.id {
      if season == nil || place.season == season { itemWatched.confirm(itemId, watched) }
    }
    changed()
  }
}
