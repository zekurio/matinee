import SwiftUI

/// A month of days to pick one from, as the web's Calendar and Android's:
/// the month and arrows over it, the weekdays in the locale's order, today
/// on a muted square and the picked day in the accent, `rounded-md` cells,
/// and the days of the months around it faint. Days after `latest` can't
/// be picked. Named so as not to shadow Foundation's `Calendar`.
public struct MatineeCalendar: View {
  let selected: Date?
  let latest: Date?
  let onSelect: (Date) -> Void
  @State private var shownMonth: Date
  @Environment(\.palette) private var palette
  @Environment(\.locale) private var locale
  @Environment(\.calendar) private var calendar
  @Environment(\.layoutDirection) private var direction

  public init(selected: Date?, latest: Date? = nil, onSelect: @escaping (Date) -> Void) {
    self.selected = selected
    self.latest = latest
    self.onSelect = onSelect
    let start = Calendar.current.dateInterval(of: .month, for: selected ?? .now)?.start ?? .now
    self._shownMonth = State(initialValue: start)
  }

  public var body: some View {
    let today = calendar.startOfDay(for: .now)
    VStack(spacing: 8) {
      HStack(spacing: 0) {
        RoundIconButton(.chevronLeft, label: KitText.previousMonth(locale), look: .ghost, size: 36, iconSize: 16) {
          move(by: -1)
        }
        Text(shownMonth.formatted(.dateTime.month(.wide).year().locale(locale)))
          .textStyle(.sm, weight: .medium)
          .frame(maxWidth: .infinity)
          .accessibilityAddTraits(.isHeader)
        RoundIconButton(.chevronRight, label: KitText.nextMonth(locale), look: .ghost, size: 36, iconSize: 16) {
          move(by: 1)
        }
        .disabled(!canGoForward)
      }
      HStack(spacing: 0) {
        ForEach(weekdays, id: \.self) { name in
          Text(name)
            .font(Font(RedHatText.uiFont(size: 12.8, weight: .regular)))
            .foregroundStyle(palette.mutedForeground)
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)
        }
      }
      let days = self.days
      VStack(spacing: 0) {
        ForEach(0..<(days.count / 7), id: \.self) { row in
          HStack(spacing: 0) {
            ForEach(0..<7, id: \.self) { column in
              let day = days[row * 7 + column]
              DayCell(
                day: day, picked: selected.map { calendar.isDate($0, inSameDayAs: day) } ?? false,
                today: calendar.isDate(day, inSameDayAs: today),
                outside: !calendar.isDate(day, equalTo: shownMonth, toGranularity: .month),
                enabled: latest.map { day <= calendar.startOfDay(for: $0) } ?? true
              ) {
                onSelect(day)
                if let month = calendar.dateInterval(of: .month, for: day)?.start { shownMonth = month }
              }
            }
          }
        }
      }
    }
    .frame(maxWidth: 320)
  }

  private var canGoForward: Bool {
    guard let latest, let last = calendar.dateInterval(of: .month, for: latest)?.start else { return true }
    return shownMonth < last
  }

  private func move(by months: Int) {
    if let month = calendar.date(byAdding: .month, value: months, to: shownMonth) { shownMonth = month }
  }

  /// Short weekday names, starting where the locale's week does.
  private var weekdays: [String] {
    var calendar = self.calendar
    calendar.locale = locale
    let names = calendar.shortStandaloneWeekdaySymbols.map { $0.trimmingCharacters(in: CharacterSet(charactersIn: ".")) }
    let first = calendar.firstWeekday - 1
    return Array(names[first...] + names[..<first])
  }

  /// Whole weeks, from the start of the week the month starts in to its end.
  private var days: [Date] {
    guard let range = calendar.range(of: .day, in: .month, for: shownMonth) else { return [] }
    let weekday = calendar.component(.weekday, from: shownMonth)
    let lead = (weekday - calendar.firstWeekday + 7) % 7
    let count = Int(ceil(Double(lead + range.count) / 7)) * 7
    return (0..<count).compactMap { calendar.date(byAdding: .day, value: $0 - lead, to: shownMonth) }
  }
}

private struct DayCell: View {
  let day: Date
  let picked: Bool
  let today: Bool
  let outside: Bool
  let enabled: Bool
  let action: () -> Void
  @Environment(\.palette) private var palette
  @Environment(\.locale) private var locale
  @Environment(\.calendar) private var calendar

  var body: some View {
    let shape = RoundedRectangle.kit(Radius.md)
    Button(action: action) {
      shape.fill(picked ? palette.accent : today ? palette.secondary : .clear)
        .aspectRatio(1, contentMode: .fit)
        .overlay {
          Text(day.formatted(.dateTime.day().locale(locale)))
            .textStyle(.sm, weight: picked ? .medium : .regular)
            .foregroundStyle(picked ? palette.accentForeground : outside ? palette.mutedForeground : palette.foreground)
        }
    }
    .buttonStyle(KitPressStyle(shape: shape))
    .padding(2)
    .frame(maxWidth: .infinity)
    .disabled(!enabled)
    .accessibilityLabel(label)
    .accessibilityAddTraits(picked ? .isSelected : [])
  }

  private var label: String {
    let date = day.formatted(.dateTime.weekday(.wide).day().month(.wide).year().locale(locale))
    return today ? KitText.today(date, locale) : date
  }
}
