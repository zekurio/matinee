import Foundation
import MatineeCore

/*
 * Format.kt: names, numbers, and dates in the app's language. The
 * arithmetic is MatineeCore's (Format/Format.swift), tested on the Mac; this
 * puts it in words from the string catalog.
 */

nonisolated extension Locale {
  /// The app's language, which may differ from the device's (Settings ›
  /// Matinee › Language), with the device's region. Everything the app
  /// formats goes through this, never a fixed locale.
  static var app: Locale {
    guard let language = Bundle.main.preferredLocalizations.first else { return .current }
    var components = Locale.Components(locale: .current)
    components.languageComponents = Locale.Language.Components(identifier: language)
    return Locale(components: components)
  }
}

/// Names from the server, with episode numbers worded in the app's language.
/// Android's `ItemLabel` in Format.kt; renamed, as the contract has an `ItemLabel`.
nonisolated struct ItemNames: Hashable, Sendable {
  /// The show or movie name. For loose files, the top folder or the file's title.
  var showName: String
  var year: String?
  /// The episode's name, "Episode 4", or the movie's name.
  var title: String
  /// Neither the provider nor the file name gave the episode a name.
  var untitled: Bool
  /// S02E01, for episodes.
  var code: String?
}

nonisolated func itemLabel(_ item: MediaItem) -> ItemNames {
  let label = item.label
  let name = label.title ?? label.episodeNumber.map(Str.mediaEpisode)
  return ItemNames(
    showName: label.showName.isEmpty ? item.fileTitle : label.showName,
    year: label.year,
    title: (name ?? "").isEmpty ? item.fileTitle : name ?? "",
    untitled: label.untitled,
    code: label.code)
}

/// "S2, E5", the way episode codes read in running text.
nonisolated func episodeCode(_ item: MediaItem) -> String? {
  guard let season = item.seasonNumber, let number = item.episodeNumber else { return nil }
  return season == 0 ? Str.mediaSpecial(number) : Str.mediaEpisodeCode(season, number)
}

/// "Episode 4", or "Special 4" in season 0.
nonisolated func episodeNumber(_ item: MediaItem) -> String? {
  guard let number = item.episodeNumber else { return nil }
  return item.seasonNumber == 0 ? Str.mediaSpecial(number) : Str.mediaEpisode(number)
}

nonisolated func seasonName(_ number: Int?) -> String {
  switch number {
  case nil: Str.mediaOtherFiles
  case 0: Str.mediaSpecials
  case let number?: Str.mediaSeason(number)
  }
}

/// "12 min left", for files the person started.
nonisolated func timeLeft(_ item: MediaItem) -> String? { minutesLeft(item).map(Str.mediaTimeLeft) }

nonisolated func formatRuntime(_ minutes: Int?) -> String? {
  guard let minutes, minutes > 0 else { return nil }
  let hours = minutes / 60
  let rest = minutes % 60
  if hours == 0 { return Str.formatMinutes(rest) }
  if rest == 0 { return Str.formatHours(hours) }
  return Str.formatHoursMinutes(hours, rest)
}

/// A YYYY-MM-DD date, as the app's language writes dates.
nonisolated func formatDay(_ day: String?) -> String? {
  parseDay(day).map { $0.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted).locale(.app)) }
}

/// An ISO time from the server, as a date in the app's language.
nonisolated func formatInstant(_ value: String) -> String {
  parseInstant(value).map { $0.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted).locale(.app)) }
    ?? value
}

/// A year as the title's, without the grouping separator "2,024" would get.
nonisolated func formatYear(_ year: Int?) -> String? { year.map { String($0) } }

/// A count as the app's language groups it: "1,204", "1.204".
nonisolated func formatCount(_ count: Int) -> String { count.formatted(.number.locale(.app)) }

nonisolated func formatRating(_ rating: Double) -> String { MatineeCore.formatRating(rating, locale: .app) }

nonisolated func formatBytes(_ bytes: Int64) -> String { MatineeCore.formatBytes(bytes, locale: .app) }

/// A bit rate as the web writes it: 8 Mbps, 2.5 Mbps, or 800 kbps.
nonisolated func formatBitrate(_ bits: Int) -> String {
  switch bitrate(bits, locale: .app) {
  case .kbps(let kilobits): Str.playerBitrateKbps(kilobits)
  case .mbps(let megabits): Str.playerBitrateMbpsExact(megabits)
  }
}

/// "German, English" for tracks' BCP 47 tags, named in the app's language.
nonisolated func languageList(_ tags: [String?]) -> String? { MatineeCore.languageList(tags, locale: .app) }

/// "German" for `de`, in the app's language.
nonisolated func languageName(_ tag: String) -> String {
  let locale = Locale.app
  guard let name = locale.localizedString(forIdentifier: tag), !name.isEmpty else { return tag }
  return name.prefix(1).uppercased(with: locale) + name.dropFirst()
}

/// "1080p, 20 Mbps" for an encode.
nonisolated func qualityLabel(_ quality: PlaybackQualityPreset) -> String {
  ungrouped(Str.playbackQualityPreset(quality.height, Str.playerBitrateMbps(quality.bitrate / 1_000_000)), quality.height)
}

/// `formatted` with `number` as plain digits. `Str`'s formats group a
/// number as the app's language does, "2,160p", where Android's `%d`
/// doesn't, and a height is a name rather than a count.
nonisolated func ungrouped(_ formatted: String, _ number: Int) -> String {
  formatted.replacingOccurrences(of: number.formatted(.number.locale(.app)), with: String(number))
}
