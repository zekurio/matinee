import Foundation

public enum CardTarget: Sendable {
  case item(MediaItem, here: Bool = false)
  case title(TitleSummary, file: MediaItem? = nil, here: Bool = false)
  case season(TitleSummary, Season, here: Bool = false)
}

/// Device gates default to ClientCapabilities; injectable for TV policy tests.
public struct ActionPermissions: Sendable {
  public var admin: Bool
  public var mayDownload: Bool
  public var providerConfigured: Bool
  public var stored: Set<String>
  public var downloads: Bool
  public var adminPages: Bool
  public var imageEditing: Bool
  public init(admin: Bool = false, mayDownload: Bool = false, providerConfigured: Bool = false,
              stored: Set<String> = [], downloads: Bool = ClientCapabilities.downloads,
              adminPages: Bool = ClientCapabilities.adminPages, imageEditing: Bool = ClientCapabilities.imageEditing) {
    self.admin = admin; self.mayDownload = mayDownload; self.providerConfigured = providerConfigured
    self.stored = stored; self.downloads = downloads; self.adminPages = adminPages; self.imageEditing = imageEditing
  }
}

public enum CardAction: Equatable, Sendable {
  case play, playFromStart, setWatched(Bool), setFavorite(Bool)
  case download, removeDownload, details, showDetails, fixMatch, refreshMetadata, editImages
}

/// Commands for the platform to present or execute. Mutations return .updated.
public enum CardActionEffect: Sendable {
  case play(itemId: String, position: Double?)
  case downloadItem(MediaItem)
  case downloadFiles(title: TitleSummary, season: Season?)
  case removeDownload(itemId: String)
  case titleDetails(String), episodeDetails(String), seasonDetails(titleId: String, season: Int?)
  case fixMatch(String), editImages(ImageTarget)
  case updated, noFiles
}

private extension CardTarget {
  var title: TitleSummary? {
    switch self {
    case .item(let item, _): item.title
    case .title(let title, _, _), .season(let title, _, _): title
    }
  }
  var file: MediaItem? {
    switch self { case .item(let item, _): item; case .title(_, let file, _): file; case .season: nil }
  }
  var here: Bool {
    switch self { case .item(_, let here), .title(_, _, let here), .season(_, _, let here): here }
  }
  var images: ImageTarget? {
    guard let title else { return nil }
    switch self {
    case .title: return ImageTarget(titleId: title.id)
    case .season(_, let season, _): return season.number.map { ImageTarget(titleId: title.id, season: $0) }
    case .item(let item, _):
      if title.kind != TitleKind.show { return ImageTarget(titleId: title.id) }
      guard let season = item.seasonNumber, let episode = item.episodeNumber else { return nil }
      return ImageTarget(titleId: title.id, season: season, episode: episode)
    }
  }
  var matchable: Bool {
    switch self { case .title: true; case .item: title?.kind != TitleKind.show; case .season: false }
  }
}

@MainActor public func cardActions(for target: CardTarget, viewer: ViewerState, permissions p: ActionPermissions) -> [CardAction] {
  var result: [CardAction] = []
  let file = target.file
  if !target.here {
    switch target { case .season: break; default: result.append(.play) }
  }
  if let progress = file?.progress, !progress.completed && progress.positionSeconds > 0 { result.append(.playFromStart) }
  if !target.here {
    switch target {
    case .item(let item, _):
      result += [.setWatched(!viewer.isWatched(item)), .setFavorite(!viewer.isFavorite(item))]
    case .title(let title, _, _):
      result += [.setWatched(!viewer.isWatched(title)), .setFavorite(!viewer.isFavorite(title))]
    case .season(let title, let season, _):
      result.append(.setWatched(!(season.itemCount > 0 && season.watchedCount >= season.itemCount)))
      if let number = season.number { result.append(.setFavorite(!viewer.isSeasonFavorite(title, number: number, fallback: season.favorite))) }
    }
  }
  if p.downloads {
    if case .title(let title, _, _) = target, title.kind == TitleKind.show && p.mayDownload {
      result.append(.download)
    } else if let file, p.stored.contains(file.id) { result.append(.removeDownload) }
    else if p.mayDownload { result.append(.download) }
  }
  if !target.here {
    if target.title != nil || { if case .season = target { return true }; return false }() { result.append(.details) }
    if case .item(let item, _) = target, item.title?.kind == TitleKind.show { result.append(.showDetails) }
  }
  if p.admin {
    if p.adminPages && p.providerConfigured && target.matchable && target.title != nil { result += [.fixMatch, .refreshMetadata] }
    if p.imageEditing && target.images != nil { result.append(.editImages) }
  }
  return result
}

