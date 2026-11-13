import Accessibility
import MatineeCore
import SwiftUI
import UIKit

/*
 * Stats.kt: a profile's statistics, as the web's watch-stats: the range
 * chips, the headline figures, watch time per day, week, or month, the
 * most watched titles, the genres, where the person stands on the
 * leaderboard, and when in the week they watch. The charts are drawn with
 * shapes in the palette and given their values for VoiceOver, which reads
 * a drawing as nothing otherwise.
 */

/// The ranges as chips, scrolling sideways past the page's edge.
struct RangeChips: View {
  let current: String
  let onPick: (String) -> Void

  var body: some View {
    ScrollView(.horizontal) {
      HStack(spacing: 6) {
        ForEach(STATS_RANGES, id: \.self) { range in
          Chip(rangeName(range), selected: range == current) { onPick(range) }
        }
      }
    }
    .contentMargins(.horizontal, Gutter, for: .scrollContent)
    .scrollIndicators(.hidden)
  }
}

extension View {
  /// The card statistics sit in: the app's card color with its rim.
  fileprivate func statsCard() -> some View { modifier(StatsCardLook()) }
}

private struct StatsCardLook: ViewModifier {
  @Environment(\.palette) private var palette

  func body(content: Content) -> some View {
    content
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(palette.card, in: CardShape)
      .clipShape(CardShape)
      .overlay { CardShape.strokeBorder(palette.border) }
  }
}

/// A card with the section's name in small type at the top, as the watch time card has it.
private struct StatsCard<Content: View>: View {
  let label: String
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(label).textStyle(.bodyMedium).foregroundStyle(palette.muted)
        .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 4)
        .accessibilityAddTraits(.isHeader)
      content()
    }
    .statsCard()
  }
}

/// A line between a card's rows, from the rows' leading edge.
private struct CardDivider: View {
  var inset: CGFloat = 16
  @Environment(\.palette) private var palette

  var body: some View { Rectangle().fill(palette.border).frame(height: 1).padding(.leading, inset) }
}

/// What a row counts and its figure: side by side, the figure at the end,
/// or at the largest text sizes the figure under the words, so neither is
/// squeezed into a column of letters.
private struct LabelValue<Label: View, Value: View>: View {
  var spacing: CGFloat = 14
  @ViewBuilder let label: () -> Label
  @ViewBuilder let value: () -> Value
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    let stacked = typeSize.isAccessibilitySize
    let layout = stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2)) : AnyLayout(HStackLayout(spacing: spacing))
    layout {
      label().frame(maxWidth: .infinity, alignment: .leading).multilineTextAlignment(.leading)
      value().fixedSize(horizontal: !stacked, vertical: false)
    }
  }
}

/// Plays and what was finished, a row each as Settings lists its rows: an
/// icon, what it counts, and the number at the end.
struct StatList: View {
  let stats: WatchStats
  @Environment(\.palette) private var palette

  var body: some View {
    let totals = stats.totals
    let rows: [(Lucide, String, Int)] = [
      (.playOutline, Str.statsPlays, totals.plays),
      (.film, Str.statsMoviesFinished, totals.movies),
      (.tv, Str.statsEpisodesFinished, totals.episodes),
      (.tvPlay, Str.statsShowsWatched, totals.shows),
    ]
    VStack(spacing: 0) {
      ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
        if index > 0 { CardDivider(inset: 0) }
        HStack(spacing: 14) {
          LucideIcon(row.0, size: 20, tint: palette.muted)
          Text(row.1).textStyle(.bodyLarge).foregroundStyle(palette.foreground)
            .frame(maxWidth: .infinity, alignment: .leading)
          Text(formatCount(row.2)).textStyle(.bodyLarge, weight: .semibold).foregroundStyle(palette.foreground)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .accessibilityElement(children: .combine)
      }
    }
    .statsCard()
  }
}

