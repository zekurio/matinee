import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Stats.kt: a profile's statistics, as the web's watch-stats.tsx,
 * stat-blocks.tsx, and standing.tsx draw them: the range chips, the watch
 * time over its bars, the headline figures, the most watched titles, the
 * genres, where the person stands on the leaderboard, and when in the
 * week they watch. The charts are StatsCharts.swift's; the words
 * StatsData.swift's.
 *
 * The cards are the web's: `bg-card rounded-xl border`, a section's name
 * in `text-15px font-semibold` over a line, and rows to the card's edges
 * with a line between each. On a phone they're one column, in Android's
 * order; from the web's `md` two, and from `xl` three, each card going
 * where the columns are shortest so neither runs on alone.
 */

/// The gap between the statistics' cards, both ways: the web's `gap-4`.
private let CARD_GAP = Space.s4

/// How many columns of cards a window takes: the web's `md:grid-cols-2 xl:grid-cols-3`.
func statsColumns(_ window: CGSize) -> Int { window.width >= 1280 ? 3 : window.width >= 768 ? 2 : 1 }

/// A ranking's poster's corners: the web's `rounded-[4px]` on a 40-point poster.
private let THUMB_RADIUS: CGFloat = 4

// MARK: Parts

extension View {
  /// The surface statistics sit on: `bg-card rounded-xl border`.
  func statsCard() -> some View { modifier(StatsCardLook()) }
}

private struct StatsCardLook: ViewModifier {
  @Environment(\.palette) private var palette

  func body(content: Content) -> some View {
    let shape = RoundedRectangle.kit(Radius.xl)
    content
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(palette.card, in: shape)
      .clipShape(shape)
      .overlay { shape.strokeBorder(palette.border) }
  }
}

/// A titled card of statistics, as the web's `StatsSection`: its name at
/// the top over a line across it, so the first row reads as a row and not
/// part of the heading, then `content`, rows to the card's edges.
struct StatsSection<Content: View>: View {
  let title: String
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette

  init(_ title: String, @ViewBuilder content: @escaping () -> Content) {
    self.title = title
    self.content = content
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(title)
        .textStyle(.px15, weight: .semibold)
        .foregroundStyle(palette.foreground)
        .padding(.horizontal, Space.s4)
        .padding(.top, Space.s4)
        .padding(.bottom, Space.s3)
        .accessibilityAddTraits(.isHeader)
      Separator()
      content()
    }
    .statsCard()
    .accessibilityElement(children: .contain)
  }
}

/// A card's rows with a line between each: the web's `divide-y`.
private struct StatsRows<Content: View>: View {
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(spacing: 0) {
      Group(subviews: content()) { rows in
        ForEach(rows.indices, id: \.self) { index in
          if index > 0 { Separator() }
          rows[index]
        }
      }
    }
  }
}

/// A row that opens something when it can: offline, a title's or a
/// genre's page is the server's, so the row only shows, at full strength.
private struct RowButton<Label: View>: View {
  let enabled: Bool
  let action: () -> Void
  @ViewBuilder let label: () -> Label

  var body: some View {
    if enabled {
      Pressable(action: action) { label().contentShape(Rectangle()) }
    } else {
      label()
    }
  }
}

/// What a row counts and its figure: side by side, the figure at the end,
/// or at the largest text sizes the figure under the words, so neither is
/// squeezed into a column of letters.
private struct LabelValue<Label: View, Value: View>: View {
  var spacing: CGFloat = Space.s4
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

// MARK: The range

/// The ranges as chips: on a phone a row scrolling sideways past the
/// page's edge, from the web's `sm` up wrapping at the heading's end.
struct RangeChips: View {
  let current: String
  let onPick: (String) -> Void
  var wraps = false
  @Environment(\.gutter) private var gutter

  var body: some View {
    if wraps {
      FlowRow(spacing: Space.s1_5, lineSpacing: Space.s1_5) { chips }
    } else {
      ScrollView(.horizontal) {
        HStack(spacing: Space.s1_5) { chips }
      }
      .contentMargins(.horizontal, gutter, for: .scrollContent)
      .scrollIndicators(.hidden)
      .scrollClipDisabled()
    }
  }

