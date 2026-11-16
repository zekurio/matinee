import Foundation

/// TitleScreens.kt resolves hidden specials too when opening a direct link.
public func titleSeason(_ title: Title, number: Int?) -> Season? {
  title.seasons.first { $0.number == number }
    ?? title.specials.flatMap { $0.number == number ? $0 : nil }
}

/// The season is the show's specials, which the account hides from its
/// seasons: its page still opens from a link, and says how to show them.
public func isHiddenSpecials(_ title: Title, _ season: Season) -> Bool {
  guard let specials = title.specials, specials.number == season.number else { return false }
  return !title.seasons.contains { $0.number == season.number }
}

/// Only the seasons returned by the server belong in the normal rail. The
/// account's showSpecials preference is already applied by the server.
public func titleSeasons(_ title: Title, current: Season? = nil, extraOnly: Bool = false) -> [Season] {
  if extraOnly { return [] }
  guard let current else { return title.seasons }
  return title.seasons.filter { $0.number != current.number }
}

/// The one regular season goes straight on the title page.
public func inlineSeason(_ title: Title) -> Season? {
  title.isShow && title.seasons.count == 1 ? title.seasons.first : nil
}

public func episodeRailStart(_ items: [MediaItem], next: MediaItem?) -> Int {
  items.firstIndex { $0.id == next?.id } ?? 0
}

/// An unfinished file with saved progress resumes instead of starting over.
public func isResuming(_ item: MediaItem?) -> Bool {
  guard let progress = item?.progress else { return false }
  return !progress.completed && progress.positionSeconds > 0
}

/// Person pages use the server's biography, local credits and catalog credits
/// unchanged. Catalog availability following belongs to the Requests feature.
public func loadPerson(_ api: MatineeApi, name: String, tmdbId: String? = nil) async throws -> Person {
  try await api.people.get(name: name, tmdbId: tmdbId)
}

// MARK: The heading

/// A movie's length for its facts: the provider's runtime, else its file's,
/// as the web's title header. Nil for a show, whose episodes differ.
public func titleRuntime(_ title: Title) -> Int? {
  guard !title.isShow else { return nil }
  if let minutes = title.runtimeMinutes, minutes > 0 { return minutes }
  return title.next.flatMap(runtimeMinutes).flatMap { $0 > 0 ? $0 : nil }
}

/// How a show's size reads in its facts, as the web's: its seasons when it
/// has more than one numbered season, else its episodes. Nil for a movie.
public enum ShowSize: Equatable, Sendable {
  case seasons(Int)
  case episodes(Int)
}

public func showSize(_ title: Title) -> ShowSize? {
  guard title.isShow else { return nil }
  let numbered = title.seasons.filter { ($0.number ?? 0) > 0 }.count
  return numbered > 1 ? .seasons(numbered) : .episodes(title.itemCount)
}

/// The badges a title's heading carries from its file: a movie's
/// resolution, dynamic range, and audio layout, as the server words them.
/// A show's episodes can differ, so it has none.
public func titleFlags(_ title: Title) -> [String] {
  guard !title.isShow, let next = title.next else { return [] }
  return mediaFlags(next)
}

/// The year a season started airing, from its first episode's air date.
public func seasonYear(_ items: [MediaItem]?) -> Int? {
  guard let day = items?.first?.episode?.airDate, day.count >= 4 else { return nil }
  return Int(day.prefix(4))
}

/// How much of a season is watched, for its facts: nothing said until one
/// episode is, then the count, then all of it.
public enum SeasonProgress: Equatable, Sendable {
  case none
  case some(Int)
  case all
}

public func seasonProgress(_ season: Season) -> SeasonProgress {
  if season.watchedCount <= 0 { return .none }
  return season.watchedCount >= season.itemCount ? .all : .some(season.watchedCount)
}

// MARK: Play

/// What a season's Play starts, as the web's: the title's own next file
/// when it's in this season, so the show's page and the season's agree;
/// else the season's file in progress, its first unwatched, or its first.
public func seasonPlay(_ title: Title, _ items: [MediaItem]?, isWatched: (MediaItem) -> Bool) -> MediaItem? {
  guard let items else { return nil }
  if let next = title.next, let here = items.first(where: { $0.id == next.id }), !isWatched(here) { return here }
  return seasonNext(items, isWatched: isWatched)
}

/// Where the rest of an episode's season starts: on the episode before it,
/// so the one after it shows next, as the web's row does. `others` leaves
/// `current` out.
public func moreFromSeasonStart(_ items: [MediaItem], current: String) -> Int {
  guard let at = items.firstIndex(where: { $0.id == current }) else { return 0 }
  return max(0, at - 1)
}

/// The episode a row of the rest of the season starts on, as a TV's focus
/// comes into it: the one after `current`, or for the last, the one before
/// it. Nil when `current` isn't in `items` or is all there is.
public func episodeAfter(_ items: [MediaItem], current: String) -> MediaItem? {
  guard let at = items.firstIndex(where: { $0.id == current }) else { return nil }
  if items.indices.contains(at + 1) { return items[at + 1] }
  return at > 0 ? items[at - 1] : nil
}

/// A movie's page lists its files when it has more than one, as a
/// director's cut beside the film, or an extra: each with what the server
/// calls it and how its streams read, to play on its own.
public func showsFiles(_ title: Title) -> Bool { !title.isShow && title.itemCount > 1 }

/// Where a file sits, as the server names its folders, for telling a
/// movie's files apart: "The Matrix (1999) / Extras". The server words the
/// folders; a season's number is the app's to word, so those are left out.
public func fileFolders(_ item: MediaItem) -> String? {
  let names = item.label.groupLabel.compactMap(\.name).filter { !$0.isEmpty }
  return names.isEmpty ? nil : names.joined(separator: " / ")
}

// MARK: Related

/// The title at its provider, for the rows of related titles the server
/// works out from it: the rest of its film series, and more like it. Nil
/// until the title is matched.
public func titleCatalogRef(_ title: Title) -> CatalogRef? {
  guard let provider = title.provider, !provider.isEmpty, let id = title.providerId, !id.isEmpty else { return nil }
  return CatalogRef(kind: title.kind, provider: provider, providerId: id)
}

/// A related row's own name: a film series' name as the server gives it;
/// nil for "More like this", which the app words.
public func relatedRailName(_ rail: RelatedRail) -> String? {
  rail.id == RelatedRailId.collection ? rail.name.flatMap { $0.isEmpty ? nil : $0 } : nil
}

/// A related title the viewer can watch is the library's card: the server
/// brought its library title, and says it's here.
public func relatedLibraryTitle(_ item: RelatedTitle) -> TitleSummary? {
  guard let title = item.title, item.availability.state == "here" else { return nil }
  if let id = item.availability.libraryTitleId, id != title.id { return nil }
  return title
}

// MARK: Specials

/// Whether a show's specials list with its seasons, for every device of
/// the account, as SettingsData.kt saves it: the server keeps it and sends
/// the account back, which `update` takes, as the session's
/// `updateUser(user:)`. The pages fetch again after, since the server
/// leaves specials out of a show's seasons by it.
@MainActor public func setShowSpecials(
  _ api: MatineeApi, _ show: Bool, update: (User) -> Void
) async throws {
  update(try await api.account.library.setPreferences(showSpecials: show))
}

