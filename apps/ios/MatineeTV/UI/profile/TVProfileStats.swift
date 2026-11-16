import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvProfile.kt's statistics and TvCharts.kt: the heading and the ranges,
 * then for the range picked the watch time over its bars, the totals, the
 * most watched titles, the genres, the leaderboard (TVStanding.swift), and
 * when in the week they watch. The figures are the server's as it sends
 * them; the arithmetic of the scale and the squares is MatineeCore's
 * (Profile/Stats.swift), the words the iPhone's (Matinee/UI/profile/
 * StatsData.swift).
 *
 * The charts are the kit's (TVCharts.swift): every bar and square takes
 * focus, so the focus engine moves across them as across a row, and the
 * line above a chart reads the focused one out, as holding a finger on the
 * phone's does. The last range's figures stay up while the next one loads.
 */

/// The statistics' rows, a view each, for the profile's column.
struct ProfileStatistics: View {
  let loads: TVProfileLoads
  let memory: TVFocusMemory

  var body: some View {
    let content = loads.stats.content
    Group {
      // With nothing ever watched, picking a period changes nothing.
      StatsHeading(range: loads.range, showsRanges: content != .neverWatched, memory: memory) {
        loads.pick($0)
      }
      switch content {
      case .failed(let message, _):
        TVRowNotice(
          nil, headline: Str.profileStatsFailed, message: message,
          action: TVNoticeAction(Str.commonRetry, icon: .refreshCw) { loads.stats.loader.reload() })
      case .loading:
        TVLoadingRow()
      case .unavailable:
        EmptyView()
      case .neverWatched:
        TVMessage(Str.profileSelfEmpty, message: Str.profileSelfEmptyHint, icon: .popcorn, centered: false)
      case .nothingInRange:
        NothingInRange(range: loads.range, memory: memory) { loads.pick(StatsRange.all) }
      case .shown(let stats):
        WatchTimeChart(stats: stats, range: loads.range, memory: memory)
        Totals(stats: stats)
        TopTitles(stats: stats, memory: memory)
        Genres(stats: stats, memory: memory)
        Standing(board: loads.board, range: loads.range, memory: memory)
        ViewingTimes(stats: stats, range: loads.range, memory: memory)
      }
    }
  }
}

/// "Statistics" and the ranges as chips under it, the one picked marked.
private struct StatsHeading: View {
  let range: String
  let showsRanges: Bool
  let memory: TVFocusMemory
  let onPick: (String) -> Void
  @FocusState private var focused: String?

  var body: some View {
    VStack(alignment: .leading, spacing: TVSpace.s5) {
      Text(Str.profileStatistics).textStyle(.headline).accessibilityAddTraits(.isHeader)
      if showsRanges {
        HStack(spacing: TVSpace.s3) {
          ForEach(STATS_RANGES, id: \.self) { option in
            TVChip(rangeName(option), selected: option == range) { onPick(option) }
              .focused($focused, equals: option)
          }
        }
        .tvFocusRow(ProfileRow.ranges, memory: memory, focused: $focused, first: range)
      }
    }
    .padding(.leading, TVPage.start)
    .padding(.trailing, TVPage.end)
    .padding(.top, TVSpace.s6)
    .profileRow(ProfileRow.ranges)
  }
}

/// Nothing watched in the range picked, though there is in all time, and the way back to all time.
/// A row of its own in focus memory, resting where the ranges do, so the heading stays in view.
private struct NothingInRange: View {
  let range: String
  let memory: TVFocusMemory
  let onAllTime: () -> Void
  @FocusState private var focused: String?

  var body: some View {
    VStack(alignment: .leading, spacing: TVSpace.s7) {
      Text(Str.profileNothingWatched(rangePhrase(range))).textStyle(.title)
      TVButton(Str.profileShowAllTime, icon: .calendar, action: onAllTime)
        .focused($focused, equals: StatsRange.all)
    }
    .tvFocusRow(ProfileRow.nothing, memory: memory, focused: $focused, first: StatsRange.all)
    .padding(.leading, TVPage.start)
    .padding(.trailing, TVPage.end)
  }
}