  @ViewBuilder private var chips: some View {
    ForEach(STATS_RANGES, id: \.self) { range in
      Chip(rangeName(range), selected: range == current) { onPick(range) }
    }
  }
}

/// The statistics' heading, the size of Home's rows, with the range chips:
/// under it on a phone, at its end where they fit beside it, as the web's
/// `SectionHeading` with its action.
struct StatsHeading: View {
  let range: String
  let showsRange: Bool
  let onPick: (String) -> Void
  @Environment(\.gutter) private var gutter
  @Environment(\.windowSize) private var window

  var body: some View {
    if showsRange && window.width >= 640 {
      ViewThatFits(in: .horizontal) {
        HStack(spacing: Space.s2_5) {
          SectionTitle(Str.profileStatistics)
          Spacer(minLength: Space.s4)
          HStack(spacing: Space.s1_5) {
            ForEach(STATS_RANGES, id: \.self) { range in
              Chip(rangeName(range), selected: range == self.range) { onPick(range) }
            }
          }
        }
        VStack(alignment: .leading, spacing: Space.s2) {
          SectionTitle(Str.profileStatistics)
          RangeChips(current: range, onPick: onPick, wraps: true)
        }
      }
      .padding(.horizontal, gutter)
    } else {
      VStack(alignment: .leading, spacing: Space.s2) {
        SectionTitle(Str.profileStatistics).padding(.horizontal, gutter)
        if showsRange { RangeChips(current: range, onPick: onPick) }
      }
    }
  }
}

// MARK: The cards

/// Every card for figures that have plays in them: the watch time and the
/// figures, then the rankings, the standing, and the viewing times.
/// `standing` is left out offline, as a board of everyone's isn't saved.
struct StatsCards: View {
  let stats: WatchStats
  let range: String
  let board: Leaderboard?
  let standing: Bool
  @Environment(\.windowSize) private var window
  @State private var width: CGFloat = 0

  var body: some View {
    let columns = statsColumns(window)
    VStack(alignment: .leading, spacing: CARD_GAP) {
      WatchOverview(stats: stats, columns: columns, width: width)
      StatsColumns(columns: columns, spacing: CARD_GAP) {
        TopTitles(stats: stats)
        Genres(stats: stats)
        if standing { Standing(board: board, range: range) }
        Activity(stats: stats)
      }
    }
    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
  }
}

/// The watch time card and the figures, as the web's `WatchOverview`: the
/// card two columns wide and the figures in the third beside it, the
/// card's bars filling the figures' height; with fewer columns, one over
/// the other.
private struct WatchOverview: View {
  let stats: WatchStats
  let columns: Int
  let width: CGFloat

  var body: some View {
    if columns >= 3 && width > 0 {
      let column = (width - CARD_GAP * 2) / 3
      HStack(alignment: .top, spacing: CARD_GAP) {
        WatchTimeCard(stats: stats, chartMinimum: 80).frame(width: column * 2 + CARD_GAP).frame(maxHeight: .infinity)
        StatFigures(stats: stats).frame(width: column)
      }
      .fixedSize(horizontal: false, vertical: true)
    } else {
      VStack(spacing: CARD_GAP) {
        WatchTimeCard(stats: stats)
        StatFigures(stats: stats)
      }
    }
  }
}

/// The range's watch time as a card, as the web shows it: the total, big,
/// over watch time per day, week, or month as bars. Holding a bar reads
/// that day, week, or month out in the total's place; VoiceOver's swipes
/// up and down step through them the same way.
struct WatchTimeCard: View {
  let stats: WatchStats
  /// The bars' least height: the web's `min-h-36`, or `xl:min-h-20` beside the figures.
  var chartMinimum: CGFloat = 144
  @State private var active: Int?
  @Environment(\.palette) private var palette

