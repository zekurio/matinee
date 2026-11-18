import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TitleFilters.kt: a list of titles' filters and order, for a library's
 * page and a genre's or studio's, as the web's: what the server offers for
 * the list, in the shared filter sheet (components/FilterSheet.swift), the
 * filters in use as chips, and the sort in a menu, each sort both ways.
 * What's decided, which chips, which orders, what a card says, is
 * MatineeCore's (Browse/TitleFilterChips.swift); this words and draws it.
 *
 * On a phone the bar holds icons for these, as Android's; from the web's
 * `sm` width up, as on an iPad, they're the web's header controls: Filter
 * with its count, and the sort as a select that says what it is.
 */

/// How many studios show before the field that finds the rest.
private let STUDIOS_SHOWN = 10

/// Wide enough for the web's header controls in words, its `sm` from 640 up,
/// on an iPad, unless the text is so large that words wouldn't fit beside
/// the name. A phone keeps Android's icons in the bar whichever way it's held.
func wideControls(_ window: CGSize, _ typeSize: DynamicTypeSize, _ style: ShellStyle) -> Bool {
  style == .tablet && window.width >= 640 && !typeSize.isAccessibilitySize
}

// MARK: Words

/// The filters in use as the shared chips, each taking its own off through `change`.
func titleFilterChips(
  _ filters: TitleFilters, options: TitleFilterOptions?, change: @escaping (TitleFilters) -> Void
) -> [ActiveFilter] {
  activeTitleFilters(filters, options: options).map { chip in
    ActiveFilter(key: chip.key, label: titleFilterChipLabel(chip)) { change(chip.removed(from: filters)) }
  }
}

/// What a card says under its name for the list's order: the year, or the
/// score or runtime before it while sorted by that.
func titleCardDetailText(_ title: TitleSummary, sort: String) -> String? {
  switch titleCardDetail(title, sort: sort) {
  case nil: nil
  case .year(let year): formatYear(year)
  case .score(let score, let year):
    year.map { Str.webFiltersCardScore(formatRating(score), String($0)) } ?? Str.webFiltersCardScoreOnly(formatRating(score))
  case .runtime(let minutes, let year):
    formatRuntime(minutes).map { runtime in
      year.map { Str.webFiltersCardRuntime(runtime, String($0)) } ?? Str.webFiltersCardRuntimeOnly(runtime)
    }
  }
}

// MARK: Controls

/// The Filter button: on a phone the bar's icon with how many are on in a
/// badge, as the web's dot but saying how many; wider, the web's outlined
/// "Filter" with the count in a pill.
struct TitleFilterButton: View {
  let active: Int
  let action: () -> Void
  @Environment(\.windowSize) private var window
  @Environment(\.dynamicTypeSize) private var typeSize
  @Environment(\.shellStyle) private var style
  @Environment(\.palette) private var palette

  var body: some View {
    let label = active > 0 ? Str.browseFiltersOn(active) : Str.webFiltersTitle
    if wideControls(window, typeSize, style) {
      MatineeButton(look: .outline, action: action) {
        HStack(spacing: Space.s2) {
          LucideIcon(.listFilter, size: 16)
          Text(Str.libraryFilter)
          if active > 0 {
            Text(formatCount(active))
              .textStyle(.xs, weight: .medium)
              .monospacedDigit()
              .foregroundStyle(palette.background)
              .padding(.horizontal, Space.s1_5)
              .background(palette.foreground, in: Capsule())
          }
        }
      }
      .accessibilityLabel(label)
    } else {
      RoundIconButton(.listFilter, label: label, look: .ghost, size: 48, iconSize: 22, action: action)
        .overlay(alignment: .topTrailing) {
          if active > 0 {
            Text(formatCount(active))
              .textStyle(.px10, weight: .semibold)
              .monospacedDigit()
              // A badge on a glyph that keeps its size: grown, it would cover the glyph.
              .dynamicTypeSize(...DynamicTypeSize.large)
              .foregroundStyle(palette.accentForeground)
              .frame(minWidth: 16, minHeight: 16)
              .padding(.horizontal, 2)
              .background(palette.accent, in: Capsule())
              .padding(.top, Space.s2)
              .padding(.trailing, Space.s1_5)
              .allowsHitTesting(false)
              .accessibilityHidden(true)
          }
        }
    }
  }
}

