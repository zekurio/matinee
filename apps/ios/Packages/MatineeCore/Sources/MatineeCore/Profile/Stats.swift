import Foundation

/*
 * StatsData.kt's arithmetic: how watch time reads, the chart's scale and
 * its bars, which way a bucket is named, where the person stands on the
 * leaderboard, and the activity grid. The app puts it in words
 * (UI/profile/StatsData.swift); this part is tested on the Mac.
 */

/// The ranges the chips offer, in the contract's order.
public let STATS_RANGES = StatsRange.knownValues

/// Watch time rounded to the minute, in the shape the words take: "45 min",
/// "3 h 20 min", or whole hours from 100 on and on the hour, as the web's
/// `formatWatchTime`.
public enum WatchTime: Equatable, Sendable {
  case minutes(Int)
  case hours(Int)
  case hoursMinutes(Int, Int)

  public init(seconds: Double) {
    let minutes = seconds.isFinite ? Int((seconds / 60).rounded()) : 0
    if minutes < 60 {
      self = .minutes(max(minutes, 0))
      return
    }
    let hours = minutes / 60
    let rest = minutes % 60
    self = hours >= 100 || rest == 0 ? .hours(hours) : .hoursMinutes(hours, rest)
  }
}

/// The top of the chart's scale: whole minutes up to an hour, then hours,
/// rounded up to a tidy number, so the tallest bar nearly fills it.
public func scaleTop(_ seconds: Double) -> Double {
  func nice(_ value: Double) -> Double {
    let steps: [Double] = [1, 2, 5, 10, 15, 20, 30, 45, 60]
    if let step = steps.first(where: { $0 >= value }) { return step }
    var magnitude = 10.0
    while magnitude * 10 < value { magnitude *= 10 }
    return [1, 2, 5, 10].map { $0 * magnitude }.first { $0 >= value } ?? value
  }
  let minutes = (max(seconds, 0) / 60).rounded(.up)
  return minutes <= 60 ? nice(max(minutes, 1)) * 60 : nice(minutes / 60) * 3600
}

/// Where each bar of the watch time chart sits in a chart `width` by
/// `height`: all time can hold hundreds of months, so the bars thin out to
/// lines rather than leave the chart.
public struct BarLayout: Equatable, Sendable {
  public let slot: Double
  public let gap: Double
  public let radius: Double
  public let count: Int

  /// `maxGap` and `maxRadius` in points: Android's 4 and 2 dp.
  public init(width: Double, count: Int, maxGap: Double = 4, maxRadius: Double = 2) {
    self.count = count
    slot = count > 0 ? width / Double(count) : width
    gap = min(slot * 0.25, maxGap)
    radius = min(maxRadius, (slot - gap) / 2)
  }

  public var barWidth: Double { slot - gap }

  /// The leading edge of bar `index`.
  public func x(_ index: Int) -> Double { Double(index) * slot + gap / 2 }

  /// How tall a bar of `seconds` is against `top`, at least `minimum` so a
  /// short sitting still shows; nothing when there was none.
  public static func height(_ seconds: Double, top: Double, in height: Double, minimum: Double = 2) -> Double {
    guard seconds > 0, top > 0 else { return 0 }
    return max(seconds / top * height, minimum)
  }

  /// The bar under `x`, kept on the chart while a finger strays past its ends.
  public func index(at x: Double) -> Int? {
    guard count > 0, slot > 0 else { return nil }
    return min(max(Int((x / slot).rounded(.down)), 0), count - 1)
  }
}

/// How a bucket is named: a day, the week from a day, or a month; with the
/// year when it isn't this one.
public enum BucketName: Equatable, Sendable {
  case day(Date, withYear: Bool)
  case week(Date, withYear: Bool)
  case month(Date)

  /// For the bucket starting `start` (YYYY-MM-DD) of `unit`, seen on `now`;
  /// nil when the date doesn't parse.
  public init?(start: String, unit: String, now: Date = .now, calendar: Calendar = .current) {
    guard let date = parseDay(start, calendar: calendar) else { return nil }
    let thisYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
    switch unit {
    case StatsUnit.month: self = .month(date)
    case StatsUnit.week: self = .week(date, withYear: !thisYear)
    default: self = .day(date, withYear: !thisYear)
    }
  }

  public var date: Date {
    switch self {
    case .day(let date, _), .week(let date, _), .month(let date): date
    }
  }

  /// The date as `locale` writes it, from Android's skeletons: "9 Nov",
  /// "9. Nov. 2025", "November 2026". A week's words around it are the app's.
  public func formatDate(locale: Locale, calendar: Calendar = .current) -> String {
    let template =
      switch self {
      case .month: "MMMMyyyy"
      case .day(_, let year), .week(_, let year): year ? "dMMMyyyy" : "dMMM"
      }
    return formatTemplate(template, date, locale: locale, calendar: calendar)
  }
}

/// `date` in `locale`'s best pattern for a skeleton like `dMMM`, as Android's `getBestDateTimePattern`.
public func formatTemplate(_ template: String, _ date: Date, locale: Locale, calendar: Calendar = .current) -> String {
  let formatter = DateFormatter()
  formatter.locale = locale
  formatter.calendar = calendar
  formatter.timeZone = calendar.timeZone
  formatter.setLocalizedDateFormatFromTemplate(template)
  return formatter.string(from: date)
}

