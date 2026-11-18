import Foundation

/*
 * The structured filters as a remote changes them: Left and Right on a
 * row step one end of a range, an age rating, or the progress filter,
 * where a phone has a slider or a row of chips. The values are the ones
 * the server offers (`TitleFilterOptions`); this only moves between them,
 * the way the phone's slider and chips would, so a TV sends the server
 * the same filters a phone does.
 */

/// One end of a range filter: the least it lets through, or the most.
public enum RangeEnd: Sendable {
  case low, high
}

/// `low` and `high` with `end` moved `steps` of the span's step, as Left
/// and Right move it. An end at the span's own end is open, nil, as the
/// phone's slider leaves it, so stepping past the oldest year or the
/// shortest runtime takes that end off. Neither end passes the other, and
/// each lands on one of the span's steps, or on its end.
public func stepRange(
  _ span: FilterRange, low: Double?, high: Double?, end: RangeEnd, by steps: Int
) -> (low: Double?, high: Double?) {
  guard span.step > 0, span.max > span.min else { return (low, high) }
  func snap(_ value: Double) -> Double {
    let onStep = span.min + ((value - span.min) / span.step).rounded() * span.step
    // Rounded off past the sixth place, so 0.1 steps read 7.3, not 7.300000000000001.
    let clean = (onStep * 1_000_000).rounded() / 1_000_000
    return Swift.min(Swift.max(clean, span.min), span.max)
  }
  let move = Double(steps) * span.step
  switch end {
  case .low:
    let ceiling = high ?? span.max
    let next = Swift.min(snap((low ?? span.min) + move), ceiling)
    return (next <= span.min ? nil : next, high)
  case .high:
    let floor = low ?? span.min
    let next = Swift.max(snap((high ?? span.max) + move), floor)
    return (low, next >= span.max ? nil : next)
  }
}

/// The choice `steps` along `choices` from `current`, with nil, "Any",
/// before the first, as Left and Right step a row of a few choices in
/// order. It stops at either end rather than wrapping, so holding Left
/// always arrives at Any. A `current` that isn't among them counts as Any.
public func stepChoice<T: Equatable>(_ choices: [T], current: T?, by steps: Int) -> T? {
  let at = current.flatMap { choices.firstIndex(of: $0) }.map { $0 + 1 } ?? 0
  let next = Swift.min(Swift.max(at + steps, 0), choices.count)
  return next == 0 ? nil : choices[next - 1]
}

/// The progress filter's choices in the order the phone's chips show them.
public let WATCH_FILTER_STEPS = [WatchFilter.unwatched, WatchFilter.inProgress, WatchFilter.watched]

/// The age limit `steps` along `system`'s ratings from `current`, nil
/// being no limit: the ratings in the order the server lists them, least
/// first. A limit from another country counts as none.
public func stepAgeLimit(_ system: RatingSystem, current: AgeLimit?, by steps: Int) -> AgeLimit? {
  let rating = current?.country == system.country ? current?.rating : nil
  return stepChoice(system.ratings.map(\.rating), current: rating, by: steps).map {
    AgeLimit(country: system.country, rating: $0)
  }
}
