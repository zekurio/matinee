import Accessibility
import MatineeCore
import MatineeKit
import SwiftUI
import UIKit

/*
 * The statistics' two charts, drawn here from the kit's tokens since the
 * kit has none, after the web's watch-chart.tsx, bucket-bars.tsx, and
 * activity-heatmap.tsx, in their colors and measures: Stats.kt's
 * `WatchTimeCard` canvas and its `Activity` grid. The arithmetic is
 * MatineeCore's (`BarLayout`, `scaleTop`, `ActivityGrid`).
 *
 * VoiceOver reads a drawing as nothing, so each chart is one adjustable
 * element: swiping up and down steps through it, a bar or a lit square at
 * a time, as a finger held on it does, and each gives VoiceOver's audio
 * graph and data table its values (`AXChartDescriptor`).
 */

// MARK: Watch time

/// Each bar's share of its bucket, the rest the gap: bucket-bars.tsx's `w-2/3`.
private let BAR_SHARE = 2.0 / 3

/// The bars' rounded top, bucket-bars.tsx's `rounded-t-[2px]`.
private let BAR_RADIUS: CGFloat = 2

/// How faint the bars not pointed at go: the web's `opacity-40`.
private let BAR_DIMMED = 0.4

/// Watch time per day, week, or month as bars on a baseline, filling its
/// box, as the web's `WatchChart` with its axis off. The bar held, or
/// stepped to with VoiceOver, goes to `active` for the card to read out.
struct WatchChart: View {
  let stats: WatchStats
  @Binding var active: Int?
  @Environment(\.palette) private var palette
  @Environment(\.layoutDirection) private var direction
  @State private var size: CGSize = .zero

  var body: some View {
    let buckets = stats.buckets
    let top = scaleTop(buckets.map(\.watchSeconds).max() ?? 0)
    let layout = BarLayout(width: size.width, count: buckets.count, share: BAR_SHARE, maxRadius: BAR_RADIUS)
    // A row of shapes rather than a canvas, so the bars not held fade as the web's do.
    HStack(alignment: .bottom, spacing: layout.gap) {
      ForEach(Array(buckets.enumerated()), id: \.element.start) { index, bucket in
        let height = BarLayout.height(bucket.watchSeconds, top: top, in: size.height)
        UnevenRoundedRectangle(
          topLeadingRadius: layout.radius, bottomLeadingRadius: 0, bottomTrailingRadius: 0,
          topTrailingRadius: layout.radius, style: .circular
        )
        .fill(palette.accent)
        .frame(width: max(layout.barWidth, 0), height: height)
        .opacity(active == nil || active == index ? 1 : BAR_DIMMED)
      }
    }
    .padding(.horizontal, layout.gap / 2)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
    .overlay(alignment: .bottom) {
      // The web's `border-b border-foreground/15`.
      Rectangle().fill(palette.foreground.opacity(0.15)).frame(height: 1)
    }
    .motion(Motion.color, value: active)
    .onGeometryChange(for: CGSize.self) { $0.size } action: { size = $0 }
    .contentShape(Rectangle())
    // Held, then slid along, as iOS's own charts read a point: a finger
    // that moves at once scrolls the page instead.
    .gesture(ChartPress { point in active = point.flatMap { index(at: $0.x, layout) } })
    .onContinuousHover { phase in
      switch phase {
      case .active(let point): active = index(at: point.x, layout)
      case .ended: active = nil
      }
    }
    .accessibilityElement()
    .accessibilityLabel(Str.statsWatchTime)
    .accessibilityValue(accessibilityValue(buckets))
    .accessibilityAdjustableAction { direction in
      active = step(active, count: buckets.count, forward: direction == .increment)
    }
    .accessibilityChartDescriptor(WatchChartDescriptor(stats: stats, top: top))
  }

  /// The bar under `x`, from the leading edge in either direction.
  private func index(at x: CGFloat, _ layout: BarLayout) -> Int? {
    guard let index = layout.index(at: x) else { return nil }
    return direction == .rightToLeft ? layout.count - 1 - index : index
  }

  /// The bar picked, or the range's total with none.
  private func accessibilityValue(_ buckets: [StatsBucket]) -> String {
    guard let active, buckets.indices.contains(active) else {
      return "\(rangeName(stats.range)), \(formatWatchTime(stats.totals.watchSeconds))"
    }
    let bucket = buckets[active]
    return "\(bucketName(bucket.start, unit: stats.unit)), \(formatWatchTime(bucket.watchSeconds))"
  }
}

