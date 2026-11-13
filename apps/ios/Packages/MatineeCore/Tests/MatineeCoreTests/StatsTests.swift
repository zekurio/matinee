import Foundation
import Testing

@testable import MatineeCore

struct StatsTests {
  private let english = Locale(identifier: "en_US")
  private let german = Locale(identifier: "de_DE")
  private var utc: Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    return calendar
  }

  @Test func watchTimeRoundsToTheMinuteAndDropsMinutesFromAHundredHours() {
    #expect(WatchTime(seconds: 0) == .minutes(0))
    #expect(WatchTime(seconds: 29) == .minutes(0))
    #expect(WatchTime(seconds: 45 * 60 + 20) == .minutes(45))
    #expect(WatchTime(seconds: 59 * 60 + 40) == .hours(1))
    #expect(WatchTime(seconds: 3 * 3600 + 20 * 60) == .hoursMinutes(3, 20))
    #expect(WatchTime(seconds: 4 * 3600) == .hours(4))
    #expect(WatchTime(seconds: 120 * 3600 + 25 * 60) == .hours(120))
    #expect(WatchTime(seconds: .nan) == .minutes(0))
  }

  @Test func theScaleTopsOutAtATidyMinuteOrHour() {
    #expect(scaleTop(0) == 60)
    #expect(scaleTop(61) == 120)
    #expect(scaleTop(7 * 60) == 10 * 60)
    #expect(scaleTop(50 * 60) == 60 * 60)
    #expect(scaleTop(61 * 60) == 2 * 3600)
    #expect(scaleTop(46 * 3600) == 60 * 3600)
    #expect(scaleTop(61 * 3600) == 100 * 3600)
    #expect(scaleTop(130 * 3600) == 200 * 3600)
    #expect(scaleTop(1500 * 3600) == 2000 * 3600)
  }

  @Test func barsThinOutRatherThanLeaveTheChart() {
    let week = BarLayout(width: 350, count: 7)
    #expect(week.slot == 50)
    #expect(week.gap == 4)
    #expect(week.radius == 2)
    #expect(week.x(1) == 52)
    let months = BarLayout(width: 300, count: 600)
    #expect(months.gap == 0.125)
    #expect(months.barWidth == 0.375)
    #expect(months.radius == 0.1875)
    #expect(BarLayout.height(0, top: 60, in: 120) == 0)
    #expect(BarLayout.height(30, top: 60, in: 120) == 60)
    #expect(BarLayout.height(0.1, top: 3600, in: 120) == 2)
  }

  @Test func aTouchPicksTheBarUnderItAndStaysOnTheChart() {
    let layout = BarLayout(width: 70, count: 7)
    #expect(layout.index(at: 0) == 0)
    #expect(layout.index(at: 15) == 1)
    #expect(layout.index(at: -20) == 0)
    #expect(layout.index(at: 500) == 6)
    #expect(BarLayout(width: 70, count: 0).index(at: 5) == nil)
  }

  @Test func bucketsAreNamedByTheirUnitWithTheYearWhenItIsAnother() {
    let now = utc.date(from: DateComponents(year: 2026, month: 11, day: 13))!
    let day = BucketName(start: "2026-11-09", unit: "day", now: now, calendar: utc)
    #expect(day == .day(utc.date(from: DateComponents(year: 2026, month: 11, day: 9))!, withYear: false))
    #expect(day?.formatDate(locale: english, calendar: utc) == "Nov 9")
    #expect(day?.formatDate(locale: german, calendar: utc) == "9. Nov.")
    let week = BucketName(start: "2025-11-10", unit: "week", now: now, calendar: utc)
    #expect(week?.formatDate(locale: english, calendar: utc) == "Nov 10, 2025")
    #expect(week?.formatDate(locale: german, calendar: utc) == "10. Nov. 2025")
    let month = BucketName(start: "2026-11-01", unit: "month", now: now, calendar: utc)
    #expect(month?.formatDate(locale: english, calendar: utc) == "November 2026")
    #expect(month?.formatDate(locale: german, calendar: utc) == "November 2026")
    #expect(BucketName(start: "soon", unit: "day", now: now, calendar: utc) == nil)
  }

  @Test func hoursAndWeekdaysReadInTheLanguage() {
    #expect(formatHour(18, locale: german, calendar: utc) == "18:00")
    #expect(formatHour(18, locale: english, calendar: utc) == "6:00\u{202F}PM")
    #expect(weekdayName(1, short: false, locale: english) == "Monday")
    #expect(weekdayName(7, short: false, locale: german) == "Sonntag")
    #expect(weekdayName(3, short: true, locale: english) == "Wed")
  }

  @Test func theJoinedMonthComesFromTheAccountsTime() {
    #expect(formatJoinedMonth("2026-11-13T09:26:47.087Z", locale: english, calendar: utc) == "November 2026")
    #expect(formatJoinedMonth("2026-03-02T00:00:00Z", locale: german, calendar: utc) == "März 2026")
    #expect(formatJoinedMonth("whenever", locale: english) == nil)
  }

  private func user(_ name: String) -> ProfileUser {
    ProfileUser(id: name, username: name, displayName: nil, role: "user", avatarId: nil, createdAt: "2026-01-01T00:00:00Z")
  }

  private func board(_ metric: String, _ ranks: [Int], me: Int?) -> LeaderboardBoard {
    LeaderboardBoard(
      metric: metric,
      entries: ranks.map { LeaderboardEntry(rank: $0, user: user("u\($0)"), value: Double(100 - $0), isSelf: $0 == me) })
  }

  @Test func aStandingIsThePlaceBetweenTheOnesAboveAndBelow() {
    let leaderboard = Leaderboard(
      range: "all",
      boards: [
        board("watchTime", [1, 2, 3, 4], me: 3), board("plays", [1, 2], me: 1), board("movies", [1, 2], me: nil),
        board("episodes", [], me: nil),
      ], sharing: true)
    let found = standings(leaderboard)
    #expect(found.map(\.board.metric) == ["watchTime", "plays"])
    #expect(found[0].places.map(\.rank) == [2, 3, 4])
    #expect(found[1].places.map(\.rank) == [1, 2])
    #expect(standings(nil).isEmpty)
  }

  @Test func theNeighborhoodIsSetOffOnlyWhenItSkipsPlaces() {
    let apart = board("plays", Array(1...10) + [24, 25, 26], me: 25)
    #expect(startsNeighborhood(apart, 10))
    #expect(!startsNeighborhood(apart, 11))
    #expect(!startsNeighborhood(apart, 3))
    let straight = board("plays", Array(1...12), me: 11)
    #expect(!startsNeighborhood(straight, 10))
    #expect(!startsNeighborhood(board("plays", [1, 2], me: 1), 10))
  }

  @Test func metricsTakeTheirOwnWords() {
    #expect(MetricValue(metric: "watchTime", value: 3 * 3600) == .watchTime(.hours(3)))
    #expect(MetricValue(metric: "plays", value: 12) == .plays(12))
    #expect(MetricValue(metric: "longestStreak", value: 3) == .days(3))
    #expect(MetricValue(metric: "movies", value: 2) == .movies(2))
    #expect(MetricValue(metric: "episodes", value: 5) == .episodes(5))
    #expect(MetricValue(metric: "later", value: 7.8) == .count(7))
  }

  @Test func theActivityGridShadesByTheBusiestCell() {
    let grid = ActivityGrid([
      ActivityCell(weekday: 5, hour: 12, watchSeconds: 600), ActivityCell(weekday: 5, hour: 10, watchSeconds: 300),
      ActivityCell(weekday: 1, hour: 20, watchSeconds: 600), ActivityCell(weekday: 2, hour: 0, watchSeconds: 100),
    ])
    #expect(grid.max == 600)
    #expect(grid.peak == ActivityCell(weekday: 5, hour: 12, watchSeconds: 600))
    #expect(grid.intensity(weekday: 5, hour: 12) == 1)
    #expect(abs((grid.intensity(weekday: 5, hour: 10) ?? 0) - 0.65) < 1e-9)
    #expect(grid.intensity(weekday: 3, hour: 3) == nil)
    #expect(grid.total(weekday: 5) == 900)
    #expect(grid.busiestWeekdays == [5, 1, 2])
    let none = ActivityGrid([])
    #expect(none.isEmpty)
    #expect(none.max == 1)
  }

  @Test func onlyAnEmptyAllTimeMeansNothingWasEverWatched() {
    let totals = WatchTotals(watchSeconds: 0, plays: 0, movies: 0, episodes: 0, shows: 0)
    let empty = WatchStats(range: "all", unit: "day", totals: totals, buckets: [], activity: [], genres: [], titles: [])
    #expect(neverWatched(empty, range: "all"))
    #expect(!neverWatched(empty, range: "30d"))
    #expect(!neverWatched(nil, range: "all"))
    var some = empty
    some.totals.plays = 1
    #expect(!neverWatched(some, range: "all"))
  }

  @Test func aSnapshotKeepsEachAccountsAnswersApart() throws {
    let suite = "profile-snapshot-test-\(UUID().uuidString)"
    defer { UserDefaults.standard.removePersistentDomain(forName: suite) }
    let totals = WatchTotals(watchSeconds: 60, plays: 1, movies: 0, episodes: 0, shows: 0)
    let stats = WatchStats(range: "7d", unit: "day", totals: totals, buckets: [], activity: [], genres: [], titles: [])
    let mine = ProfileSnapshot(username: "me", suite: suite)
    #expect(mine.stats("7d").read() == nil)
    mine.stats("7d").write(stats)
    #expect(mine.stats("7d").read() == .some(stats))
    #expect(mine.stats("30d").read() == nil)
    #expect(ProfileSnapshot(username: "you", suite: suite).stats("7d").read() == nil)
  }
}
