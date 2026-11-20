import MatineeCore
import MatineeKit
import SwiftUI

/*
 * What both apps' browsing pages share: loading a list a page at a time
 * and what its filters offer, and the words for a sort, a filter, and a
 * range. What the pages load and filter by is MatineeCore's (Browse/). The
 * Apple TV app compiles this file too (project.yml).
 */

extension View {
  /// Loads `pages` from the server for this screen, once it shows, as
  /// Android's `rememberTitlePages`: `key` names the list, and another key
  /// starts it again from the top. Marks changed elsewhere fetch what's
  /// loaded again in place, so the grid keeps its place.
  func pages(
    _ pages: TitlePages, key: String,
    fetch: @escaping @Sendable (_ api: MatineeApi, _ offset: Int, _ limit: Int) async throws -> TitleList
  ) -> some View {
    modifier(LoadsPages(pages: pages, key: key, fetch: fetch))
  }
}

private struct LoadsPages: ViewModifier {
  let pages: TitlePages
  let key: String
  let fetch: @Sendable (MatineeApi, Int, Int) async throws -> TitleList
  @Environment(\.api) private var api
  @Environment(ViewerState.self) private var viewer: ViewerState?

  func body(content: Content) -> some View {
    content
      .onAppear(perform: configure)
      .onChange(of: key, configure)
      .onChange(of: viewer?.version) { Task { await pages.refresh() } }
  }

  private func configure() {
    guard let api else { return }
    let fetch = fetch
    pages.configure(key: key) { offset, limit in try await fetch(api, offset, limit) }
  }
}

extension View {
  /// Loads what each filter offers for the titles in a scope, into `options`,
  /// as Android's `rememberFilterOptions`; another scope fetches again.
  func loadsFilterOptions(
    _ options: Loader<TitleFilterOptions>, libraryId: String? = nil, kind: String? = nil, genre: String? = nil,
    studio: String? = nil
  ) -> some View {
    modifier(LoadsFilterOptions(options: options, scope: [libraryId, kind, genre, studio]))
  }
}

private struct LoadsFilterOptions: ViewModifier {
  let options: Loader<TitleFilterOptions>
  /// The library, kind, genre, and studio.
  let scope: [String?]
  @Environment(\.api) private var api

  func body(content: Content) -> some View {
    let scope = scope
    content
      .loads(options) { api in try await Self.fetch(api, scope) }
      .onChange(of: scope) {
        // Another scope, as another kind picked: the fetch for it, at once.
        guard let api else { return }
        options.configure(describe: describeFailure) { try await Self.fetch(api, scope) }
        options.reload()
      }
  }

  private nonisolated static func fetch(_ api: MatineeApi, _ scope: [String?]) async throws -> TitleFilterOptions {
    let found = try await api.titles.filterOptions(
      libraryId: scope[0], kind: scope[1], genre: scope[2], studio: scope[3])
    return found
  }
}

/// A kind's name on a genre's or studio's page: all, movies, or shows.
func browseKindLabel(_ kind: String?) -> String {
  switch kind {
  case TitleKind.movie: Str.browseKindMovie
  case TitleKind.show: Str.browseKindShow
  default: Str.browseKindAll
  }
}

/// How many movies and shows a genre or studio has, as the server counted
/// them with the newest page, for what the kind chips say to VoiceOver.
@Observable final class BrowseKinds {
  private(set) var value: BrowsedTitles.Kinds?

  func show(_ kinds: BrowsedTitles.Kinds) { if value != kinds { value = kinds } }
}

// MARK: Words

/// A sort and its way, as the menu names it.
func titleOrderLabel(_ order: TitleOrder) -> String {
  switch (order.sort, order.order) {
  case (TitleSort.name, SortOrder.desc): Str.webFiltersSortNameDesc
  case (TitleSort.recent, SortOrder.desc): Str.webFiltersSortRecentNew
  case (TitleSort.recent, _): Str.webFiltersSortRecentOld
  case (TitleSort.year, SortOrder.desc): Str.webFiltersSortNewest
  case (TitleSort.year, _): Str.webFiltersSortOldest
  case (TitleSort.score, SortOrder.desc): Str.webFiltersSortScoreHigh
  case (TitleSort.score, _): Str.webFiltersSortScoreLow
  case (TitleSort.runtime, SortOrder.desc): Str.webFiltersSortLongest
  case (TitleSort.runtime, _): Str.webFiltersSortShortest
  default: Str.webFiltersSortNameAsc
  }
}

/// A `WatchFilter`'s name.
func watchWord(_ state: String) -> String {
  switch state {
  case WatchFilter.unwatched: Str.webFiltersWatchUnwatched
  case WatchFilter.inProgress: Str.webFiltersWatchInProgress
  default: Str.webFiltersWatchWatched
  }
}

/// "Germany" for `DE`, in the app's language.
func filterCountryName(_ code: String) -> String {
  Locale.app.localizedString(forRegionCode: code) ?? code
}

/// What a chip says.
func titleFilterChipLabel(_ chip: TitleFilterChip) -> String {
  switch chip {
  case .watched(let state): watchWord(state)
  case .genre(let name), .studio(let name): name
  case .years(let from, let to):
    rangeText(from.map(Double.init), to.map(Double.init), format: yearText, any: "", words: .year)
  case .score(let min, let max): rangeText(min, max, format: formatRating, any: "", words: .scoreChip)
  case .movieRating(let rating, let named): named ? Str.webFiltersChipMovieRating(rating) : Str.webFiltersChipRating(rating)
  case .showRating(let rating, let named): named ? Str.webFiltersChipShowRating(rating) : Str.webFiltersChipRating(rating)
  case .language(let tag): languageName(tag)
  case .runtime(let min, let max):
    rangeText(min.map(Double.init), max.map(Double.init), format: runtimeText, any: "", words: .runtimeChip)
  }
}

/// The keys that word a range: both ends, the low one, the high one.
struct RangeWords {
  let between: (String, String) -> String
  let low: (String) -> String
  let high: (String) -> String

  /// "Between 1980 and 1989", "At least 7.5", "Up to 120".
  static let panel = RangeWords(between: Str.webFiltersBetween, low: Str.webFiltersAtLeast, high: Str.webFiltersUpTo)
  /// Years: "From 1980".
  static let year = RangeWords(between: Str.webFiltersBetween, low: Str.webFiltersFrom, high: Str.webFiltersUpTo)
  static let scoreChip = RangeWords(
    between: Str.webFiltersChipScoreBetween, low: Str.webFiltersChipScoreAtLeast, high: Str.webFiltersChipScoreUpTo)
  static let runtimeChip = RangeWords(
    between: Str.webFiltersChipRuntimeBetween, low: Str.webFiltersChipRuntimeAtLeast,
    high: Str.webFiltersChipRuntimeUpTo)
}

/// "1980 to 1989", "At least 7.5", or `any` with both ends open.
func rangeText(_ low: Double?, _ high: Double?, format: (Double) -> String, any: String, words: RangeWords) -> String {
  switch (low, high) {
  case (let low?, let high?) where low == high: format(low)
  case (let low?, let high?): words.between(format(low), format(high))
  case (let low?, nil): words.low(format(low))
  case (nil, let high?): words.high(format(high))
  case (nil, nil): any
  }
}

/// A year without its thousands separator.
func yearText(_ value: Double) -> String { String(Int(value.rounded())) }

/// A length in minutes, in words.
func runtimeText(_ value: Double) -> String { formatRuntime(Int(value.rounded())) ?? "0" }