  var body: some View {
    let buckets = stats.buckets
    let shown = active.flatMap { buckets.indices.contains($0) ? buckets[$0] : nil }
    VStack(alignment: .leading, spacing: Space.s4) {
      VStack(alignment: .leading, spacing: 0) {
        Text(shown.map { bucketName($0.start, unit: stats.unit) } ?? "\(Str.statsWatchTime) · \(rangeName(stats.range))")
          .textStyle(.sm)
          .foregroundStyle(palette.mutedForeground)
          .lineLimit(2)
        Text(formatWatchTime(shown?.watchSeconds ?? stats.totals.watchSeconds))
          .textStyle(.xl4, weight: .bold, tracking: .tight)
          .monospacedDigit()
          .foregroundStyle(palette.foreground)
          .contentTransition(.numericText())
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      // The chart says the same, and every bar's.
      .accessibilityHidden(!buckets.isEmpty)
      if !buckets.isEmpty {
        WatchChart(stats: stats, active: $active)
          .frame(minHeight: chartMinimum)
          .frame(maxHeight: .infinity)
      }
    }
    .padding(Space.s4)
    .frame(maxHeight: .infinity, alignment: .top)
    .statsCard()
    .onChange(of: stats) { active = nil }
  }
}

/// Plays and what was finished, as the web's `StatFigures`: a card of rows
/// as Settings lists its rows, an icon, what it counts, and the number at
/// the end, so it reads as a sentence rather than a wall of numbers.
struct StatFigures: View {
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
    StatsRows {
      ForEach(rows.indices, id: \.self) { index in
        let (icon, label, value) = rows[index]
        HStack(spacing: Space.s3_5) {
          LucideIcon(icon, size: 20, tint: palette.mutedForeground)
          LabelValue {
            Text(label).textStyle(.px15).foregroundStyle(palette.foreground)
          } value: {
            Text(formatCount(value)).textStyle(.px15, weight: .semibold).monospacedDigit()
              .foregroundStyle(palette.foreground)
          }
        }
        .padding(.horizontal, Space.s4)
        .padding(.vertical, Space.s3)
        .accessibilityElement(children: .combine)
      }
    }
    .statsCard()
  }
}

/// The most watched titles, ranked, as the web's `TopTitlesSection`: the
/// first three stand out, each with a small poster, how often it was
/// played, and its watch time at the end. A row opens the title.
struct TopTitles: View {
  let stats: WatchStats
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var typeSize
  @ScaledMetric(relativeTo: .body) private var rankWidth: CGFloat = 24

  var body: some View {
    if !stats.titles.isEmpty {
      StatsSection(Str.statsTop) {
        StatsRows {
          ForEach(Array(stats.titles.enumerated()), id: \.element.title.id) { index, entry in
            RowButton(enabled: !offline, action: { nav.title(entry.title) }) {
              row(index, entry)
            }
            .accessibilityElement(children: .combine)
          }
        }
      }
    }
  }

  private func row(_ index: Int, _ entry: TitleStat) -> some View {
    HStack(spacing: Space.s3_5) {
      Text(formatCount(index + 1))
        .textStyle(.base, weight: .semibold)
        .monospacedDigit()
        .foregroundStyle(index < 3 ? palette.foreground : palette.mutedForeground)
        .frame(minWidth: rankWidth, alignment: .leading)
      // The poster alone, on the title's tone: at this size a name over it would be an ellipsis.
      ZStack {
        Tone(entry.title.id)
        Picture(api?.art(entry.title.images.poster))
      }
      .frame(width: 40, height: 60)
      .clipShape(RoundedRectangle.kit(THUMB_RADIUS))
      .overlay { RoundedRectangle.kit(THUMB_RADIUS).strokeBorder(palette.border) }
      .accessibilityHidden(true)
      LabelValue(spacing: Space.s3_5) {
        VStack(alignment: .leading, spacing: 0) {
          Text(entry.title.name).textStyle(.px15).foregroundStyle(palette.foreground)
            .lineLimit(typeSize.isAccessibilitySize ? 3 : 1)
          Text(Str.statsPlayCount(entry.plays)).textStyle(.sm).monospacedDigit()
            .foregroundStyle(palette.mutedForeground)
        }
      } value: {
        Text(formatWatchTime(entry.watchSeconds)).textStyle(.px15, weight: .semibold).monospacedDigit()
          .foregroundStyle(palette.foreground)
      }
    }
    .padding(.horizontal, Space.s4)
    .padding(.vertical, Space.s3)
  }
}

/// Watch time per genre, as the web's rows: a title can have several
/// genres, so their times add up to more than the whole, and there's no
/// bar or share to measure them by. A row opens the genre, as on Android.
struct Genres: View {
  let stats: WatchStats
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette

