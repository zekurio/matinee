import Foundation

/// TitleScreens.kt resolves hidden specials too when opening a direct link.
public func titleSeason(_ title: Title, number: Int?) -> Season? {
  title.seasons.first { $0.number == number }
    ?? title.specials.flatMap { $0.number == number ? $0 : nil }
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
