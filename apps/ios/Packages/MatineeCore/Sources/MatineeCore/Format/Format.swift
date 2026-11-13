import Foundation

/*
 * The arithmetic behind Format.kt's wording, which the app's UI/Format.swift
 * puts in words. Nothing here reads a language: what depends on one takes
 * the locale to use, and the app passes its own.
 */

/// Share of the file watched, 0 to 1, or nil when unknown.
public func progressRatio(_ item: MediaItem) -> Double? {
  guard let progress = item.progress, let duration = item.durationSeconds else { return nil }
  if progress.completed { return 1 }
  if duration <= 0 { return nil }
  return min(max(progress.positionSeconds / duration, 0), 1)
}

/// Whole minutes left of a file the person started, at least one; nil when
/// it isn't started or is finished.
public func minutesLeft(_ item: MediaItem) -> Int? {
  guard let progress = item.progress, let duration = item.durationSeconds, !progress.completed
  else { return nil }
  return max(1, Int(((duration - progress.positionSeconds) / 60).rounded()))
}

/// Whether the person stopped partway through `item`, so it resumes.
public func isResumable(_ item: MediaItem?) -> Bool {
  guard let progress = item?.progress else { return false }
  return !progress.completed && progress.positionSeconds > 0
}

/// A file's length in minutes: the provider's for an episode, else the file's.
public func runtimeMinutes(_ item: MediaItem) -> Int? {
  item.episode?.runtimeMinutes ?? item.durationSeconds.map { Int(($0 / 60).rounded()) }
}

/// "1:02:35" or "4:05".
public func formatClock(_ totalSeconds: Double) -> String {
  let seconds = max(0, Int(totalSeconds.isFinite ? totalSeconds : 0))
  let h = seconds / 3600
  let m = (seconds % 3600) / 60
  let s = seconds % 60
  func two(_ n: Int) -> String { n < 10 ? "0\(n)" : "\(n)" }
  return h > 0 ? "\(h):\(two(m)):\(two(s))" : "\(m):\(two(s))"
}

/// A number with `fractionDigits` decimals, in `locale`.
func decimal(_ value: Double, fractionDigits: Int, locale: Locale) -> String {
  value.formatted(
    .number.precision(.fractionLength(fractionDigits)).locale(locale).grouping(.never))
}

/// A rating out of ten, one decimal: "7.8", "7,8" in German.
public func formatRating(_ rating: Double, locale: Locale) -> String {
  decimal(rating, fractionDigits: 1, locale: locale)
}

/// "820 MB", "1.4 GB": decimal units, as the web writes sizes.
public func formatBytes(_ bytes: Int64, locale: Locale) -> String {
  let units = ["B", "kB", "MB", "GB", "TB"]
  var value = Double(bytes)
  var unit = 0
  while value >= 1000 && unit < units.count - 1 {
    value /= 1000
    unit += 1
  }
  let number =
    value >= 10 ? String(Int(value.rounded())) : decimal(value, fractionDigits: 1, locale: locale)
  return "\(number) \(units[unit])"
}

/// A bit rate as the web writes it, before its unit: (800, kbps), (8, Mbps), (2.5, Mbps).
public enum Bitrate: Equatable, Sendable {
  case kbps(Int)
  case mbps(String)
}

public func bitrate(_ bits: Int, locale: Locale) -> Bitrate {
  if bits < 1_000_000 { return .kbps(Int((Double(bits) / 1000).rounded())) }
  let tenths = Int((Double(bits) / 100_000).rounded())
  return .mbps(
    tenths % 10 == 0
      ? String(tenths / 10) : decimal(Double(tenths) / 10, fractionDigits: 1, locale: locale))
}

/// Names for encode choices, which aren't probe streams.
public func videoCodecName(_ codec: String) -> String { codec == "h264" ? "H.264" : codec.uppercased() }

private let AUDIO_FORMATS = [
  "aac": "AAC", "ac3": "AC-3", "eac3": "E-AC-3", "flac": "FLAC", "alac": "ALAC", "opus": "Opus",
  "mp3": "MP3",
]

/// Names for audio conversion choices, which aren't probe streams.
public func audioFormatName(_ codec: String) -> String { AUDIO_FORMATS[codec] ?? codec.uppercased() }

/// "1080p · HEVC · HDR10", the picture's part of a file's details.
public func videoSummary(_ item: MediaItem) -> String? {
  guard let video = item.probe?.video else { return nil }
  return [video.resolution, video.format, video.dynamicRange].compactMap(\.self).joined(
    separator: " · ")
}

/// Badges for a title page: resolution, dynamic range, and the main audio's layout.
public func mediaFlags(_ item: MediaItem) -> [String] {
  guard let probe = item.probe else { return [] }
  let main = probe.audio.first(where: \.default) ?? probe.audio.first
  return [probe.video?.resolution, probe.video?.dynamicRange, main?.layout].compactMap(\.self)
}

/// "German, English" for tracks' BCP 47 tags, each language once in the
/// order given, named in `locale`. Tracks that don't say are left out; nil
/// when none say.
public func languageList(_ tags: [String?], locale: Locale) -> String? {
  var seen = Set<String>()
  var names: [String] = []
  for tag in tags.compactMap(\.self) {
    let language = Locale.Language(identifier: tag)
    guard let code = language.languageCode?.identifier, seen.insert(code).inserted else { continue }
    guard let name = locale.localizedString(forLanguageCode: code), !name.isEmpty, name != code
    else { continue }
    names.append(name.prefix(1).uppercased(with: locale) + name.dropFirst())
  }
  return names.isEmpty ? nil : names.joined(separator: ", ")
}

/// "MO" for Masi Oka, "Z" for zekurio.
public func initials(_ name: String) -> String {
  let words = name.split(whereSeparator: { " -_.".contains($0) })
  if words.count >= 2, let first = words.first?.first, let last = words.last?.first {
    return "\(first)\(last)".uppercased()
  }
  if let word = words.first { return String(word.prefix(1)).uppercased() }
  return "?"
}

/// Which of `count` placeholder tones `key` gets, the same one for the same
/// key, as Android's `toneBrush` picks it (Java's string hash, floor-mod).
public func toneIndex(_ key: String, count: Int) -> Int {
  var hash: Int32 = 0
  for unit in key.utf16 { hash = hash &* 31 &+ Int32(unit) }
  let value = Int(hash) % count
  return value < 0 ? value + count : value
}

/// A YYYY-MM-DD day as a date at the start of that day in `calendar`'s zone.
public func parseDay(_ day: String?, calendar: Calendar = .current) -> Date? {
  guard let day else { return nil }
  let parts = day.split(separator: "-").compactMap { Int($0) }
  guard parts.count == 3 else { return nil }
  return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
}

/// An ISO time from the server, with or without fractions of a second.
public func parseInstant(_ value: String) -> Date? {
  if let date = try? Date(value, strategy: .iso8601) { return date }
  return try? Date(
    value, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))
}