/// The range's watch time as a card, as the web shows it: the total, big,
/// over watch time per day, week, or month as bars. Holding a bar reads
/// that day, week, or month out in the total's place; VoiceOver's swipes
/// up and down step through them the same way.
struct WatchTimeCard: View {
  let stats: WatchStats
  @State private var active: Int?
  @Environment(\.palette) private var palette

  var body: some View {
    let buckets = stats.buckets
    let shown = active.flatMap { buckets.indices.contains($0) ? buckets[$0] : nil }
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 0) {
        Text(shown.map { bucketName($0.start, unit: stats.unit) } ?? "\(Str.statsWatchTime) · \(rangeName(stats.range))")
          .textStyle(.bodyMedium).foregroundStyle(palette.muted)
        Text(formatWatchTime(shown?.watchSeconds ?? stats.totals.watchSeconds))
          .textStyle(.displaySmall, weight: .bold).foregroundStyle(palette.foreground)
          .contentTransition(.numericText())
      }
      // The chart says the same, bar by bar.
      .accessibilityHidden(!buckets.isEmpty)
      if !buckets.isEmpty {
        WatchChart(stats: stats, active: $active).frame(height: 120).padding(.top, 16)
      }
    }
    .padding(16)
    .statsCard()
    .onChange(of: stats) { active = nil }
  }
}

/// Watch time per bucket as bars on a baseline, filling its box.
private struct WatchChart: View {
  let stats: WatchStats
  @Binding var active: Int?
  @Environment(\.palette) private var palette
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var width: CGFloat = 0

  var body: some View {
    let buckets = stats.buckets
    let top = scaleTop(buckets.map(\.watchSeconds).max() ?? 0)
    let accent = palette.accent
    let baseline = palette.border
    Canvas { context, size in
      let layout = BarLayout(width: size.width, count: buckets.count)
      context.fill(Path(CGRect(x: 0, y: size.height - 1, width: size.width, height: 1)), with: .color(baseline))
      for (index, bucket) in buckets.enumerated() {
        let height = BarLayout.height(bucket.watchSeconds, top: top, in: size.height)
        guard height > 0 else { continue }
        let rect = CGRect(x: layout.x(index), y: size.height - height, width: layout.barWidth, height: height)
        let lit = active == nil || active == index
        context.fill(
          Path(roundedRect: rect, cornerRadius: layout.radius, style: .continuous),
          with: .color(lit ? accent : accent.opacity(0.45)))
      }
    }
    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
    .contentShape(Rectangle())
    // Held, then slid along, as iOS's own charts read a point: a finger
    // that moves at once scrolls the page instead.
    .gesture(
      BarPress { x in active = x.flatMap { BarLayout(width: width, count: buckets.count).index(at: $0) } }
    )
    .onContinuousHover { phase in
      switch phase {
      case .active(let point): active = BarLayout(width: width, count: buckets.count).index(at: point.x)
      case .ended: active = nil
      }
    }
    .accessibilityElement()
    .accessibilityLabel("\(Str.statsWatchTime) · \(rangeName(stats.range))")
    .accessibilityValue(accessibilityValue(buckets))
    .accessibilityAdjustableAction { direction in
      let last = buckets.count - 1
      switch direction {
      case .increment: active = min((active ?? -1) + 1, last)
      case .decrement: active = max((active ?? buckets.count) - 1, 0)
      @unknown default: break
      }
    }
    .accessibilityChartDescriptor(WatchChartDescriptor(stats: stats, top: top))
  }

  /// The bar picked, or the total with none.
  private func accessibilityValue(_ buckets: [StatsBucket]) -> String {
    guard let active, buckets.indices.contains(active) else { return formatWatchTime(stats.totals.watchSeconds) }
    let bucket = buckets[active]
    return "\(bucketName(bucket.start, unit: stats.unit)), \(formatWatchTime(bucket.watchSeconds))"
  }
}