  var body: some View {
    if !stats.genres.isEmpty {
      StatsSection(Str.statsGenres) {
        StatsRows {
          ForEach(stats.genres, id: \.name) { genre in
            RowButton(enabled: !offline, action: { nav.genre(genre.name) }) {
              LabelValue {
                Text(genreName(genre.name)).textStyle(.px15).foregroundStyle(palette.foreground)
              } value: {
                Text(formatWatchTime(genre.watchSeconds)).textStyle(.px15, weight: .semibold).monospacedDigit()
                  .foregroundStyle(palette.foreground)
              }
              .padding(.horizontal, Space.s4)
              .padding(.vertical, Space.s3)
            }
            .accessibilityElement(children: .combine)
          }
        }
      }
    }
  }
}

/// Where the signed-in user stands on each board of the leaderboard for the
/// range, as the web's `StandingSection`: their place between the people
/// just above and below them. A board's name opens it whole, in a sheet.
/// Boards they aren't on are left out, and with none the card is too.
struct Standing: View {
  let board: Leaderboard?
  let range: String
  @State private var open: OpenBoard?
  @Environment(\.palette) private var palette

  var body: some View {
    let found = standings(board)
    if !found.isEmpty {
      StatsSection(Str.statsStandingTitle) {
        StatsRows {
          ForEach(found, id: \.board.metric) { standing in
            VStack(alignment: .leading, spacing: Space.s1_5) {
              Pressable(shape: .kit(Radius.sm)) {
                open = OpenBoard(board: standing.board)
              } label: {
                HStack(spacing: Space.s0_5) {
                  Text(metricName(standing.board.metric)).textStyle(.sm).foregroundStyle(palette.mutedForeground)
                  LucideIcon(.chevronRight, size: 14, tint: palette.mutedForeground)
                }
                .padding(.vertical, Space.s1)
                .padding(.horizontal, Space.s1)
                .contentShape(Rectangle())
              }
              .padding(.horizontal, -Space.s1)
              .accessibilityAddTraits(.isHeader)
              VStack(spacing: 0) {
                ForEach(standing.places, id: \.rank) { place in
                  PlaceRow(place: place, value: metricValue(standing.board.metric, place.value))
                }
              }
              .padding(.horizontal, -Space.s2)
            }
            .padding(.horizontal, Space.s4)
            .padding(.vertical, Space.s3)
          }
        }
      }
      .matineeSheet(item: $open, size: .mediumAndLarge) { open in BoardSheet(board: open.board, range: range) }
    }
  }
}

private struct OpenBoard: Identifiable {
  let board: LeaderboardBoard
  var id: String { board.metric }
}

/// A whole board, as the web's dialog over the profile: the top places,
/// then the viewer's neighborhood, set off unless it carries straight on.
private struct BoardSheet: View {
  let board: LeaderboardBoard
  let range: String

  var body: some View {
    SheetHeader(metricName(board.metric), subtitle: rangeName(range))
    SheetBody(sides: Space.s3, top: Space.s2, bottom: Space.s2) {
      ForEach(Array(board.entries.enumerated()), id: \.offset) { index, place in
        PlaceRow(place: place, value: metricValue(board.metric, place.value))
          .padding(.top, startsNeighborhood(board, index) ? Space.s1_5 : 0)
      }
    }
  }
}

/// A place, as the web's `Place`: the rank, the podium's in the accent
/// fading from first to third, the person, and the value; the user's own lit.
private struct PlaceRow: View {
  let place: LeaderboardEntry
  let value: String
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette
  @ScaledMetric(relativeTo: .caption2) private var rankSize: CGFloat = 20

