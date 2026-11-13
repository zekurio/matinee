import MatineeCore
import SwiftUI

/// Someone marking `name` watched, to be asked when, as the web's tick and
/// menus ask, after Trakt: just now, on the release date, on a day they
/// pick, or some time they don't remember. `mark` gets the contract's
/// `watchedAt`, nil for now.
struct WatchedAsk: Identifiable {
  let id = UUID()
  let name: String
  let mark: (_ watchedAt: String?) async throws -> Void
}

/// The question, as a sheet of the answers; picking a day turns it into a
/// calendar up to today. Show it with `.sheet(item: $ask) { WatchedAtSheet($0) }`.
struct WatchedAtSheet: View {
  let ask: WatchedAsk
  @Environment(\.dismiss) private var dismiss
  @Environment(\.snackbar) private var snackbar
  @Environment(\.palette) private var palette
  @State private var picking = false
  @State private var day = Date.now

  init(_ ask: WatchedAsk) { self.ask = ask }

  var body: some View {
    Group {
      if picking { calendar } else { answers }
    }
    .matineeSheet(picking ? [.large] : [.medium])
  }

  private var answers: some View {
    VStack(spacing: 0) {
      SheetHeader(Str.mediaMarkWatched, ask.name)
      SheetItem(.clock, Str.mediaWatchedAtNow) { mark(nil) }
      SheetItem(.calendar, Str.mediaWatchedAtReleased) { mark(WatchedAt.released) }
      SheetItem(.calendarClock, Str.mediaWatchedAtOther) { withMotion(Motion.move) { picking = true } }
      SheetItem(.calendarOff, Str.mediaWatchedAtUnknown) { mark(WatchedAt.unknown) }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 12)
  }

  private var calendar: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(Str.mediaWatchedDateTitle).textStyle(.titleMedium).padding(.horizontal, 20).padding(.top, 20)
      DatePicker(Str.mediaWatchedDateTitle, selection: $day, in: ...Date.now, displayedComponents: .date)
        .datePickerStyle(.graphical)
        .labelsHidden()
        .tint(palette.accent)
        .environment(\.locale, .app)
        .padding(.horizontal, 12)
      HStack(spacing: 12) {
        MatineeButton(.ghost, action: { dismiss() }) { Text(Str.commonCancel) }
        MatineeButton(.primary, action: { mark(watchedAtOn(day)) }) { Text(Str.mediaMarkWatched) }
      }
      .frame(maxWidth: .infinity, alignment: .trailing)
      .padding(20)
      Spacer(minLength: 0)
    }
  }

  /// The mark outlives the sheet, so it runs in a task of its own.
  private func mark(_ watchedAt: String?) {
    let mark = ask.mark
    launchShowing(snackbar, Str.mediaMarkWatchedFailed) { try await mark(watchedAt) }
    dismiss()
  }
}