/// "November 2026": the month an ISO time from the server falls in.
public func formatJoinedMonth(_ createdAt: String, locale: Locale, calendar: Calendar = .current) -> String? {
  parseInstant(createdAt).map { formatTemplate("MMMMyyyy", $0, locale: locale, calendar: calendar) }
}

/// "18:00" or "6 PM"-style short times: an hour as `locale` writes the time.
public func formatHour(_ hour: Int, locale: Locale, calendar: Calendar = .current) -> String {
  let date = calendar.date(from: DateComponents(year: 2026, month: 1, day: 1, hour: hour)) ?? .now
  var style = Date.FormatStyle(date: .omitted, time: .shortened).locale(locale)
  style.timeZone = calendar.timeZone
  return date.formatted(style)
}

/// A weekday's name, 1 being Monday as the activity cells count them.
public func weekdayName(_ weekday: Int, short: Bool, locale: Locale) -> String {
  var calendar = Calendar(identifier: .gregorian)
  calendar.locale = locale
  // The calendar's symbols start on Sunday.
  let symbols = short ? calendar.shortStandaloneWeekdaySymbols : calendar.standaloneWeekdaySymbols
  return symbols[((weekday % 7) + 7) % 7]
}

/// Where the user stands on a board: their place between the people just above and below them.
public struct BoardStanding: Equatable, Sendable {
  public let board: LeaderboardBoard
  public let places: [LeaderboardEntry]
}

/// The user's standing on each board they're on, in the server's order.
public func standings(_ leaderboard: Leaderboard?) -> [BoardStanding] {
  (leaderboard?.boards ?? []).compactMap { board in
    guard let at = board.entries.firstIndex(where: \.isSelf) else { return nil }
    let places = board.entries[max(0, at - 1)..<min(board.entries.count, at + 2)]
    return BoardStanding(board: board, places: Array(places))
  }
}

/// Places shown at the top of a board; the viewer's neighborhood comes after.
let TOP_PLACES = 10

/// Whether the place at `index` starts the viewer's neighborhood, apart from the top places, so it's set off.
public func startsNeighborhood(_ board: LeaderboardBoard, _ index: Int) -> Bool {
  guard index == TOP_PLACES, index < board.entries.count else { return false }
  let before = TOP_PLACES - 1 < board.entries.count ? board.entries[TOP_PLACES - 1].rank : 0
  return board.entries[index].rank > before + 1
}

/// A board's value in the shape its words take.
public enum MetricValue: Equatable, Sendable {
  case watchTime(WatchTime)
  case plays(Int)
  case days(Int)
  case movies(Int)
  case episodes(Int)
  case count(Int)

  public init(metric: String, value: Double) {
    let count = value.isFinite ? Int(value) : 0
    switch metric {
    case "watchTime": self = .watchTime(WatchTime(seconds: value))
    case "plays": self = .plays(count)
    case "currentStreak", "longestStreak": self = .days(count)
    case "movies": self = .movies(count)
    case "episodes": self = .episodes(count)
    default: self = .count(count)
    }
  }
}

/// When in the week watching starts, as the heatmap draws it: a cell per
/// hour of each weekday, the busiest time, and each day's sum for a reader
/// that can't see the squares.
public struct ActivityGrid: Equatable, Sendable {
  private let seconds: [Int: Double]
  /// The most in one cell, at least a second, so the shades never divide by nothing.
  public let max: Double
  /// The busiest cell; nil with nothing watched.
  public let peak: ActivityCell?

  public init(_ cells: [ActivityCell]) {
    var seconds: [Int: Double] = [:]
    for cell in cells { seconds[Self.key(cell.weekday, cell.hour), default: 0] += cell.watchSeconds }
    self.seconds = seconds
    max = Swift.max(1, cells.map(\.watchSeconds).max() ?? 0)
    // The first of equals, as Kotlin's maxBy picks it.
    peak = cells.reduce(nil) { best, cell in
      guard let best else { return cell }
      return cell.watchSeconds > best.watchSeconds ? cell : best
    }
  }

  public var isEmpty: Bool { peak == nil }

  private static func key(_ weekday: Int, _ hour: Int) -> Int { weekday * 24 + hour }

  public func value(weekday: Int, hour: Int) -> Double { seconds[Self.key(weekday, hour)] ?? 0 }

  /// How strong a cell's accent is: from 0.3 for a little to full at the
  /// busiest; nil for an empty one, which gets the faint square.
  public func intensity(weekday: Int, hour: Int) -> Double? {
    let value = value(weekday: weekday, hour: hour)
    return value > 0 ? 0.3 + 0.7 * value / max : nil
  }

  /// A weekday's watch time over all its hours.
  public func total(weekday: Int) -> Double { (0..<24).reduce(0) { $0 + value(weekday: weekday, hour: $1) } }

  /// The weekdays with any watch time, most first, for VoiceOver to read out.
  public var busiestWeekdays: [Int] {
    (1...7).filter { total(weekday: $0) > 0 }.sorted { total(weekday: $0) > total(weekday: $1) }
  }
}

/// The hours under the heatmap's squares, every six; at large text sizes every twelve.
public func activityHourMarks(roomy: Bool) -> [Int] { roomy ? [0, 6, 12, 18] : [0, 12] }

/// With nothing ever watched, picking a period changes nothing, so the chips step aside.
public func neverWatched(_ stats: WatchStats?, range: String) -> Bool {
  guard let stats else { return false }
  return range == StatsRange.all && stats.totals.plays == 0
}