/// The sort, in a menu of each sort the list has values for, both ways: the
/// bar's icon on a phone, the web's select ("Sort: Name A–Z") wider.
struct TitleSortButton: View {
  let state: TitleListState
  let options: TitleFilterOptions?
  @State private var open = false
  @Environment(\.windowSize) private var window
  @Environment(\.dynamicTypeSize) private var typeSize
  @Environment(\.shellStyle) private var style

  var body: some View {
    let current = state.currentOrder
    let label = current.map { Str.browseSortCurrent(titleOrderLabel($0)) } ?? Str.librarySort
    Group {
      if wideControls(window, typeSize, style) {
        MatineeButton(look: .outline, action: { open = true }) {
          HStack(spacing: Space.s1_5) {
            Text(label).lineLimit(1)
            LucideIcon(.chevronDown, size: 16)
          }
        }
      } else {
        RoundIconButton(.arrowUpDown, label: label, look: .ghost, size: 48, iconSize: 22) { open = true }
      }
    }
    .dropdownMenu(isPresented: $open, align: .trailing) {
      MenuLabel(Str.librarySort)
      ForEach(offeredTitleOrders(options), id: \.self) { choice in
        MenuItem(titleOrderLabel(choice), selected: choice == current) {
          withMotion(Motion.move) { state.apply(choice) }
        }
      }
    }
  }
}

// MARK: The sheet

extension View {
  /// A list's filters in the shared sheet, as Android's `TitleFilterSheet`.
  /// `kind` is the kind of every title in the list, if they're all one, for
  /// what runtime means.
  func titleFilterSheet(
    isPresented: Binding<Bool>, kind: String?, options: TitleFilterOptions?, state: TitleListState
  ) -> some View {
    modifier(TitleFilterSheet(isPresented: isPresented, kind: kind, options: options, state: state))
  }
}

private struct TitleFilterSheet: ViewModifier {
  @Binding var isPresented: Bool
  let kind: String?
  let options: TitleFilterOptions?
  let state: TitleListState

  func body(content: Content) -> some View {
    let state = state
    content
      .filterSheet(isPresented: $isPresented, active: state.filters.activeCount, onClear: state.clearFilters) {
        if let options { TitleFilterSections(kind: kind, options: options, state: state) }
      }
  }
}

/// The filters the list offers, in Android's order: progress, genres,
/// studios, years, score, age rating, language, and runtime. Each change
/// applies at once; a range when its handle is let go.
private struct TitleFilterSections: View {
  let kind: String?
  let options: TitleFilterOptions
  let state: TitleListState
  @State private var choosingLanguage = false

  var body: some View {
    // The language list opens over the filters, from inside their sheet.
    VStack(alignment: .leading, spacing: Space.s6) { sections }
      .optionSheet(
        isPresented: $choosingLanguage, title: Str.webFiltersLanguage, any: Str.webFiltersAnyLanguage,
        findPlaceholder: Str.browseFindLanguage,
        choices: options.languages.map {
          FilterChoice(value: $0.language, label: languageName($0.language), count: $0.titleCount)
        },
        current: state.filters.language
      ) { picked in
        choosingLanguage = false
        state.filters.language = picked
      }
  }