  var body: some View {
    let user = place.user
    let (fill, ink): (Color, Color) =
      switch place.rank {
      case 1: (palette.accent, palette.accentForeground)
      case 2: (palette.accent.opacity(0.6), palette.accentForeground)
      case 3: (palette.accent.opacity(0.3), palette.foreground)
      default: (.clear, palette.mutedForeground)
      }
    HStack(spacing: Space.s2_5) {
      Text(formatCount(place.rank))
        .textStyle(.px11, weight: .semibold)
        .monospacedDigit()
        .foregroundStyle(ink)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .frame(minWidth: rankSize, minHeight: rankSize)
        .background(fill, in: Capsule())
      ProfileAvatar(user.name, url: user.avatarId.flatMap { api?.paths.avatar($0) }, size: 24)
        .accessibilityHidden(true)
      LabelValue(spacing: Space.s2_5) {
        Text(place.isSelf ? Str.statsNameYou(user.name) : user.name)
          .textStyle(.px13)
          .foregroundStyle(palette.foreground)
          .lineLimit(2)
      } value: {
        Text(value).textStyle(.px13, weight: .medium).monospacedDigit().foregroundStyle(palette.foreground)
      }
    }
    .padding(.horizontal, Space.s2)
    .padding(.vertical, Space.s1)
    .background(place.isSelf ? palette.accent.opacity(0.1) : .clear, in: RoundedRectangle.kit(Radius.md))
    .accessibilityElement(children: .combine)
  }
}

/// When in the week watching starts, as the web's `ActivitySection`: the
/// heatmap, and under it the busiest time, or the square held.
struct Activity: View {
  let stats: WatchStats
  @State private var active: ActivityCell?
  @Environment(\.palette) private var palette

  var body: some View {
    let grid = ActivityGrid(stats.activity)
    if let peak = grid.peak {
      StatsSection(Str.statsHeatmapTitle) {
        VStack(alignment: .leading, spacing: Space.s2) {
          Heatmap(grid: grid, active: $active)
          Group {
            if let active {
              Text("\(heatmapCellName(weekday: active.weekday, hour: active.hour)) · \(formatWatchTime(active.watchSeconds))")
                .foregroundStyle(palette.foreground)
            } else {
              Text(Str.statsHeatmapPeak(weekdayName(peak.weekday, short: false), hourName(peak.hour)))
                .foregroundStyle(palette.mutedForeground)
            }
          }
          .textStyle(.xs)
          // The heatmap reads it out itself.
          .accessibilityHidden(true)
        }
        .padding(Space.s4)
      }
      .onChange(of: stats) { active = nil }
    }
  }
}

/// Where the cards go while the first figures load, as the web's `WatchStatsSkeleton`.
struct StatsSkeleton: View {
  @Environment(\.windowSize) private var window

  var body: some View {
    let layout =
      window.width >= 1024
      ? AnyLayout(HStackLayout(alignment: .top, spacing: CARD_GAP))
      : AnyLayout(VStackLayout(spacing: CARD_GAP))
    layout {
      Skeleton(radius: Radius.xl).frame(height: 256).layoutPriority(2)
      Skeleton(radius: Radius.xl).frame(height: 192)
    }
    .accessibilityElement()
    .accessibilityLabel(Str.loadingInProgress)
  }
}

// MARK: Columns

/// Cards in `columns` columns of the same width, each going under the
/// shortest column so far, in order: one column on a phone. A card that
/// draws nothing, as the standing before its board loads, takes no room
/// and no gap.
struct StatsColumns: Layout {
  let columns: Int
  let spacing: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? 360
    return CGSize(width: width, height: arrange(width: width, subviews).height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    let arranged = arrange(width: bounds.width, subviews)
    for (subview, spot) in zip(subviews, arranged.spots) {
      subview.place(
        at: CGPoint(x: bounds.minX + spot.x, y: bounds.minY + spot.y), anchor: .topLeading,
        proposal: ProposedViewSize(width: arranged.column, height: spot.height))
    }
  }

  private struct Spot {
    var x: CGFloat
    var y: CGFloat
    var height: CGFloat
  }

  private func arrange(width: CGFloat, _ subviews: Subviews) -> (spots: [Spot], column: CGFloat, height: CGFloat) {
    let count = max(columns, 1)
    let column = max((width - spacing * CGFloat(count - 1)) / CGFloat(count), 0)
    var heights = Array(repeating: CGFloat(0), count: count)
    var spots: [Spot] = []
    for subview in subviews {
      let height = subview.sizeThatFits(ProposedViewSize(width: column, height: nil)).height
      guard height > 0 else {
        spots.append(Spot(x: 0, y: 0, height: 0))
        continue
      }
      let shortest = heights.indices.min { heights[$0] < heights[$1] } ?? 0
      let y = heights[shortest] > 0 ? heights[shortest] + spacing : 0
      spots.append(Spot(x: CGFloat(shortest) * (column + spacing), y: y, height: height))
      heights[shortest] = y + height
    }
    return (spots, column, heights.max() ?? 0)
  }
}
