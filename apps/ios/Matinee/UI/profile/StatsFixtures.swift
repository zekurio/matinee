#if DEBUG
  import Foundation
  import MatineeCore

  /*
   * Debug builds' `-dev.statsFixtures`: made-up watching over the
   * account's real answers, since the dev server's history is a few plays
   * on one day and has one person on each board. Release builds don't
   * compile this.
   *
   * - `YES`: a year and more of watching for every range, and boards of a
   *   dozen and more people around the viewer.
   * - `quiet`: the same, but nothing in the last 7 and 30 days, for the
   *   range with nothing in it.
   * - `empty`: an account that never watched or kept anything: no
   *   favorites, nothing recent, no figures in any range.
   *
   * The titles are the server's, so their pages open; the genres are made
   * up, as the server has no metadata provider.
   */

  nonisolated enum StatsFixtures {
    enum Mode { case off, full, quiet, empty }

    static var mode: Mode {
      switch UserDefaults.standard.string(forKey: "dev.statsFixtures")?.lowercased() {
      case "yes", "true", "1", "full": .full
      case "quiet": .quiet
      case "empty": .empty
      default: .off
      }
    }

    private static let genres = [
      "Science Fiction", "Drama", "Adventure", "Animation", "Thriller", "Comedy", "Crime", "Family",
    ]

    /// `real` emptied for the `empty` mode; as it came otherwise.
    static func profile(_ real: Profile) -> Profile {
      guard mode == .empty else { return real }
      var profile = real
      profile.favorites = []
      profile.recent = []
      return profile
    }

    /// `real` with its buckets, activity, titles, and genres made up for the range, and totals to match.
    static func stats(_ real: WatchStats?, range: String, api: MatineeApi) async throws -> WatchStats? {
      guard var stats = real else { return nil }
      var calendar = Calendar(identifier: .gregorian)
      calendar.firstWeekday = 2
      let today = calendar.startOfDay(for: .now)
      let (unit, count, step): (String, Int, Calendar.Component) =
        switch range {
        case StatsRange._7d: (StatsUnit.day, 7, .day)
        case StatsRange._30d: (StatsUnit.day, 30, .day)
        case StatsRange._90d: (StatsUnit.week, 13, .weekOfYear)
        case StatsRange._365d: (StatsUnit.week, 53, .weekOfYear)
        default: (StatsUnit.month, 26, .month)
        }
      let first: Date =
        switch step {
        case .month: calendar.date(from: calendar.dateComponents([.year, .month], from: today)) ?? today
        case .weekOfYear: calendar.dateInterval(of: .weekOfYear, for: today)?.start ?? today
        default: today
        }
      let scale: Double =
        switch unit {
        case StatsUnit.day: 3600
        case StatsUnit.week: 5 * 3600
        default: 20 * 3600
        }
      let silent = mode == .empty || (mode == .quiet && (range == StatsRange._7d || range == StatsRange._30d))
      stats.unit = unit
      stats.buckets = (0..<count).reversed().map { back in
        let start = calendar.date(byAdding: step, value: -back, to: first) ?? first
        let parts = calendar.dateComponents([.year, .month, .day], from: start)
        let day = String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
        // A wave with gaps, so empty buckets and the tallest bar both show.
        let wave = (sin(Double(back) * 0.9) + 1) / 2
        let seconds = silent || back % 5 == 3 ? 0 : (0.15 + wave) * scale
        return StatsBucket(start: day, watchSeconds: seconds, plays: seconds > 0 ? 1 + Int(wave * 4) : 0)
      }
      let total = stats.buckets.reduce(0) { $0 + $1.watchSeconds }
      let plays = stats.buckets.reduce(0) { $0 + $1.plays }
      stats.totals = WatchTotals(
        watchSeconds: total, plays: plays, movies: plays / 3, episodes: plays / 2, shows: min(3, plays))
      guard !silent else {
        stats.activity = []
        stats.titles = []
        stats.genres = []
        return stats
      }
      let titles = try await api.titles.browse(limit: 10).items
      stats.activity = (1...7).flatMap { weekday in
        (0..<24).compactMap { hour -> ActivityCell? in
          // Evenings, and weekend afternoons.
          let evening = hour >= 18 && hour <= 23
          let weekend = weekday >= 6 && hour >= 13 && hour <= 17
          guard evening || weekend || (hour == 8 && weekday == 3) else { return nil }
          let weight = Double((weekday * 7 + hour * 3) % 10 + 1) / 10
          return ActivityCell(weekday: weekday, hour: hour, watchSeconds: weight * total / 40)
        }
      }
      stats.titles = titles.enumerated().map { index, title in
        let share = total * 0.4 / Double(index + 2)
        return TitleStat(title: title, watchSeconds: share, plays: max(1, 12 - index))
      }
      stats.genres = genres.enumerated().map { index, name in
        GenreStat(name: name, watchSeconds: total * 0.7 / Double(index + 1))
      }
      return stats
    }

    /// `real` with its boards filled by people around the viewer: on the
    /// first boards past the top ten, apart from it, on the others among
    /// it. The `empty` mode leaves every board without the viewer.
    static func leaderboard(_ real: Leaderboard) -> Leaderboard {
      var board = real
      guard mode != .empty else {
        board.boards = real.boards.map { LeaderboardBoard(metric: $0.metric, entries: []) }
        return board
      }
      let me = real.boards.lazy.flatMap(\.entries).first(where: \.isSelf)?.user
      guard let me else { return real }
      let names = [
        "Ada", "Grace", "Linus", "Margaret", "Alan", "Barbara", "Dennis", "Frances", "Ken", "Radia", "Edsger",
        "Sophie", "Tim", "Hedy", "Claude",
      ]
      board.boards = real.boards.enumerated().map { index, original in
        let far = index < 2
        let myRank = far ? 14 : 3 + index
        let ranks = far ? Array(1...10) + [13, 14, 15] : Array(1...min(9, myRank + 3))
        let entries = ranks.map { rank in
          let user =
            rank == myRank
            ? me
            : ProfileUser(
              id: "fixture-\(rank)", username: names[rank % names.count].lowercased(),
              displayName: names[rank % names.count], role: "user", avatarId: nil,
              createdAt: "2025-01-01T00:00:00Z")
          let value: Double =
            original.metric == "watchTime" ? Double(200 - rank * 9) * 3600 : Double(60 - rank * 3)
          return LeaderboardEntry(rank: rank, user: user, value: value, isSelf: rank == myRank)
        }
        return LeaderboardBoard(metric: original.metric, entries: entries)
      }
      return board
    }
  }
#endif