/// The next of `count` after `current`, or before it, kept on the chart;
/// from none, the first going forward and the last going back.
private func step(_ current: Int?, count: Int, forward: Bool) -> Int? {
  guard count > 0 else { return nil }
  guard let current else { return forward ? 0 : count - 1 }
  return min(max(current + (forward ? 1 : -1), 0), count - 1)
}

/// The watch chart's values for VoiceOver's audio graph and its data table.
private struct WatchChartDescriptor: AXChartDescriptorRepresentable {
  let stats: WatchStats
  let top: Double

  func makeChartDescriptor() -> AXChartDescriptor {
    let names = stats.buckets.map { bucketName($0.start, unit: stats.unit) }
    let x = AXCategoricalDataAxisDescriptor(title: rangeName(stats.range), categoryOrder: names)
    let y = AXNumericDataAxisDescriptor(title: Str.statsWatchTime, range: 0...top, gridlinePositions: []) {
      formatWatchTime($0)
    }
    let points = zip(names, stats.buckets).map { name, bucket in AXDataPoint(x: name, y: bucket.watchSeconds) }
    return AXChartDescriptor(
      title: Str.statsWatchTime, summary: formatWatchTime(stats.totals.watchSeconds), xAxis: x, yAxis: y,
      additionalAxes: [], series: [AXDataSeriesDescriptor(name: Str.statsWatchTime, isContinuous: false, dataPoints: points)])
  }
}

// MARK: Viewing times

/// The room between the squares: activity-heatmap.tsx's `gap-[3px]`.
private let CELL_GAP: CGFloat = 3

/// A square's corners: the web's `rounded-[2px]`.
private let CELL_RADIUS: CGFloat = 2

/// The heatmap's widest, the web's `max-w-md`.
private let HEATMAP_MAX_WIDTH: CGFloat = 448

/// When in the week watching starts, as the web's heatmap draws it: a
/// square per hour of each weekday, the accent deeper for more, the
/// weekdays beside them and every sixth hour under them. A finger held on
/// it reads out the square under it, in `active`; VoiceOver steps through
/// the lit ones.
struct Heatmap: View {
  let grid: ActivityGrid
  @Binding var active: ActivityCell?
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var typeSize
  @Environment(\.layoutDirection) private var direction
  /// The weekdays' names' height, so a row is never shorter than its name.
  @ScaledMetric(relativeTo: .caption2) private var nameHeight: CGFloat = 10
  @State private var width: CGFloat = 0
  /// The weekdays' column as drawn: the web's `1.75rem`, or the longest name at large text sizes.
  @State private var days: CGFloat = 28

  var body: some View {
    let cell = max((width - CELL_GAP * 23) / 24, 1)
    let row = max(cell, nameHeight)
    VStack(alignment: .leading, spacing: Space.s1) {
      HStack(alignment: .top, spacing: 0) {
        VStack(alignment: .leading, spacing: CELL_GAP) {
          ForEach(1...7, id: \.self) { weekday in
            Text(weekdayName(weekday, short: true))
              .textStyle(.px10)
              .foregroundStyle(active?.weekday == weekday ? palette.foreground : palette.mutedForeground)
              .lineLimit(1)
              .fixedSize()
              .frame(height: row, alignment: .leading)
          }
        }
        .frame(minWidth: 28, alignment: .leading)
        .padding(.trailing, Space.s1)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { days = $0 }
        squares(cell: cell, row: row)
          .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
      }
      hours(cell: cell)
    }
    .frame(maxWidth: HEATMAP_MAX_WIDTH, alignment: .leading)
    .accessibilityElement()
    .accessibilityLabel(Str.statsHeatmapTitle)
    .accessibilityValue(accessibilityValue)
    .accessibilityAdjustableAction { direction in
      let lit = litCells
      let at = active.flatMap { now in lit.firstIndex { $0.weekday == now.weekday && $0.hour == now.hour } }
      active = step(at, count: lit.count, forward: direction == .increment).map { lit[$0] }
    }
    .accessibilityChartDescriptor(HeatmapDescriptor(grid: grid))
  }