/// A finger held on the chart, where it is along it while it stays down,
/// nil once it lifts. SwiftUI's long press says nothing of where, and its
/// drag would take the page's scrolling, so it's UIKit's long press.
private struct BarPress: UIGestureRecognizerRepresentable {
  let onChange: (CGFloat?) -> Void

  func makeUIGestureRecognizer(context: Context) -> UILongPressGestureRecognizer {
    let press = UILongPressGestureRecognizer()
    press.minimumPressDuration = 0.2
    return press
  }

  func handleUIGestureRecognizerAction(_ press: UILongPressGestureRecognizer, context: Context) {
    switch press.state {
    case .began, .changed: onChange(context.converter.localLocation.x)
    default: onChange(nil)
    }
  }
}

/// The chart's values for VoiceOver's audio graph and its data table.
private struct WatchChartDescriptor: AXChartDescriptorRepresentable {
  let stats: WatchStats
  let top: Double

  func makeChartDescriptor() -> AXChartDescriptor {
    let names = stats.buckets.map { bucketName($0.start, unit: stats.unit) }
    let x = AXCategoricalDataAxisDescriptor(title: rangeName(stats.range), categoryOrder: names)
    let y = AXNumericDataAxisDescriptor(
      title: Str.statsWatchTime, range: 0...top, gridlinePositions: []
    ) { formatWatchTime($0) }
    let points = zip(names, stats.buckets).map { name, bucket in AXDataPoint(x: name, y: bucket.watchSeconds) }
    return AXChartDescriptor(
      title: Str.statsWatchTime, summary: formatWatchTime(stats.totals.watchSeconds), xAxis: x, yAxis: y,
      additionalAxes: [], series: [AXDataSeriesDescriptor(name: Str.statsWatchTime, isContinuous: false, dataPoints: points)])
  }
}

/// The most watched titles in a card, ranked: the poster, the name, how
/// often it was played, and its watch time at the end.
struct TopTitles: View {
  let stats: WatchStats
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  // Offline, a title's page is the server's.
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette
  @ScaledMetric(relativeTo: .body) private var rankWidth: CGFloat = 26

  var body: some View {
    if !stats.titles.isEmpty {
      StatsCard(label: Str.statsTop) {
        ForEach(Array(stats.titles.enumerated()), id: \.element.title.id) { index, entry in
          if index > 0 { CardDivider() }
          Button { nav.title(entry.title) } label: {
            HStack(spacing: 0) {
              Text(formatCount(index + 1))
                .textStyle(.titleMedium, weight: .semibold)
                .foregroundStyle(index < 3 ? palette.foreground : palette.muted)
                .frame(width: rankWidth, alignment: .leading)
              // The poster alone: at this size the name the art falls back to would be an ellipsis.
              ArtFrame(entry.title.name, aspect: 2 / 3) { Picture(api?.art(entry.title.images.poster)) }
                .frame(width: 40)
              LabelValue {
                VStack(alignment: .leading, spacing: 0) {
                  Text(entry.title.name).textStyle(.bodyLarge).foregroundStyle(palette.foreground).lineLimit(3)
                  Text(Str.statsPlayCount(entry.plays)).textStyle(.bodySmall).foregroundStyle(palette.muted)
                }
              } value: {
                Text(formatWatchTime(entry.watchSeconds)).textStyle(.bodyLarge, weight: .semibold)
                  .foregroundStyle(palette.foreground)
              }
              .padding(.leading, 14)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
          }
          .buttonStyle(RowPress())
          .disabled(offline)
          .accessibilityElement(children: .combine)
        }
      }
    }
  }
}

/// Watch time per genre in a card. A title can have several genres, so
/// their times add up to more than the whole.
struct Genres: View {
  let stats: WatchStats
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette

  var body: some View {
    if !stats.genres.isEmpty {
      StatsCard(label: Str.statsGenres) {
        ForEach(Array(stats.genres.enumerated()), id: \.element.name) { index, genre in
          if index > 0 { CardDivider() }
          Button { nav.genre(genre.name) } label: {
            LabelValue {
              Text(genre.name).textStyle(.bodyLarge).foregroundStyle(palette.foreground)
            } value: {
              Text(formatWatchTime(genre.watchSeconds)).textStyle(.bodyLarge, weight: .semibold)
                .foregroundStyle(palette.foreground)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .contentShape(Rectangle())
          }
          .buttonStyle(RowPress())
          .disabled(offline)
          .accessibilityElement(children: .combine)
        }
      }
    }
  }
}

/// Where the signed-in user stands on each board of the leaderboard for the
/// range, as the web's profile shows it: their place between the people
/// just above and below them. A board's name opens it whole. Boards they
/// aren't on are left out, and with none the card is too, `gap` and all.
struct Standing: View {
  let range: String
  var gap: CGFloat = 0
  @State private var leaderboard = Loader<Leaderboard>()
  @State private var open: OpenBoard?
  @Environment(\.palette) private var palette

  var body: some View {
    let range = range
    let found = standings(leaderboard.state.value)
    // Something to appear, so the leaderboard loads while the card can't show yet.
    ZStack(alignment: .top) {
      Color.clear.frame(height: 0)
      if !found.isEmpty {
        StatsCard(label: Str.statsStandingTitle) {
          ForEach(Array(found.enumerated()), id: \.element.board.metric) { index, standing in
            if index > 0 { CardDivider() }
            VStack(alignment: .leading, spacing: 6) {
              Button { open = OpenBoard(board: standing.board) } label: {
                HStack(spacing: 2) {
                  Text(metricName(standing.board.metric)).textStyle(.bodySmall).foregroundStyle(palette.muted)
                  LucideIcon(.chevronRight, size: 14, tint: palette.muted)
                }
                .frame(minHeight: 28)
                .contentShape(Rectangle())
              }
              .buttonStyle(RoundPress())
              .accessibilityAddTraits(.isHeader)
              ForEach(standing.places, id: \.rank) { place in
                PlaceRow(place: place, value: metricValue(standing.board.metric, place.value))
              }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
          }
        }
        .padding(.top, gap)
      }
    }
    .loads(leaderboard) { api in
      let board = try await api.stats.leaderboard(range: range, timeZone: statsTimeZone)
      #if DEBUG
        if StatsFixtures.on { return StatsFixtures.leaderboard(board) }
      #endif
      return board
    }
    .sheet(item: $open) { open in BoardSheet(board: open.board, range: range) }
  }
}

private struct OpenBoard: Identifiable {
  let board: LeaderboardBoard
  var id: String { board.metric }
}

/// A whole board, as the leaderboard has it: the top places, then the viewer's neighborhood, set off.
private struct BoardSheet: View {
  let board: LeaderboardBoard
  let range: String

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        SheetHeader(metricName(board.metric), rangeName(range))
        VStack(spacing: 2) {
          ForEach(Array(board.entries.enumerated()), id: \.offset) { index, place in
            // Set off when it doesn't carry straight on from the top places.
            if startsNeighborhood(board, index) { Spacer().frame(height: 10) }
            PlaceRow(place: place, value: metricValue(board.metric, place.value))
          }
        }
        .padding(.horizontal, 12)
      }
      .padding(.vertical, 12)
    }
    .matineeSheet()
  }
}

/// A place: the rank, the podium's in the accent, the person, and the value; the user's own lit.
private struct PlaceRow: View {
  let place: LeaderboardEntry
  let value: String
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette
  @ScaledMetric(relativeTo: .footnote) private var rankSize: CGFloat = 24

