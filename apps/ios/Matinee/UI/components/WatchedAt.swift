import MatineeCore
import MatineeKit
import SwiftUI

/// Someone marking `name` watched, to be asked when, as the web's tick and
/// menus ask, after Trakt: just now, on the release date, on a day they
/// pick, or some time they don't remember. `mark` gets the contract's
/// `watchedAt`, nil for now. Ask with `actions.askWatched(name) { at in … }`;
/// the actions host shows the question.
struct WatchedAsk: Identifiable {
  let id = UUID()
  let name: String
  let mark: (_ watchedAt: String?) async throws -> Void
}

/// The question, as Android's and the web's: a sheet of the four answers.
/// "On another day" opens `WatchedDayDialog` once the sheet has gone.
struct WatchedAtSheet: View {
  let ask: WatchedAsk
  @Environment(\.snackbar) private var snackbar
  @Environment(\.actions) private var actions

  init(_ ask: WatchedAsk) { self.ask = ask }

  var body: some View {
    VStack(spacing: 0) {
      SheetHeader(Str.mediaMarkWatched, subtitle: ask.name)
      SheetItem(Str.mediaWatchedAtNow, icon: .clock) { markWatched(ask, nil, snackbar) }
      SheetItem(Str.mediaWatchedAtReleased, icon: .calendar) { markWatched(ask, WatchedAt.released, snackbar) }
      SheetItem(Str.mediaWatchedAtOther, icon: .calendarClock) { actions?.watchedDay = ask }
      SheetItem(Str.mediaWatchedAtUnknown, icon: .calendarOff) { markWatched(ask, WatchedAt.unknown, snackbar) }
    }
    .padding(.vertical, Space.s2)
  }
}

/// A calendar up to today, starting on today, as the web's watched-date
/// form, in a dialog: Mark watched, or Cancel.
struct WatchedDayDialog: View {
  @Binding var ask: WatchedAsk?
  @State private var day = Date.now
  @Environment(\.snackbar) private var snackbar

  var body: some View {
    let shown = Binding(get: { ask != nil }, set: { if !$0 { ask = nil } })
    Color.clear
      .dialog(isPresented: shown, title: Str.mediaWatchedDateTitle) {
        MatineeCalendar(selected: day, latest: .now) { day = $0 }
          .environment(\.locale, .app)
      } footer: {
        DialogButton(Str.mediaMarkWatched, look: .primary) {
          if let ask { markWatched(ask, watchedAtOn(day), snackbar) }
        }
        DialogButton.cancel()
      }
      .onChange(of: ask?.id) { day = .now }
  }
}

/// Marks what `ask` is about watched at `watchedAt`, in a task of its own,
/// as the sheet that asked has gone.
@MainActor private func markWatched(_ ask: WatchedAsk, _ watchedAt: String?, _ snackbar: Snackbar) {
  let mark = ask.mark
  launchShowing(snackbar, Str.mediaMarkWatchedFailed) { try await mark(watchedAt) }
}