// MARK: Watch time

/// The range's watch time, large, over watch time per day, week, or month
/// as bars. While a bar has focus, the line and the figure above read that
/// day, week, or month out instead: when, how many plays, how long.
private struct WatchTimeChart: View {
  let stats: WatchStats
  let range: String
  let memory: TVFocusMemory
  @State private var picked: Int?
  @Environment(\.palette) private var palette

  var body: some View {
    let buckets = stats.buckets
    let shown = picked.flatMap { buckets.indices.contains($0) ? buckets[$0] : nil }
    let top = scaleTop(buckets.map(\.watchSeconds).max() ?? 0)
    VStack(alignment: .leading, spacing: 0) {
      Text(
        shown.map { "\(bucketName($0.start, unit: stats.unit))  ·  \(Str.statsPlayCount($0.plays))" }
          ?? "\(Str.statsWatchTime)  ·  \(rangeName(stats.range))"
      )
      .textStyle(.facts)
      .foregroundStyle(shown == nil ? palette.mutedForeground : palette.foreground)
      .lineLimit(1)
      Text(formatWatchTime(shown?.watchSeconds ?? stats.totals.watchSeconds))
        .textStyle(.display)
        .monospacedDigit()
        .contentTransition(.numericText())
        .lineLimit(1)
      if !buckets.isEmpty {
        TVBarChart(
          buckets.map(\.watchSeconds), top: top, scale: [formatWatchTime(top), formatWatchTime(top / 2)],
          start: buckets.first.map { bucketName($0.start, unit: stats.unit) },
          end: buckets.last.map { bucketName($0.start, unit: stats.unit) }, memory: memory,
          key: ProfileRow.watchTime(range),
          // The newest first, as Android starts.
          first: buckets.indices.last, selection: $picked
        ) { index in
          "\(bucketName(buckets[index].start, unit: stats.unit)), \(formatWatchTime(buckets[index].watchSeconds))"
        }
        .padding(.top, TVSpace.s6)
      }
    }
    .padding(.leading, TVPage.start)
    .padding(.trailing, TVPage.end)
    .profileRow(ProfileRow.watchTime(range))
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Str.statsWatchTime)
  }
}

/// Plays and what was finished, as large figures across. The watch time is the chart's, above.
private struct Totals: View {
  let stats: WatchStats
  @Environment(\.palette) private var palette

  var body: some View {
    let totals = stats.totals
    let figures: [(Int, String)] = [
      (totals.plays, Str.statsPlays),
      (totals.movies, Str.statsMoviesFinished),
      (totals.episodes, Str.statsEpisodesFinished),
      (totals.shows, Str.statsShowsWatched),
    ]
    HStack(alignment: .top, spacing: 96) {
      ForEach(figures.indices, id: \.self) { index in
        VStack(alignment: .leading, spacing: 0) {
          Text(formatCount(figures[index].0)).textStyle(.display).monospacedDigit().lineLimit(1)
          Text(figures[index].1).textStyle(.label).foregroundStyle(palette.mutedForeground).lineLimit(1)
        }
        .accessibilityElement(children: .combine)
      }
    }
    .padding(.leading, TVPage.start)
    .padding(.trailing, TVPage.end)
  }
}

// MARK: Rankings