public enum CardActionError: Error { case unavailable }

/// Revalidates availability before executing. Watched=true callers ask when first;
/// nil means now, WatchedAt.released/unknown and watchedAtOn cover the other choices.
/// Viewer mutations reconcile shared marks; .updated also asks the screen to reload.
@MainActor public func performCardAction(_ action: CardAction, target: CardTarget, viewer: ViewerState,
                                        permissions: ActionPermissions, api: MatineeApi, watchedAt: String? = nil) async throws -> CardActionEffect {
  guard cardActions(for: target, viewer: viewer, permissions: permissions).contains(action) else { throw CardActionError.unavailable }
  switch action {
  case .setWatched(let watched):
    switch target {
    case .item(let item, _): try await viewer.setWatched(api, item, watched, watchedAt: watchedAt)
    case .title(let title, _, _): try await viewer.setWatched(api, title, watched, watchedAt: watchedAt)
    case .season(let title, let season, _): try await setSeasonWatched(api, viewer, title, season: season.number, watched: watched, watchedAt: watchedAt)
    }
    return .updated
  case .setFavorite(let favorite):
    switch target {
    case .item(let item, _): try await viewer.setFavorite(api, item, favorite)
    case .title(let title, _, _): try await viewer.setFavorite(api, title, favorite)
    case .season(let title, let season, _):
      guard let number = season.number else { throw CardActionError.unavailable }
      try await viewer.setSeasonFavorite(api, title, number: number, favorite: favorite)
    }
    return .updated
  case .refreshMetadata:
    guard let title = target.title else { throw CardActionError.unavailable }
    _ = try await api.titles.refresh(id: title.id)
    viewer.changed()
    return .updated
  case .playFromStart:
    guard let file = target.file else { throw CardActionError.unavailable }
    return .play(itemId: file.id, position: 0)
  case .play:
    if case .item(let file, _) = target { return .play(itemId: file.id, position: nil) }
    guard let title = target.title, let next = try await api.titles.get(id: title.id).next else { return .noFiles }
    return .play(itemId: next.id, position: nil)
  case .download:
    if case .season(let title, let season, _) = target { return .downloadFiles(title: title, season: season) }
    if case .title(let title, _, _) = target, title.kind == TitleKind.show { return .downloadFiles(title: title, season: nil) }
    if let file = target.file { return .downloadItem(file) }
    guard let title = target.title, let next = try await api.titles.get(id: title.id).next else { return .noFiles }
    return .downloadItem(next)
  case .removeDownload:
    guard let file = target.file else { throw CardActionError.unavailable }
    return .removeDownload(itemId: file.id)
  case .details:
    switch target {
    case .item(let item, _):
      if item.title?.kind == TitleKind.show { return .episodeDetails(item.id) }
      guard let title = item.title else { return .episodeDetails(item.id) }
      return .titleDetails(title.id)
    case .title(let title, _, _): return .titleDetails(title.id)
    case .season(let title, let season, _): return .seasonDetails(titleId: title.id, season: season.number)
    }
  case .showDetails:
    guard let title = target.title else { throw CardActionError.unavailable }
    return .titleDetails(title.id)
  case .fixMatch:
    guard let title = target.title else { throw CardActionError.unavailable }
    return .fixMatch(title.id)
  case .editImages:
    guard let images = target.images else { throw CardActionError.unavailable }
    return .editImages(images)
  }
}
