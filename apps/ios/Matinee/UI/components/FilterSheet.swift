import MatineeCore
import MatineeKit
import SwiftUI

/*
 * FilterSheet.kt: the filter sheet the libraries and Discover's browse
 * share, as the web shares its panel. The bar's Filter button, which says
 * whether any filter is on; the filters in use as chips that take
 * themselves off; and a sheet from the bottom with Clear filters and Show
 * titles, which a page fills with these parts:
 *
 *     .filterSheet(isPresented: $filtering, active: filters.count, onClear: filters.clear) {
 *       FilterSection(Str.webFiltersGenres) {
 *         ToggleChips(choices: genres, value: $filters.genres)
 *       }
 *       RangeField(Str.webFiltersYear, hint: nil, span: years, low: …, high: …, words: …) { low, high in … }
 *     }
 *
 * Each change applies at once; a range applies when its handle is let go.
 */

/// A choice among chips or in a list, with how many titles have it, where known.
struct FilterChoice<Value: Hashable>: Identifiable {
  let value: Value
  let label: String
  var count: Int?

  var id: Value { value }
}

/// A filter in use, as its chip names it.
struct ActiveFilter: Identifiable {
  let key: String
  let label: String
  let remove: () -> Void

  var id: String { key }
}

/// The bar's Filter button: the accent while any filter is on, saying how many.
struct FilterButton: View {
  let active: Int
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    RoundIconButton(
      .listFilter, label: active > 0 ? Str.browseFiltersOn(active) : Str.webFiltersTitle, look: .ghost, size: 48,
      iconSize: 22, tint: active > 0 ? palette.accent : palette.foreground, action: action)
  }
}

/// The filters in use as chips that take themselves off, and Clear all once there are two.
struct ActiveFilterChips: View {
  let chips: [ActiveFilter]
  let onClear: () -> Void
  @Environment(\.gutter) private var gutter

  var body: some View {
    ScrollView(.horizontal) {
      HStack(spacing: Space.s1_5) {
        ForEach(chips) { chip in
          Chip(chip.label, selected: true, trailingIcon: .x, action: chip.remove)
            .accessibilityLabel(Str.browseRemoveFilter(chip.label))
        }
        if chips.count > 1 {
          Chip(Str.browseClearAll, action: onClear)
        }
      }
    }
    .contentMargins(.horizontal, gutter, for: .scrollContent)
    .scrollIndicators(.hidden)
  }
}

extension View {
  /// The sheet the filters open in: their title, `content` scrolling under
  /// it, and Clear filters while any is on (`active`), beside Show titles,
  /// which closes it, pinned at the bottom. As tall as the filters, as
  /// Android's, and past the screen they scroll.
  func filterSheet<Content: View>(
    isPresented: Binding<Bool>, active: Int, onClear: @escaping () -> Void,
    @ViewBuilder content: @escaping () -> Content
  ) -> some View {
    matineeSheet(isPresented: isPresented) {
      FilterSheetBody(active: active, onClear: onClear, content: content)
    }
  }
}

private struct FilterSheetBody<Content: View>: View {
  let active: Int
  let onClear: () -> Void
  @ViewBuilder let content: () -> Content
  @Environment(\.sheetDismiss) private var dismiss

  var body: some View {
    SheetHeader(Str.webFiltersTitle)
    SheetBody(sides: Space.sheet, top: Space.s4, bottom: Space.s4, spacing: Space.s6) { content() }
    SheetFooter {
      HStack {
        if active > 0 {
          MatineeButton(Str.browseClearFilters, icon: .x, look: .ghost, action: onClear)
        }
        Spacer(minLength: 0)
        MatineeButton(Str.webFiltersDone) { dismiss() }
      }
    }
  }
}

/// A filter's heading, a line about it, what it's set to, and its control.
/// `small` is a part under a filter's own heading.
struct FilterSection<Content: View>: View {
  let title: String
  var hint: String?
  var value: String?
  var small = false
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette

  init(
    _ title: String, hint: String? = nil, value: String? = nil, small: Bool = false,
    @ViewBuilder content: @escaping () -> Content
  ) {
    self.title = title
    self.hint = hint
    self.value = value
    self.small = small
    self.content = content
  }

  var body: some View {
    VStack(alignment: .leading, spacing: small ? Space.s2 : Space.s2_5) {
      HStack(alignment: .lastTextBaseline) {
        VStack(alignment: .leading, spacing: 0) {
          if small {
            Text(title).textStyle(.px13, weight: .medium).foregroundStyle(palette.mutedForeground)
          } else {
            Text(title).textStyle(.sm, weight: .semibold).foregroundStyle(palette.foreground)
              .accessibilityAddTraits(.isHeader)
          }
          if let hint { Text(hint).textStyle(.px13).foregroundStyle(palette.mutedForeground) }
        }
        Spacer(minLength: Space.s2)
        if let value { Text(value).textStyle(.px13).foregroundStyle(palette.mutedForeground) }
      }
      content()
    }
  }
}

/// One of a few values, or none: "Any" first, then each.
struct ChoiceChips<Value: Hashable>: View {
  let choices: [FilterChoice<Value>]
  @Binding var value: Value?

  var body: some View {
    FlowRow(spacing: Space.s1_5, lineSpacing: Space.s1_5) {
      ChoiceChip(Str.webFiltersAny, selected: value == nil) { value = nil }
      ForEach(choices) { choice in
        ChoiceChip(choice.label, selected: choice.value == value, count: choice.count.map(formatCount)) {
          value = choice.value
        }
      }
    }
  }
}