/// The most watched titles as posters, ranked, each with its watch time
/// and how often it was played under it.
private struct TopTitles: View {
  let stats: WatchStats
  let memory: TVFocusMemory
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.tvActions) private var actions
  @Environment(\.snackbar) private var snackbar
  @Environment(ViewerState.self) private var viewer: ViewerState?

  private struct Ranked {
    let rank: Int
    let entry: TitleStat
  }

  var body: some View {
    if !stats.titles.isEmpty {
      let ranked = stats.titles.enumerated().map { Ranked(rank: $0.offset + 1, entry: $0.element) }
      TVRow(Str.statsTop, key: ProfileRow.top, items: ranked, itemKey: \.entry.title.id, memory: memory) { ranked in
        let title = ranked.entry.title
        let target = TVActionTarget.title(title)
        TVCaptionedPoster(
          title.name,
          detail: "\(formatWatchTime(ranked.entry.watchSeconds))  ·  \(Str.statsPlayCount(ranked.entry.plays))",
          badge: formatCount(ranked.rank), action: { nav.title(title) }, onLongPress: { actions?.open(target) },
          onPlayPause: { actions?.play(target, api: api, viewer: viewer, nav: nav, snackbar: snackbar) }
        ) {
          Picture(api?.art(title.images.poster, size: .medium))
        }
      }
      .profileRow(ProfileRow.top)
    }
  }
}

/// Watch time per genre, each a pill that opens the genre. A title can
/// have several, so their times add up to more than the whole.
private struct Genres: View {
  let stats: WatchStats
  let memory: TVFocusMemory
  @Environment(\.navigator) private var nav

  var body: some View {
    if !stats.genres.isEmpty {
      TVRow(Str.statsGenres, key: ProfileRow.genres, items: stats.genres, itemKey: \.name, memory: memory, spacing: TVButtons.gap) {
        genre in
        TVButton(genre.name, detail: formatWatchTime(genre.watchSeconds)) { nav.genre(genre.name) }
      }
      .profileRow(ProfileRow.genres)
    }
  }
}

// MARK: Viewing times

/// When in the week watching starts: a square per hour of each weekday,
/// deeper for more. Under the title, the busiest time; while a square has
/// focus, that hour and its watch time instead.
private struct ViewingTimes: View {
  let stats: WatchStats
  let range: String
  let memory: TVFocusMemory
  @State private var picked: TVHeatmapCell?
  @Environment(\.palette) private var palette

  var body: some View {
    let grid = ActivityGrid(stats.activity)
    if let peak = grid.peak {
      VStack(alignment: .leading, spacing: 0) {
        Text(Str.statsHeatmapTitle).textStyle(.title).lineLimit(1).accessibilityAddTraits(.isHeader)
        Group {
          if let picked {
            // Weekdays count from 1, Monday, as the server sends them; the rows from 0.
            let weekday = picked.row + 1
            Text(
              "\(heatmapCellName(weekday: weekday, hour: picked.column))  ·  \(formatWatchTime(grid.value(weekday: weekday, hour: picked.column)))"
            )
            .foregroundStyle(palette.foreground)
          } else {
            Text(Str.statsHeatmapPeak(weekdayName(peak.weekday, short: false), hourName(peak.hour)))
              .foregroundStyle(palette.mutedForeground)
          }
        }
        .textStyle(.facts)
        .lineLimit(1)
        .padding(.top, 4)
        .padding(.bottom, TVSpace.s6)
        TVHeatmap(
          rows: (1...7).map { weekdayName($0, short: true) }, columns: 24,
          intensity: { grid.intensity(weekday: $0.row + 1, hour: $0.column) },
          columnLabels: stride(from: 0, to: 24, by: 3).map { (column: $0, text: hourName($0)) }, memory: memory,
          key: ProfileRow.viewingTimes(range), first: TVHeatmapCell(row: peak.weekday - 1, column: peak.hour),
          selection: $picked
        ) { cell in
          let weekday = cell.row + 1
          return "\(heatmapCellName(weekday: weekday, hour: cell.column)), \(formatWatchTime(grid.value(weekday: weekday, hour: cell.column)))"
        }
      }
      .padding(.leading, TVPage.start)
      .padding(.trailing, TVPage.end)
      .profileRow(ProfileRow.viewingTimes(range))
    }
  }
}
