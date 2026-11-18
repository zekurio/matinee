import Foundation

/*
 * DownloadsScreen.kt's sorting: what's still coming, file by file, and
 * what's on the phone, movies and shows, newest first, with a show's files
 * by season. The screens draw it; the rules live here, where they're tested.
 */

/// A downloaded show: its files by season. `newest` puts what came last at the top.
public struct ShowDownloads: Sendable, Hashable, Identifiable {
  public var title: TitleSummary
  public var seasons: [SeasonDownloads]
  public var id: String { title.id }
  public var entries: [OfflineItem] { seasons.flatMap(\.entries) }
  public var newest: Double { entries.map(\.addedAt).max() ?? 0 }
  /// The file whose picture stands for the show: the one that came last.
  public var newestEntry: OfflineItem? { entries.max { $0.addedAt < $1.addedAt } }
}

/// A season's files in order; `number` nil for files without a season.
public struct SeasonDownloads: Sendable, Hashable {
  public var number: Int?
  public var entries: [OfflineItem]
}

/// One line of the finished list: a movie or loose file, or a show.
public enum DownloadGroup: Sendable, Hashable, Identifiable {
  case file(OfflineItem)
  case show(ShowDownloads)

  public var id: String {
    switch self {
    case .file(let entry): entry.id
    case .show(let show): "show-\(show.title.id)"
    }
  }

  var addedAt: Double {
    switch self {
    case .file(let entry): entry.addedAt
    case .show(let show): show.newest
    }
  }
}

/// The Downloads tab's two lists.
public struct DownloadList: Sendable, Hashable {
  /// What's still coming, in the order it was asked for.
  public var coming: [OfflineItem]
  /// What's on the phone, movies and shows together, what came last first.
  public var finished: [DownloadGroup]
}

/// Seasons in order, then the specials, then the files without a season, as on a show's page.
func seasonOrder(_ number: Int?) -> Int {
  switch number {
  case nil: Int.max
  case 0: Int.max - 1
  case let number?: number
  }
}

func isShow(_ entry: OfflineItem) -> Bool { entry.item.title?.kind == TitleKind.show }

/// `entries` by season, each season's files by episode number.
public func seasonsOf(_ entries: [OfflineItem]) -> [SeasonDownloads] {
  var order: [Int?] = []
  var groups: [Int?: [OfflineItem]] = [:]
  for entry in entries {
    let number = entry.item.seasonNumber
    if groups[number] == nil { order.append(number) }
    groups[number, default: []].append(entry)
  }
  return order.sorted { seasonOrder($0) < seasonOrder($1) }.map { number in
    SeasonDownloads(
      number: number,
      entries: groups[number, default: []].sorted {
        ($0.item.episodeNumber ?? Int.max, $0.addedAt) < ($1.item.episodeNumber ?? Int.max, $1.addedAt)
      })
  }
}

/// Sorts the downloads of the server in use into the Downloads tab's lists.
public func downloadList(_ items: some Collection<OfflineItem>) -> DownloadList {
  let coming = items.filter { $0.state != .done }.sorted { ($0.addedAt, $0.id) < ($1.addedAt, $1.id) }
  let done = items.filter { $0.state == .done }
  var shows: [String: [OfflineItem]] = [:]
  var files: [DownloadGroup] = []
  for entry in done {
    if isShow(entry), let title = entry.item.title {
      shows[title.id, default: []].append(entry)
    } else {
      files.append(.file(entry))
    }
  }
  let grouped = shows.values.compactMap { episodes -> DownloadGroup? in
    guard let title = episodes.first?.item.title else { return nil }
    return .show(ShowDownloads(title: title, seasons: seasonsOf(episodes)))
  }
  let finished = (files + grouped).sorted { ($0.addedAt, $0.id) > ($1.addedAt, $1.id) }
  return DownloadList(coming: coming, finished: finished)
}

/// What the heading over the files still coming offers for all of them at once.
public enum ComingAction: Sendable, Hashable {
  /// What broke off is what wants doing first.
  case retryAll([String])
  case pauseAll([String])
  case resumeAll([String])
  case none
}

public func comingAction(_ coming: [OfflineItem]) -> ComingAction {
  let broken = coming.filter { $0.isBroken && !$0.isRefused }
  if !broken.isEmpty { return .retryAll(broken.map(\.id)) }
  let moving = coming.filter(\.isMoving)
  if !moving.isEmpty { return .pauseAll(moving.map(\.id)) }
  let stopped = coming.filter { !$0.isRefused }
  return stopped.isEmpty ? .none : .resumeAll(stopped.map(\.id))
}