/// Any number of choices, each a chip that turns on and off. Past `limit`
/// choices, a field finds the rest by name, and only the first `limit` that
/// match show, with those that are on.
struct ToggleChips: View {
  let choices: [FilterChoice<String>]
  @Binding var value: [String]
  var limit: Int?
  var findPlaceholder: String?
  var noMatch: String?
  @State private var query = ""
  @Environment(\.palette) private var palette

  var body: some View {
    let finding = limit.map { choices.count > $0 } ?? false
    let needle = query.trimmingCharacters(in: .whitespaces)
    let matching = choices.filter { needle.isEmpty || $0.label.localizedCaseInsensitiveContains(needle) }
    let shown: [FilterChoice<String>] = {
      guard finding, let limit else { return choices }
      let first = Array(matching.prefix(limit))
      let firstIds = Set(first.map(\.value))
      return choices.filter { value.contains($0.value) && !firstIds.contains($0.value) } + first
    }()
    VStack(alignment: .leading, spacing: Space.s2_5) {
      if finding, let findPlaceholder {
        MatineeTextField(findPlaceholder, text: $query, kind: .search)
      }
      FlowRow(spacing: Space.s1_5, lineSpacing: Space.s1_5) {
        ForEach(shown) { choice in
          ToggleChip(
            choice.label,
            isOn: Binding(
              get: { value.contains(choice.value) },
              set: { on in value = on ? value + [choice.value] : value.filter { $0 != choice.value } }),
            count: choice.count.map(formatCount))
        }
      }
      if shown.isEmpty, let noMatch {
        Text(noMatch).textStyle(.sm).foregroundStyle(palette.mutedForeground)
      }
    }
  }
}

/// The span a range's handles move in, by `step`.
struct FilterSpan: Equatable {
  let min: Double
  let max: Double
  let step: Double
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

/// Two handles on a range, each open at its end. What it says follows the
/// handles; `onCommit` gets the range once they're let go, nil for an end
/// at the span's own end.
struct RangeField: View {
  let title: String
  var hint: String?
  let span: FilterSpan
  let low: Double?
  let high: Double?
  let words: (Double?, Double?) -> String
  let onCommit: (Double?, Double?) -> Void
  @State private var moving: ClosedRange<Double>?

  var body: some View {
    let current = moving ?? ((low ?? span.min)...(high ?? span.max))
    let (shownLow, shownHigh) = open(current)
    FilterSection(title, hint: hint, value: words(shownLow, shownHigh)) {
      RangeSlider(
        value: Binding(get: { current }, set: { moving = $0 }), in: span.min...span.max, step: span.step,
        labels: (Str.webFiltersFrom(words(shownLow, nil)), Str.webFiltersUpTo(words(nil, shownHigh))),
        onEditingChanged: { editing in
          guard !editing, let moving else { return }
          let (a, b) = open(moving)
          self.moving = nil
          onCommit(a, b)
        })
    }
  }

  /// The handles' range, snapped to the step, with an end at the span's end as open.
  private func open(_ values: ClosedRange<Double>) -> (Double?, Double?) {
    func snap(_ value: Double) -> Double { span.min + ((value - span.min) / span.step).rounded() * span.step }
    let a = snap(values.lowerBound)
    let b = snap(values.upperBound)
    return (a <= span.min ? nil : a, b >= span.max ? nil : b)
  }
}

/// A row naming what's picked from a long list, which opens `OptionSheet`.
struct OptionRow: View {
  let label: String
  let action: () -> Void

  var body: some View {
    ListRow(label, accessory: .chevron, action: action)
  }
}

extension View {
  /// A long list to pick one from, or none with `any`, with a field to find
  /// one. Full height from the start, where Android's fits the list: the
  /// keyboard comes up as the field is used, and a sheet that shrank and
  /// grew with what the field finds would jump under the finger.
  func optionSheet(
    isPresented: Binding<Bool>, title: String, any: String, findPlaceholder: String,
    choices: [FilterChoice<String>], current: String?, onPick: @escaping (String?) -> Void
  ) -> some View {
    matineeSheet(isPresented: isPresented, size: .large) {
      OptionSheetBody(
        title: title, any: any, findPlaceholder: findPlaceholder, choices: choices, current: current, onPick: onPick)
    }
  }
}

private struct OptionSheetBody: View {
  let title: String
  let any: String
  let findPlaceholder: String
  let choices: [FilterChoice<String>]
  let current: String?
  let onPick: (String?) -> Void
  @State private var query = ""

  var body: some View {
    let needle = query.trimmingCharacters(in: .whitespaces)
    let shown = choices.filter { needle.isEmpty || $0.label.localizedCaseInsensitiveContains(needle) }
    SheetHeader(title, line: false)
    MatineeTextField(findPlaceholder, text: $query, kind: .search)
      .padding(.horizontal, Space.sheet)
      .padding(.vertical, Space.s2)
    Separator()
    SheetBody {
      LazyVStack(spacing: 0) {
        if needle.isEmpty {
          SheetItem(any, selected: current == nil) { onPick(nil) }
        }
        ForEach(shown) { choice in
          SheetItem(
            choice.count.map { "\(choice.label)  ·  \(formatCount($0))" } ?? choice.label,
            selected: current == choice.value
          ) { onPick(choice.value) }
        }
      }
    }
  }
}
