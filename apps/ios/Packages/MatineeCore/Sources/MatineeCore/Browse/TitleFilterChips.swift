import Foundation

/*
 * TitleFilters.kt's presentation helpers, without their words: the filters
 * in use as chips that each take their own off, what a card says under its
 * name for the list's order, the orders the sort offers, and why a list has
 * nothing in it. The app words each (Matinee/UI/browse/TitleFilters.swift).
 */

/// A filter in use, as its chip names it. A range is one chip; so is each
/// genre and studio. Android's `ActiveFilter`, less the label.
public enum TitleFilterChip: Hashable, Sendable {
  /// A `WatchFilter`.
  case watched(String)
  case genre(String)
  case studio(String)
  case years(from: Int?, to: Int?)
  case score(min: Double?, max: Double?)
  /// An age rating for movies; `named` when the list has both kinds' ratings, so the chip says which.
  case movieRating(String, named: Bool)
  case showRating(String, named: Bool)
  /// A language tag.
  case language(String)
  case runtime(min: Int?, max: Int?)

  /// Tells chips apart in a row.
  public var key: String {
    switch self {
    case .watched: "watched"
    case .genre(let name): "genre-\(name)"
    case .studio(let name): "studio-\(name)"
    case .years: "years"
    case .score: "score"
    case .movieRating: "movieRating"
    case .showRating: "showRating"
    case .language: "language"
    case .runtime: "runtime"
    }
  }

  /// `filters` with this one taken off, the rest as they were.
  public func removed(from filters: TitleFilters) -> TitleFilters {
    var next = filters
    switch self {
    case .watched: next.watched = nil
    case .genre(let name): next.genres = (filters.genres ?? []).filter { $0 != name }
    case .studio(let name): next.studios = (filters.studios ?? []).filter { $0 != name }
    case .years:
      next.yearFrom = nil
      next.yearTo = nil
    case .score:
      next.scoreMin = nil
      next.scoreMax = nil
    case .movieRating: next.movieRating = nil
    case .showRating: next.showRating = nil
    case .language: next.language = nil
    case .runtime:
      next.runtimeMin = nil
      next.runtimeMax = nil
    }
    return next
  }
}

/// The filters in use as chips, in Android's order: watched, the genres,
/// the studios, years, score, the age ratings, language, and runtime.
/// `options` says whether the list offers both kinds' ratings.
public func activeTitleFilters(_ filters: TitleFilters, options: TitleFilterOptions?) -> [TitleFilterChip] {
  var chips: [TitleFilterChip] = []
  if let watched = filters.watched { chips.append(.watched(watched)) }
  chips += (filters.genres ?? []).map(TitleFilterChip.genre)
  chips += (filters.studios ?? []).map(TitleFilterChip.studio)
  if filters.yearFrom != nil || filters.yearTo != nil {
    chips.append(.years(from: filters.yearFrom, to: filters.yearTo))
  }
  if filters.scoreMin != nil || filters.scoreMax != nil {
    chips.append(.score(min: filters.scoreMin, max: filters.scoreMax))
  }
  // With one kind of title, "Rated up to"; with both, which kind.
  let both = (options?.ratings.count ?? 0) > 1
  if let limit = filters.movieRating { chips.append(.movieRating(limit.rating, named: both)) }
  if let limit = filters.showRating { chips.append(.showRating(limit.rating, named: both)) }
  if let language = filters.language { chips.append(.language(language)) }
  if filters.runtimeMin != nil || filters.runtimeMax != nil {
    chips.append(.runtime(min: filters.runtimeMin, max: filters.runtimeMax))
  }
  return chips
}

/// What a card says under its name: the year, with the score or the
/// runtime before it while the list is ordered by that, as the web's and
/// Discover's cards do. Nil when there's nothing to say.
public enum TitleCardDetail: Hashable, Sendable {
  case year(Int)
  case score(Double, year: Int?)
  /// Minutes, more than none.
  case runtime(Int, year: Int?)
}

public func titleCardDetail(_ title: TitleSummary, sort: String) -> TitleCardDetail? {
  if sort == TitleSort.score, let score = title.rating { return .score(score, year: title.year) }
  if sort == TitleSort.runtime, let minutes = title.runtimeMinutes, minutes > 0 {
    return .runtime(minutes, year: title.year)
  }
  return title.year.map(TitleCardDetail.year)
}

/// The orders the sort offers: each sort the list has values for, both
/// ways, or all ten while what the list offers isn't known yet.
public func offeredTitleOrders(_ options: TitleFilterOptions?) -> [TitleOrder] {
  guard let options else { return TITLE_ORDERS }
  return TITLE_ORDERS.filter { options.sorts.contains($0.sort) }
}

extension TitleListState {
  /// The sort and its way, as the menu names them; nil for a pair it doesn't offer.
  public var currentOrder: TitleOrder? {
    TITLE_ORDERS.first { $0.sort == sort && $0.order == order }
  }

  /// Orders the list by `choice`.
  public func apply(_ choice: TitleOrder) {
    sort = choice.sort
    order = choice.order
  }

  /// How many filters are on, for the Filter button.
  public var activeFilters: Int { filters.activeCount }

  /// Every filter off; the search and the order stay.
  public func clearFilters() { filters = NO_TITLE_FILTERS }
}

/// Why a list with `state` shows no titles: the search first, then the filters.
@MainActor public func libraryEmpty(_ state: TitleListState) -> LibraryEmpty {
  if !state.settled.isEmpty { return .noMatch(state.settled) }
  if state.filters.activeCount > 0 { return .noFilterMatch }
  return .none
}

/// A genre's or a studio's titles as the server is asked for them: the
/// page's own genre or studio first, with what the person picked, each once.
/// The page's own isn't a chip to take off; it's the page.
public func browseFilters(genre: String?, studio: String?, picked: TitleFilters) -> TitleFilters {
  var filters = picked
  filters.genres = (genre.map { [$0] } ?? []) + (picked.genres ?? []).filter { $0 != genre }
  filters.studios = (studio.map { [$0] } ?? []) + (picked.studios ?? []).filter { $0 != studio }
  return filters
}

/// The kind chips of a genre's or a studio's page: all, movies, and shows,
/// always, as Android's `BROWSE_KINDS`, each with how many titles it has
/// once the server has counted them, for a screen reader to say.
public func browseKinds(_ counts: BrowsedTitles.Kinds?) -> [(kind: String?, count: Int?)] {
  [(nil, counts.map { $0.movie + $0.show }), (TitleKind.movie, counts?.movie), (TitleKind.show, counts?.show)]
}

/// The kind chips of a genre's or a studio's page, each with how many
/// titles it has: all, movies, and shows, as the web's `KindPicker`. Nil
/// when there's only one kind to pick, unless one is picked, which keeps a
/// way back to both.
public func browseKindChoices(_ counts: BrowsedTitles.Kinds?, picked: String?) -> [(kind: String?, count: Int)]? {
  guard let counts else { return nil }
  if picked == nil, counts.movie == 0 || counts.show == 0 { return nil }
  return [(nil, counts.movie + counts.show), (TitleKind.movie, counts.movie), (TitleKind.show, counts.show)]
}