/// What a show's downloads page offers for all of its files at once, from
/// its menu: pausing what moves, and going on with what stopped. A refusal
/// isn't offered again, as its row doesn't offer it either.
public struct ShowCommands: Sendable, Hashable {
  public var pause: [String]
  public var resume: [String]

  public init(_ entries: [OfflineItem]) {
    pause = entries.filter(\.isMoving).map(\.id)
    resume = entries.filter { ($0.state == .paused || $0.state == .failed) && !$0.isRefused }.map(\.id)
  }
}

/// How a download stands, for the line under its name: the words are the app's.
public enum DownloadStatus: Sendable, Hashable {
  /// On the device, or coming with no size known yet: how much it holds.
  case size(Int64)
  /// Coming: how much of how much.
  case progress(Int64, of: Int64)
  case paused
  /// Given up, and why, when it's known.
  case stopped(DownloadFailure?)
  /// Waiting to try again after `DownloadFailure`: why, alone, as the
  /// danger color and the retry button say the rest.
  case broken(DownloadFailure)
  /// Waiting its turn, or for Wi-Fi when Settings says so.
  case waiting(wifi: Bool)
}

extension OfflineItem {
  /// What went wrong with it: what the worker worked out, or, from an older
  /// entry, the server's message it kept.
  public var problem: DownloadFailure? { failure ?? error.map(DownloadFailure.server) }
}

/// How `entry` stands, with `wifiOnly` as Settings has it.
public func downloadStatus(_ entry: OfflineItem, wifiOnly: Bool) -> DownloadStatus {
  switch entry.state {
  case .done: return .size(entry.bytes)
  case .running:
    // Waiting to try again after an error, its task held back until then: why.
    if let problem = entry.problem { return .broken(problem) }
    guard let total = entry.totalBytes, total > 0 else { return .size(entry.bytes) }
    return .progress(entry.bytes, of: total)
  case .paused: return .paused
  case .failed: return .stopped(entry.problem)
  case .queued: return entry.problem.map(DownloadStatus.broken) ?? .waiting(wifi: wifiOnly)
  }
}

/// What a row's button, and its menu's first item, do about where a
/// download stands. Android's ComingRow, with a refusal only removable.
public enum DownloadRowAction: Sendable, Hashable {
  /// Broke off, or waits to try again: try again now.
  case retry
  case pause
  case resume
  /// Refused: trying again would only be refused again, so what's left is removing it.
  case remove
  /// On the device: nothing about its state to do.
  case none
}

public func rowAction(_ entry: OfflineItem) -> DownloadRowAction {
  if entry.state == .done { return .none }
  if entry.isRefused { return .remove }
  if entry.isBroken { return .retry }
  return entry.isMoving ? .pause : .resume
}

/// What the Downloads tab says over its list, or in its place.
public enum DownloadsNotice: Sendable, Hashable {
  /// Nothing yet: how to download something.
  case empty
  /// The account may not download: nothing new can come. With nothing
  /// on the device it's the page's message; with files, a note over them,
  /// as they still play and can still go.
  case off
  case none
}

/// What the tab says for `count` downloads. Offline, the server can't say
/// whether the account may download, so the usual hint stays; `mayDownload`
/// is nil until the server has said.
public func downloadsNotice(count: Int, offline: Bool, mayDownload: Bool?) -> DownloadsNotice {
  if !offline && mayDownload == false { return .off }
  return count == 0 ? .empty : .none
}

extension OfflineItem {
  /// On its way, or waiting its turn.
  public var isMoving: Bool { state == .running || state == .queued }

  /// Broke off: given up, or waiting to try again after an error.
  public var isBroken: Bool { failure != nil || error != nil || state == .failed }

  /// Stopped because the server said no: downloads off for the account, or
  /// the server's own refusal. Trying again would only be refused again, so
  /// nothing offers it; removing it is what's left.
  public var isRefused: Bool {
    guard state == .failed else { return false }
    switch failure {
    case .forbidden, .server: return true
    case .unreachable, .brokeOff, nil: return false
    }
  }
}

/// The disk space downloads take, and what's left on the volume they're on.
public struct DownloadStorage: Sendable, Hashable {
  public var used: Int64
  public var free: Int64?
}

extension DownloadStore {
  /// What the server in use's downloads take on disk, every file in their
  /// folders, and the space left: the storage line, which reads against the disk.
  public func storage() async -> DownloadStorage {
    let keys = items.values.map(\.key)
    let used = await files.storageUsed(keys: keys)
    #if os(tvOS)
    let free: Int64? = nil
    #else
    let free = try? root.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
      .volumeAvailableCapacityForImportantUsage
    #endif
    return DownloadStorage(used: used, free: free)
  }
}