  @ViewBuilder private var sections: some View {
    @Bindable var state = state
    if options.total > 0 {
      FilterSection(Str.webFiltersProgress) {
        ChoiceChips(
          choices: [
            FilterChoice(value: WatchFilter.unwatched, label: watchWord(WatchFilter.unwatched), count: options.watched.unwatched),
            FilterChoice(
              value: WatchFilter.inProgress, label: watchWord(WatchFilter.inProgress), count: options.watched.inProgress),
            FilterChoice(value: WatchFilter.watched, label: watchWord(WatchFilter.watched), count: options.watched.watched),
          ], value: $state.filters.watched)
      }
    }
    if !options.genres.isEmpty {
      FilterSection(Str.webFiltersGenres) {
        ToggleChips(
          choices: options.genres.map { FilterChoice(value: $0.name, label: $0.name, count: $0.titleCount) },
          value: list($state.filters.genres))
      }
    }
    if !options.studios.isEmpty {
      FilterSection(Str.webFiltersStudios) {
        ToggleChips(
          choices: options.studios.map { FilterChoice(value: $0.name, label: $0.name, count: $0.titleCount) },
          value: list($state.filters.studios), limit: STUDIOS_SHOWN, findPlaceholder: Str.webFiltersFindStudio,
          noMatch: Str.webFiltersNoStudio)
      }
    }
    if let years = options.years {
      RangeField(
        title: Str.webFiltersYears, span: span(years), low: state.filters.yearFrom.map(Double.init),
        high: state.filters.yearTo.map(Double.init),
        words: { rangeText($0, $1, format: yearText, any: Str.webFiltersAnyYear, words: .year) }
      ) { low, high in
        state.filters.yearFrom = low.map { Int($0.rounded()) }
        state.filters.yearTo = high.map { Int($0.rounded()) }
      }
    }
    if let scores = options.scores {
      RangeField(
        title: Str.webFiltersScore, hint: Str.webFiltersScoreHint, span: span(scores), low: state.filters.scoreMin,
        high: state.filters.scoreMax,
        words: { rangeText($0, $1, format: formatRating, any: Str.webFiltersAnyScore, words: .panel) }
      ) { low, high in
        state.filters.scoreMin = low
        state.filters.scoreMax = high
      }
    }
    if !options.ratings.isEmpty { ratings }
    if options.languages.count > 1 {
      FilterSection(Str.webFiltersLanguage) {
        OptionRow(label: state.filters.language.map(languageName) ?? Str.webFiltersAnyLanguage) {
          choosingLanguage = true
        }
      }
    }
    if let runtime = options.runtime {
      RangeField(
        title: Str.webFiltersRuntime, hint: runtimeHint, span: span(runtime), low: state.filters.runtimeMin.map(Double.init),
        high: state.filters.runtimeMax.map(Double.init),
        words: { rangeText($0, $1, format: runtimeText, any: Str.webFiltersAnyLength, words: .panel) }
      ) { low, high in
        state.filters.runtimeMin = low.map { Int($0.rounded()) }
        state.filters.runtimeMax = high.map { Int($0.rounded()) }
      }
    }
  }

  /// The age ratings: one kind's under one heading, or both kinds' each under its own.
  @ViewBuilder private var ratings: some View {
    if let only = options.ratings.first, options.ratings.count == 1 {
      FilterSection(Str.webFiltersRating, hint: Str.webFiltersRatingHint(filterCountryName(only.country))) {
        RatingChips(system: only, state: state)
      }
    } else {
      FilterSection(Str.webFiltersRating, hint: Str.webFiltersRatingHintBoth) {
        VStack(alignment: .leading, spacing: Space.s3) {
          ForEach(options.ratings, id: \.self) { system in
            FilterSection(
              system.kind == TitleKind.show
                ? Str.webFiltersRatingRowShow(filterCountryName(system.country))
                : Str.webFiltersRatingRowMovie(filterCountryName(system.country)), small: true
            ) { RatingChips(system: system, state: state) }
          }
        }
      }
    }
  }

  /// A show's runtime is an episode's.
  private var runtimeHint: String {
    switch kind {
    case TitleKind.show: Str.webFiltersRuntimeHintShow
    case TitleKind.movie: Str.webFiltersRuntimeHintMovie
    default: Str.webFiltersRuntimeHintBoth
    }
  }

  private func span(_ range: FilterRange) -> FilterSpan { FilterSpan(min: range.min, max: range.max, step: range.step) }

  /// A list the contract keeps optional, as the chips' plain list.
  private func list(_ binding: Binding<[String]?>) -> Binding<[String]> {
    Binding(get: { binding.wrappedValue ?? [] }, set: { binding.wrappedValue = $0 })
  }
}

/// One kind's ratings as "up to" chips, "Any" first.
private struct RatingChips: View {
  let system: RatingSystem
  let state: TitleListState

  var body: some View {
    let show = system.kind == TitleKind.show
    let current = show ? state.filters.showRating : state.filters.movieRating
    ChoiceChips(
      choices: system.ratings.map { FilterChoice(value: $0.rating, label: $0.rating) },
      value: Binding(
        get: { current?.rating },
        set: { rating in
          let limit = rating.map { AgeLimit(country: system.country, rating: $0) }
          if show { state.filters.showRating = limit } else { state.filters.movieRating = limit }
        }))
  }
}