  var body: some View {
    let user = place.user
    let podium: Color =
      switch place.rank {
      case 1: palette.accent
      case 2: palette.accent.opacity(0.6)
      case 3: palette.accent.opacity(0.3)
      default: .clear
      }
    HStack(spacing: 10) {
      Text(formatCount(place.rank))
        .textStyle(.labelMedium, weight: .semibold)
        .foregroundStyle(
          place.rank == 1 ? palette.accentForeground : place.rank <= 3 ? palette.foreground : palette.muted)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .frame(minWidth: rankSize, minHeight: rankSize)
        .background(podium, in: Capsule())
      Avatar(user.name, url: user.avatarId.flatMap { api?.paths.avatar($0) }, size: 28)
      LabelValue(spacing: 10) {
        Text(place.isSelf ? "\(user.name) \(Str.statsYou)" : user.name)
          .textStyle(.bodyLarge).foregroundStyle(palette.foreground).lineLimit(2)
      } value: {
        Text(value).textStyle(.bodyMedium, weight: .semibold).foregroundStyle(palette.foreground)
      }
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 6)
    .background(place.isSelf ? palette.accent.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 8))
    .accessibilityElement(children: .combine)
  }
}

/// When in the week watching starts, as the web's heatmap draws it: a
/// square per hour of each weekday, deeper for more, and the busiest time
/// under it.
struct Activity: View {
  let stats: WatchStats
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var typeSize
  @ScaledMetric(relativeTo: .caption2) private var dayWidth: CGFloat = 30

  var body: some View {
    let grid = ActivityGrid(stats.activity)
    if let peak = grid.peak {
      StatsCard(label: Str.statsHeatmapTitle) {
        VStack(alignment: .leading, spacing: 3) {
          VStack(alignment: .leading, spacing: 3) {
            ForEach(1...7, id: \.self) { weekday in
              HStack(spacing: 0) {
                Text(weekdayName(weekday, short: true)).textStyle(.labelSmall).foregroundStyle(palette.muted)
                  .lineLimit(1).minimumScaleFactor(0.7)
                  .frame(width: dayWidth, alignment: .leading)
                Squares(grid: grid, weekday: weekday).frame(height: 12)
              }
            }
            // The hours under the squares, every six, or every twelve where the words are big.
            let marks = activityHourMarks(roomy: !typeSize.isAccessibilitySize)
            HStack(spacing: 0) {
              Color.clear.frame(width: dayWidth, height: 1)
              ForEach(marks, id: \.self) { hour in
                Text(hourName(hour)).textStyle(.labelSmall).foregroundStyle(palette.muted)
                  .lineLimit(1).minimumScaleFactor(0.7)
                  .frame(maxWidth: .infinity, alignment: .leading)
              }
            }
          }
          .accessibilityElement()
          .accessibilityLabel(Str.statsHeatmapTitle)
          .accessibilityValue(
            grid.busiestWeekdays.map { "\(weekdayName($0, short: false)): \(formatWatchTime(grid.total(weekday: $0)))" }
              .joined(separator: ", "))
          Text(Str.statsHeatmapPeak(weekdayName(peak.weekday, short: false), hourName(peak.hour)))
            .textStyle(.bodySmall).foregroundStyle(palette.muted)
            .padding(.top, 6)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 14)
      }
    }
  }
}

/// A weekday's 24 squares.
private struct Squares: View {
  let grid: ActivityGrid
  let weekday: Int
  @Environment(\.palette) private var palette

  var body: some View {
    let accent = palette.accent
    let empty = palette.foreground.opacity(0.06)
    Canvas { context, size in
      let gap: CGFloat = 2
      let cell = (size.width - gap * 23) / 24
      for hour in 0..<24 {
        let rect = CGRect(x: CGFloat(hour) * (cell + gap), y: 0, width: cell, height: size.height)
        let color = grid.intensity(weekday: weekday, hour: hour).map { accent.opacity($0) } ?? empty
        context.fill(Path(roundedRect: rect, cornerRadius: 2, style: .continuous), with: .color(color))
      }
    }
  }
}
