import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TitleFilters.kt's sheet, for a remote: a list's filters in the panel at
 * the right edge, as Android TV offers its sort and genre. What the server
 * offers for the list (`TitleFilterOptions`) decides which rows show, in
 * the phone's order. A choice among a few in order, progress and an age
 * rating, is a row that Left and Right step; each end of a range, the
 * years, the score, and the runtime, is one too, so a slider's two handles
 * become two rows. Genres, studios, and the language are lists of their
 * own in the same panel, which Menu steps back out of. A pick in a list
 * applies at once; the stepped rows apply once the stepping pauses, so
 * holding Right asks the server once, not at every step.
 *
 * What's decided, which chips, which steps, is MatineeCore's
 * (Browse/TitleFilterChips.swift, Browse/TitleFilterSteps.swift); this
 * words and draws it. The words are the phone's (Matinee/UI/browse/
 * TitleFilters.swift), which a TV can't share for the phone controls
 * beside them.
 */

// MARK: Words

/// A sort and its way, as the sort panel names it.
func titleOrderText(_ order: TitleOrder) -> String {
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
private func watchText(_ state: String) -> String {
  switch state {
  case WatchFilter.unwatched: Str.webFiltersWatchUnwatched
  case WatchFilter.inProgress: Str.webFiltersWatchInProgress
  default: Str.webFiltersWatchWatched
  }
}

/// "German" for `de`, in the app's language.
private func languageText(_ tag: String) -> String {
  let locale = Locale.app
  guard let name = locale.localizedString(forIdentifier: tag), !name.isEmpty else { return tag }
  return name.prefix(1).uppercased(with: locale) + name.dropFirst()
}

/// "Germany" for `DE`, in the app's language.
private func countryText(_ code: String) -> String { Locale.app.localizedString(forRegionCode: code) ?? code }

private func yearValue(_ value: Double) -> String { String(Int(value.rounded())) }
private func runtimeValue(_ value: Double) -> String { formatRuntime(Int(value.rounded())) ?? "0" }

/// "1980 to 1989", "At least 7.5", "Up to 2h": a range as its chip says it.
private func rangeChipText(
  _ low: Double?, _ high: Double?, format: (Double) -> String, between: (String, String) -> String,
  atLeast: (String) -> String, upTo: (String) -> String
) -> String {
  switch (low, high) {
  case (let low?, let high?) where low == high: format(low)
  case (let low?, let high?): between(format(low), format(high))
  case (let low?, nil): atLeast(format(low))
  case (nil, let high?): upTo(format(high))
  case (nil, nil): ""
  }
}

/// What the button for a filter in use says.
func titleFilterChipText(_ chip: TitleFilterChip) -> String {
  switch chip {
  case .watched(let state): watchText(state)
  case .genre(let name), .studio(let name): name
  case .years(let from, let to):
    rangeChipText(
      from.map(Double.init), to.map(Double.init), format: yearValue, between: Str.webFiltersBetween,
      atLeast: Str.webFiltersFrom, upTo: Str.webFiltersUpTo)
  case .score(let min, let max):
    rangeChipText(
      min, max, format: formatRating, between: Str.webFiltersChipScoreBetween, atLeast: Str.webFiltersChipScoreAtLeast,
      upTo: Str.webFiltersChipScoreUpTo)
  case .movieRating(let rating, let named): named ? Str.webFiltersChipMovieRating(rating) : Str.webFiltersChipRating(rating)
  case .showRating(let rating, let named): named ? Str.webFiltersChipShowRating(rating) : Str.webFiltersChipRating(rating)
  case .language(let tag): languageText(tag)
  case .runtime(let min, let max):
    rangeChipText(
      min.map(Double.init), max.map(Double.init), format: runtimeValue, between: Str.webFiltersChipRuntimeBetween,
      atLeast: Str.webFiltersChipRuntimeAtLeast, upTo: Str.webFiltersChipRuntimeUpTo)
  }
}

// MARK: The panels

/// What the filters panel shows: the filters, or one of the lists it opens.
enum TVFilterPage: String, Identifiable, Hashable {
  case filters, genres, studios, language

  var id: String { rawValue }

  var title: String {
    switch self {
    case .filters: Str.webFiltersTitle
    case .genres: Str.webFiltersGenres
    case .studios: Str.webFiltersStudios
    case .language: Str.webFiltersLanguage
    }
  }
}

extension View {
  /// A list's filters in the panel at the right while `page` is set, and
  /// its sort in a panel of its own while `sorting`. `kind` is the kind of
  /// every title in the list, if they're all one, for what runtime means;
  /// `own` is the genre or studio a page is for, which isn't offered as a
  /// filter on its own page.
  func tvTitleFilters(
    page: Binding<TVFilterPage?>, sorting: Binding<Bool>, options: Loader<TitleFilterOptions>, state: TitleListState,
    kind: String?, own: (genre: String?, studio: String?) = (nil, nil)
  ) -> some View {
    let offered = offeredTitleOrders(options.state.value)
    return
      self
      .tvOptionsPanel(
        isPresented: sorting, title: Str.librarySort,
        selection: Binding(get: { state.currentOrder ?? TITLE_ORDERS[0] }, set: { state.apply($0) }),
        options: offered.map { TVOption($0, titleOrderText($0)) })
      .tvSidePanel(item: page, title: { $0.title }) { shown in
        TVFilterRows(page: shown, current: page, options: options, state: state, kind: kind, own: own)
      }
  }
}

/// The rows of the filters panel for `page`.
private struct TVFilterRows: View {
  let page: TVFilterPage
  @Binding var current: TVFilterPage?
  let options: Loader<TitleFilterOptions>
  let state: TitleListState
  let kind: String?
  let own: (genre: String?, studio: String?)
  /// Stepped rows' filters, until the stepping pauses.
  @State private var draft: TitleFilters?
  @FocusState private var focused: String?
  @Environment(\.palette) private var palette

  /// The filters as the rows show them: what's being stepped, else what's in force.
  private var filters: TitleFilters { draft ?? state.filters }

  var body: some View {
    Group {
      switch options.state {
      case .loading:
        Spinner(size: 56, tint: palette.mutedForeground)
          .frame(maxWidth: .infinity)
          .padding(.top, 40)
      case .failed(let message, _):
        VStack(alignment: .leading, spacing: TVSpace.s2) {
          Text(Str.browseFiltersFailed).textStyle(.body)
          Text(message).textStyle(.caption).foregroundStyle(palette.mutedForeground)
        }
        .padding(.horizontal, TVListItems.inset)
        .frame(maxWidth: .infinity, alignment: .leading)
        TVListItem(Str.commonRetry, icon: .refreshCw, quiet: true, action: options.reload)
          .focused($focused, equals: "retry")
          .padding(.top, TVSpace.s4)
      case .ready(let offered):
        switch page {
        case .filters: filterRows(offered)
        case .genres:
          multiRows(offered.genres.filter { $0.name != own.genre }, picked: filters.genres ?? []) { $0.genres = $1 }
        case .studios:
          multiRows(offered.studios.filter { $0.name != own.studio }, picked: filters.studios ?? []) { $0.studios = $1 }
        case .language: languageRows(offered)
        }
      }
    }
    .defaultFocus($focused, firstRow)
    // The rows change in place, from the filters to a list and back: focus to the list's
    // pick, or back on the row that opened it.
    .onChange(of: page) { old, new in focused = new == .filters ? old.rawValue : firstRow }
    // From a list, Menu goes back to the filters.
    .onTVBack(isActive: page != .filters) { current = .filters }
    // Stepping paused: the list follows.
    .task(id: draft) {
      guard let draft else { return }
      try? await Task.sleep(for: .milliseconds(600))
      if Task.isCancelled { return }
      commit(draft)
    }
    .onDisappear { if let draft { commit(draft) } }
  }

  private var firstRow: String? {
    guard let offered = options.state.value else { return options.state.isFailed ? "retry" : nil }
    switch page {
    case .filters: return filterRowIds(offered).first
    case .genres: return (filters.genres?.first).map { "genre-\($0)" } ?? "any"
    case .studios: return (filters.studios?.first).map { "genre-\($0)" } ?? "any"
    case .language: return filters.language.map { "genre-\($0)" } ?? "any"
    }
  }

  /// The filters' rows' ids in their order, for where focus starts.
  private func filterRowIds(_ offered: TitleFilterOptions) -> [String] {
    var ids: [String] = []
    if offered.total > 0 { ids.append("watched") }
    if !offered.genres.filter({ $0.name != own.genre }).isEmpty { ids.append(TVFilterPage.genres.rawValue) }
    if !offered.studios.filter({ $0.name != own.studio }).isEmpty { ids.append(TVFilterPage.studios.rawValue) }
    if offered.languages.count > 1 { ids.append(TVFilterPage.language.rawValue) }
    if !offered.ratings.isEmpty { ids.append("rating-0") }
    if offered.years != nil { ids.append("years-low") }
    if offered.scores != nil { ids.append("score-low") }
    if offered.runtime != nil { ids.append("runtime-low") }
    return ids
  }

  private func commit(_ next: TitleFilters) {
    draft = nil
    if state.filters != next { state.filters = next }
  }

  /// Applies a pick at once, with anything still being stepped.
  private func apply(_ change: (inout TitleFilters) -> Void) {
    var next = filters
    change(&next)
    commit(next)
  }

  /// A stepped row's change, applied once the stepping pauses.
  private func step(_ change: (inout TitleFilters) -> Void) {
    var next = filters
    change(&next)
    draft = next
  }

  // MARK: The filters

  @ViewBuilder private func filterRows(_ offered: TitleFilterOptions) -> some View {
    let filters = filters
    if offered.total > 0 {
      TVStepRow(filters.watched.map(watchText) ?? Str.webFiltersAny, title: Str.webFiltersProgress) { by in
        step { $0.watched = stepChoice(WATCH_FILTER_STEPS, current: $0.watched, by: by) }
      }
      .focused($focused, equals: "watched")
    }
    let genres = offered.genres.filter { $0.name != own.genre }
    if !genres.isEmpty {
      listRow(.genres, value: list(filters.genres) ?? Str.webFiltersAny)
    }
    let studios = offered.studios.filter { $0.name != own.studio }
    if !studios.isEmpty {
      listRow(.studios, value: list(filters.studios) ?? Str.webFiltersAny)
    }
    if offered.languages.count > 1 {
      listRow(.language, value: filters.language.map(languageText) ?? Str.webFiltersAnyLanguage)
    }
    if !offered.ratings.isEmpty {
      TVListHeading(Str.webFiltersRating)
      ForEach(Array(offered.ratings.enumerated()), id: \.offset) { index, system in
        ratingRow(system, both: offered.ratings.count > 1)
          .focused($focused, equals: "rating-\(index)")
      }
    }
    if let years = offered.years {
      TVListHeading(Str.webFiltersYears)
      rangeRows(
        "years", span: years, low: filters.yearFrom.map(Double.init), high: filters.yearTo.map(Double.init),
        words: (Str.iosFiltersYearFrom, Str.iosFiltersYearTo), format: yearValue
      ) { next, low, high in
        next.yearFrom = low.map { Int($0.rounded()) }
        next.yearTo = high.map { Int($0.rounded()) }
      }
    }
    if let scores = offered.scores {
      TVListHeading(Str.webFiltersScore)
      rangeRows(
        "score", span: scores, low: filters.scoreMin, high: filters.scoreMax,
        words: (Str.webFiltersLowest, Str.webFiltersHighest), format: formatRating
      ) { next, low, high in
        next.scoreMin = low
        next.scoreMax = high
      }
    }
    if let runtime = offered.runtime {
      TVListHeading(Str.webFiltersRuntime)
      // A show's runtime is an episode's, which a list with shows in it says.
      if kind != TitleKind.movie {
        Text(kind == TitleKind.show ? Str.webFiltersRuntimeHintShow : Str.webFiltersRuntimeHintBoth)
          .textStyle(.caption).foregroundStyle(palette.mutedForeground)
          .padding(.horizontal, TVListItems.inset)
          .padding(.bottom, TVSpace.s2)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      rangeRows(
        "runtime", span: runtime, low: filters.runtimeMin.map(Double.init), high: filters.runtimeMax.map(Double.init),
        words: (Str.iosFiltersRuntimeMin, Str.iosFiltersRuntimeMax), format: runtimeValue
      ) { next, low, high in
        next.runtimeMin = low.map { Int($0.rounded()) }
        next.runtimeMax = high.map { Int($0.rounded()) }
      }
    }
    if filters.activeCount > 0 {
      TVListItem(Str.browseClearFilters, icon: .x, quiet: true) {
        draft = nil
        state.clearFilters()
        focused = filterRowIds(offered).first
      }
      .focused($focused, equals: "clear")
      .padding(.top, TVSpace.s4)
    }
  }

  /// A row that opens one of the lists, saying what's picked in it.
  private func listRow(_ page: TVFilterPage, value: String) -> some View {
    TVListItem(page.title, quiet: true, action: { current = page }) { TVListValue(value) }
      .focused($focused, equals: page.rawValue)
  }

  /// One kind's age ratings as a stepped "up to": named by its country, and its kind when the list has both.
  private func ratingRow(_ system: RatingSystem, both: Bool) -> some View {
    let show = system.kind == TitleKind.show
    let limit = show ? filters.showRating : filters.movieRating
    let country = countryText(system.country)
    let title =
      both ? (show ? Str.webFiltersRatingRowShow(country) : Str.webFiltersRatingRowMovie(country)) : country
    let value =
      limit.flatMap { $0.country == system.country ? Str.webFiltersUpTo($0.rating) : nil } ?? Str.webFiltersAny
    return TVStepRow(value, title: title, label: "\(Str.webFiltersRating), \(title)") { by in
      step { next in
        if show {
          next.showRating = stepAgeLimit(system, current: next.showRating, by: by)
        } else {
          next.movieRating = stepAgeLimit(system, current: next.movieRating, by: by)
        }
      }
    }
  }

  /// A range's two ends as two stepped rows, each open, "Any", at the span's end.
  @ViewBuilder private func rangeRows(
    _ key: String, span: FilterRange, low: Double?, high: Double?, words: (low: String, high: String),
    format: @escaping (Double) -> String, set: @escaping (inout TitleFilters, Double?, Double?) -> Void
  ) -> some View {
    TVStepRow(low.map(format) ?? Str.webFiltersAny, title: words.low) { by in
      step { next in
        let (a, b) = stepRange(span, low: low, high: high, end: .low, by: by)
        set(&next, a, b)
      }
    }
    .focused($focused, equals: "\(key)-low")
    TVStepRow(high.map(format) ?? Str.webFiltersAny, title: words.high) { by in
      step { next in
        let (a, b) = stepRange(span, low: low, high: high, end: .high, by: by)
        set(&next, a, b)
      }
    }
    .focused($focused, equals: "\(key)-high")
  }

  /// "Drama, Comedy", or nil for none.
  private func list(_ names: [String]?) -> String? {
    guard let names, !names.isEmpty else { return nil }
    return names.joined(separator: ", ")
  }

  // MARK: The lists

  /// Genres or studios, each on or off, with how many titles each has; Any takes them all off.
  @ViewBuilder private func multiRows(
    _ facets: [Facet], picked: [String], set: @escaping (inout TitleFilters, [String]) -> Void
  ) -> some View {
    TVListItem(Str.webFiltersAny, quiet: true, checked: picked.isEmpty) { apply { set(&$0, []) } }
      .focused($focused, equals: "any")
    ForEach(facets, id: \.name) { facet in
      let on = picked.contains(facet.name)
      TVListItem(
        facet.name, quiet: true, checked: on,
        action: { apply { set(&$0, on ? picked.filter { $0 != facet.name } : picked + [facet.name]) } }
      ) {
        TVListValue(formatCount(facet.titleCount), chevron: false)
      }
      .focused($focused, equals: "genre-\(facet.name)")
      .accessibilityAddTraits(on ? .isSelected : [])
    }
  }

  /// The original languages, one at a time; picking one goes back to the filters.
  @ViewBuilder private func languageRows(_ offered: TitleFilterOptions) -> some View {
    let picked = filters.language
    TVListItem(Str.webFiltersAnyLanguage, quiet: true, checked: picked == nil) {
      apply { $0.language = nil }
      current = .filters
    }
    .focused($focused, equals: "any")
    ForEach(offered.languages, id: \.language) { entry in
      TVListItem(
        languageText(entry.language), quiet: true, checked: picked == entry.language,
        action: {
          apply { $0.language = entry.language }
          current = .filters
        }
      ) {
        TVListValue(formatCount(entry.titleCount), chevron: false)
      }
      .focused($focused, equals: "genre-\(entry.language)")
    }
  }
}

// MARK: Loading what's offered

extension View {
  /// Loads what each filter offers for the titles in a scope into `options`,
  /// as Android's `rememberFilterOptions`; another scope, as another kind
  /// picked, fetches again at once.
  func tvLoadsFilterOptions(
    _ options: Loader<TitleFilterOptions>, kind: String? = nil, genre: String? = nil, studio: String? = nil
  ) -> some View {
    modifier(LoadsFilterOptions(options: options, scope: [kind, genre, studio]))
  }
}

private struct LoadsFilterOptions: ViewModifier {
  let options: Loader<TitleFilterOptions>
  /// The kind, genre, and studio.
  let scope: [String?]
  @Environment(\.api) private var api

  func body(content: Content) -> some View {
    let scope = scope
    content
      .loads(options) { api in try await Self.fetch(api, scope) }
      .onChange(of: scope) {
        guard let api else { return }
        options.configure(describe: describeFailure) { try await Self.fetch(api, scope) }
        options.reload()
      }
  }

  private nonisolated static func fetch(_ api: MatineeApi, _ scope: [String?]) async throws -> TitleFilterOptions {
    let found = try await api.titles.filterOptions(kind: scope[0], genre: scope[1], studio: scope[2])
    #if DEBUG
      if BrowseFixtures.on { return BrowseFixtures.options(found) }
    #endif
    return found
  }
}
