import Foundation

/// When on the picked day to say the person watched: noon, as the server
/// does for a release date, so the play lands on that day in nearly every
/// zone. Today is now, since noon may not have come yet. `day` is any time
/// on that day in `calendar`'s zone, as a date picker hands it back.
public func watchedAtOn(_ day: Date, calendar: Calendar = .current, now: Date = .now) -> String {
  let start = calendar.startOfDay(for: day)
  let noon = calendar.date(byAdding: .hour, value: 12, to: start) ?? start
  return min(noon, now).formatted(.iso8601)
}