  /// The squares, a row per weekday, hours across.
  private func squares(cell: CGFloat, row: CGFloat) -> some View {
    let accent = palette.accent
    let empty = palette.foreground.opacity(0.06)
    let mark = palette.foreground
    let held = active
    // At large text sizes a row grows with its name, and its squares grow
    // down with it, as Android's taller cells, rather than float in it.
    return Canvas { context, size in
      for weekday in 1...7 {
        let y = CGFloat(weekday - 1) * (row + CELL_GAP)
        for hour in 0..<24 {
          let rect = CGRect(x: CGFloat(hour) * (cell + CELL_GAP), y: y, width: cell, height: row)
          let path = Path(roundedRect: rect, cornerRadius: CELL_RADIUS, style: .circular)
          let color = grid.intensity(weekday: weekday, hour: hour).map { accent.opacity($0) } ?? empty
          context.fill(path, with: .color(color))
          if held?.weekday == weekday, held?.hour == hour {
            context.stroke(
              Path(roundedRect: rect.insetBy(dx: -1.5, dy: -1.5), cornerRadius: CELL_RADIUS + 1.5, style: .circular),
              with: .color(mark), lineWidth: 1.5)
          }
        }
      }
    }
    .frame(height: row * 7 + CELL_GAP * 6)
    // Hours run the way the language reads, as the web's grid does.
    .flipsForRightToLeftLayoutDirection(true)
    .contentShape(Rectangle())
    .gesture(ChartPress { point in active = point.flatMap { self.cell(at: $0, cell: cell, row: row) } })
  }

  /// The square under `point`, kept on the grid.
  private func cell(at point: CGPoint, cell: CGFloat, row: CGFloat) -> ActivityCell {
    var hour = Int(point.x / (cell + CELL_GAP))
    if direction == .rightToLeft { hour = 23 - hour }
    hour = min(max(hour, 0), 23)
    let weekday = min(max(Int(point.y / (row + CELL_GAP)), 0), 6) + 1
    return ActivityCell(weekday: weekday, hour: hour, watchSeconds: grid.value(weekday: weekday, hour: hour))
  }

  /// Every sixth hour under its column, or every twelfth where the words are big.
  private func hours(cell: CGFloat) -> some View {
    ZStack(alignment: .topLeading) {
      ForEach(activityHourMarks(roomy: !typeSize.isAccessibilitySize), id: \.self) { hour in
        Text(hourName(hour))
          .textStyle(.px10)
          .foregroundStyle(palette.mutedForeground)
          .lineLimit(1)
          .fixedSize()
          .padding(.leading, CGFloat(hour) * (cell + CELL_GAP))
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.leading, days)
    .accessibilityHidden(true)
  }

  /// The squares with any watching, a weekday's in the day's order.
  private var litCells: [ActivityCell] {
    (1...7).flatMap { weekday in
      grid.activeHours(weekday: weekday).map {
        ActivityCell(weekday: weekday, hour: $0, watchSeconds: grid.value(weekday: weekday, hour: $0))
      }
    }
  }

  private var accessibilityValue: String {
    if let active { return "\(heatmapCellName(weekday: active.weekday, hour: active.hour)), \(formatWatchTime(active.watchSeconds))" }
    guard let peak = grid.peak else { return "" }
    return Str.statsHeatmapPeak(weekdayName(peak.weekday, short: false), hourName(peak.hour))
  }
}

/// The heatmap's values for VoiceOver's audio graph and data table: a
/// series per weekday, its watch time by the hour.
private struct HeatmapDescriptor: AXChartDescriptorRepresentable {
  let grid: ActivityGrid

  func makeChartDescriptor() -> AXChartDescriptor {
    let hours = (0..<24).map(hourName)
    let x = AXCategoricalDataAxisDescriptor(title: Str.statsHeatmapTitle, categoryOrder: hours)
    let y = AXNumericDataAxisDescriptor(title: Str.statsWatchTime, range: 0...grid.max, gridlinePositions: []) {
      formatWatchTime($0)
    }
    let series = (1...7).map { weekday in
      AXDataSeriesDescriptor(
        name: weekdayName(weekday, short: false), isContinuous: false,
        dataPoints: (0..<24).map { AXDataPoint(x: hours[$0], y: grid.value(weekday: weekday, hour: $0)) })
    }
    let summary = grid.peak.map { Str.statsHeatmapPeak(weekdayName($0.weekday, short: false), hourName($0.hour)) }
    return AXChartDescriptor(
      title: Str.statsHeatmapTitle, summary: summary, xAxis: x, yAxis: y, additionalAxes: [], series: series)
  }
}

// MARK: Touch

/// A finger held on a chart, where it is on it while it stays down, nil
/// once it lifts. SwiftUI's long press says nothing of where, and its drag
/// would take the page's scrolling, so it's UIKit's long press.
private struct ChartPress: UIGestureRecognizerRepresentable {
  let onChange: (CGPoint?) -> Void

  func makeUIGestureRecognizer(context: Context) -> UILongPressGestureRecognizer {
    let press = UILongPressGestureRecognizer()
    press.minimumPressDuration = 0.2
    return press
  }

  func handleUIGestureRecognizerAction(_ press: UILongPressGestureRecognizer, context: Context) {
    switch press.state {
    case .began, .changed: onChange(context.converter.localLocation)
    default: onChange(nil)
    }
  }
}
