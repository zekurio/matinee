import Foundation

/*
 * What the title, season, and episode pages and their download sheets
 * decide, from TitleData.kt and the choices DownloadsScreen.kt keeps for
 * the sheets. The words are the app's; this only picks.
 */

/// What Play starts in a season: the episode in progress, else the first
/// unwatched, else the first.
public func seasonNext(_ list: [MediaItem]?, isWatched: (MediaItem) -> Bool) -> MediaItem? {
  guard let list else { return nil }
  return list.first(where: { $0.progress?.completed == false && ($0.progress?.positionSeconds ?? 0) > 0 })
    ?? list.first(where: { !isWatched($0) }) ?? list.first
}

/// Every episode of the season is watched.
public func seasonWatched(_ list: [MediaItem]?, isWatched: (MediaItem) -> Bool) -> Bool {
  guard let list, !list.isEmpty else { return false }
  return list.allSatisfy(isWatched)
}

/// A show's page leads with the episode up next: one not finished, of a show
/// with more than one season.
public func showsNextUp(_ title: Title) -> Bool {
  guard let next = title.next else { return false }
  return title.isShow && next.progress?.completed != true && title.seasons.count > 1
}

/// The names credited as `kind`, each once, in the server's order.
public func creditNames(_ credits: [Credit], _ kind: String) -> [String] {
  var seen = Set<String>()
  return credits.filter { $0.kind == kind }.map(\.name).filter { seen.insert($0).inserted }
}

/// The title's first trailer in `language`, the interface's, else the
/// server's first, which orders them by the library's language: the web's
/// `TrailerButton`.
public func preferredTrailer(_ trailers: [Trailer], language: String) -> Trailer? {
  func base(_ tag: String) -> String {
    String(tag.split(separator: "-").first ?? Substring(tag)).lowercased()
  }
  let wanted = base(language)
  return trailers.first { $0.language.map(base) == wanted } ?? trailers.first
}

/// Mark a season watched or not, or with `season` nil, the files without a
/// season number.
@MainActor public func setSeasonWatched(
  _ api: MatineeApi, _ viewer: ViewerState, _ title: TitleSummary, season: Int?, watched: Bool,
  watchedAt: String?
) async throws {
  if let season {
    try await viewer.setWatched(api, title, watched, season: season, watchedAt: watchedAt)
  } else {
    // Nil in the title-wide operation means every season, not the unnumbered files.
    for item in try await api.looseItems(title.id) {
      try await viewer.setWatched(api, item, watched, watchedAt: watchedAt)
    }
  }
}

/// One choice in the download sheet: a version the server makes for this
/// device, at a preset's size or the one it picks, or the file as it is.
public enum DownloadChoice: Hashable, Sendable {
  case device(DownloadVideoPreset?)
  case original

  public var preset: DownloadVideoPreset? {
    if case .device(let preset) = self { return preset }
    return nil
  }
}

/// What a download sheet offers, in order: for this device, at each preset's
/// size, and as it is.
public func downloadChoices(_ presets: [DownloadVideoPreset]) -> [DownloadChoice] {
  [.device(nil)] + presets.map { .device($0) } + [.original]
}

/// The version Settings names, `defaultVersion`, which a download sheet starts on.
public func startingChoice(_ defaultVersion: String, presets: [DownloadVideoPreset]) -> DownloadChoice {
  if defaultVersion == DEFAULT_ORIGINAL { return .original }
  return presets.first { String($0.height) == defaultVersion }.map { .device($0) } ?? .device(nil)
}

/// Every preset the files offer, each once, biggest first, as a season's sheet lists them.
public func mergedPresets(_ results: [DownloadResolution]) -> [DownloadVideoPreset] {
  var seen = Set<DownloadVideoPreset>()
  return results.compactMap(\.ready).flatMap(\.choices.presets).filter { seen.insert($0).inserted }
    .sorted { $0.height > $1.height }
}

/// Every codec the files offer, each once, in the server's order.
public func mergedCodecs(_ results: [DownloadResolution]) -> [String] {
  var seen = Set<String>()
  return results.compactMap(\.ready).flatMap(\.choices.codecs).filter { seen.insert($0).inserted }
}

/// "6" or "2.5", for a bit rate in Mbps.
public func mbps(_ bitrate: Int, locale: Locale) -> String {
  let value = Double(bitrate) / 1_000_000
  return value.truncatingRemainder(dividingBy: 1) == 0
    ? String(Int(value)) : decimal(value, fractionDigits: 1, locale: locale)
}

/// The files of `items` the server answered ready for, each with its
/// answer, and how many it didn't: what queueing a season holds.
public func readyDownloads(_ items: [MediaItem], _ results: [DownloadResolution]) -> (
  ready: [(MediaItem, DownloadResolution.Ready)], failed: Int
) {
  let answers = Dictionary(results.compactMap(\.ready).map { ($0.id, $0) }) { first, _ in first }
  var ready: [(MediaItem, DownloadResolution.Ready)] = []
  var failed = 0
  for item in items {
    if let answer = answers[item.id] { ready.append((item, answer)) } else { failed += 1 }
  }
  return (ready, failed)
}

extension DownloadResolution {
  public var ready: Ready? {
    if case .ready(let ready) = self { return ready }
    return nil
  }

  public var unavailable: Unavailable? {
    if case .unavailable(let unavailable) = self { return unavailable }
    return nil
  }
}
