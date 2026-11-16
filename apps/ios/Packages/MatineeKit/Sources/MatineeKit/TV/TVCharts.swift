#if os(tvOS)
  import SwiftUI

  /*
   * Charts on a TV, read with the remote: Android TV's TvCharts.kt, drawn
   * as the phone's (watch-chart.tsx, bucket-bars.tsx, activity-heatmap.tsx)
   * at the TV's size. They take plain values, the bars' heights and the
   * squares' strengths already worked out, and the words to show.
   *
   * Android TV makes each chart one focus stop and moves a mark across it
   * with the arrows. Here every bar and every square takes focus itself,
   * so the focus engine moves across them as across any row: a click on
   * the remote's ring and a swipe on its surface both step, a move past a
   * chart's edge leaves it as it would leave a row, and VoiceOver reads
   * each one. The focused one is the mark: the text color, as a focused
   * control fills with it, and the rest dim. A chart is a row of the
   * page's `TVFocusMemory`, so focus coming back lands where it left.
   */

  /// The measures of the TV's charts: Android TV's at two points a dp.
  public enum TVCharts {
    /// How tall the bars can grow.
    public static let barsHeight: CGFloat = 320
    /// Beside the bars, for the scale's figures.
    public static let scaleWidth: CGFloat = 176
    /// Each bar's share of its slot, the rest the gap: the web's `w-2/3`.
    public static let barShare: CGFloat = 2 / 3
    /// A bar's rounded top.
    public static let barRadius: CGFloat = 8
    /// The least a bar with anything in it shows.
    public static let barMinimum: CGFloat = 6
    /// How faint the bars not focused go while one is: the web's `opacity-40`.
    public static let dimmed: Double = 0.4
    /// A square of the heatmap, the room between them, and their corners.
    public static let cellHeight: CGFloat = 48
    public static let cellGap: CGFloat = 8
    public static let cellRadius: CGFloat = 8
    /// Beside the squares, for the rows' names.
    public static let rowLabelWidth: CGFloat = 128
  }

  /// Bars on a baseline, one per value, as a range's watch time per day,
  /// week, or month: `values` against `top`, the scale's top, with lines at
  /// the top, the middle, and the base, `scale` naming the top and the
  /// middle at their end, and `start` and `end` under the first and last
  /// bars. Each bar takes focus; the one focused goes to `selection`, nil
  /// while focus is elsewhere, for the page to read it out above. `label`
  /// is what VoiceOver says for a bar.
  ///
  /// It's a row of `memory` under `key`, focus starting on `first` the
  /// first time it comes in.
  ///
  ///     TVBarChart(seconds, top: top, scale: ["2h", "1h"], start: "Nov 3", end: "Nov 9",
  ///       memory: memory, key: "watchTime", first: seconds.count - 1, selection: $picked) { "\(names[$0]), \(times[$0])" }
  public struct TVBarChart: View {
    let values: [Double]
    let top: Double
    let scale: [String]
    let start: String?
    let end: String?
    let memory: TVFocusMemory
    let key: String
    let first: Int?
    @Binding var selection: Int?
    let label: (Int) -> String
    @FocusState private var focused: String?
    @Environment(\.palette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(
      _ values: [Double], top: Double, scale: [String], start: String?, end: String?, memory: TVFocusMemory,
      key: String, first: Int?, selection: Binding<Int?>, label: @escaping (Int) -> String
    ) {
      self.values = values
      self.top = top
      self.scale = scale
      self.start = start
      self.end = end
      self.memory = memory
      self.key = key
      self.first = first
      _selection = selection
      self.label = label
    }

    public var body: some View {
      VStack(alignment: .leading, spacing: TVSpace.s3) {
        HStack(alignment: .top, spacing: TVSpace.s6) {
          bars
          // The scale's figures, each just under its line.
          ZStack(alignment: .topLeading) {
            ForEach(Array(scale.prefix(2).enumerated()), id: \.offset) { index, text in
              Text(text).textStyle(.caption).foregroundStyle(palette.mutedForeground).lineLimit(1)
                .padding(.top, CGFloat(index) * TVCharts.barsHeight / 2 + 4)
            }
          }
          .frame(width: TVCharts.scaleWidth - TVSpace.s6, height: TVCharts.barsHeight, alignment: .topLeading)
          .accessibilityHidden(true)
        }
        HStack(spacing: TVSpace.s3) {
          if let start { Text(start).lineLimit(1) }
          Spacer(minLength: 0)
          if let end, values.count > 1 { Text(end).lineLimit(1) }
        }
        .textStyle(.caption)
        .foregroundStyle(palette.mutedForeground)
        .padding(.trailing, TVCharts.scaleWidth)
        .accessibilityHidden(true)
      }
      .tvFocusRow(key, memory: memory, focused: $focused, first: first.map(String.init))
      .onChange(of: focused) { _, now in selection = now.flatMap(Int.init) }
      .animation(Motion.animation(Motion.color, reduceMotion: reduceMotion), value: focused)
    }

    private var bars: some View {
      GeometryReader { proxy in
        let count = max(values.count, 1)
        let slot = proxy.size.width / CGFloat(count)
        let width = max(slot * TVCharts.barShare, 2)
        let picked = focused.flatMap(Int.init)
        HStack(spacing: 0) {
          ForEach(values.indices, id: \.self) { index in
            Button {} label: {
              BarFace(
                height: Self.height(values[index], top: top), width: width, slot: slot,
                state: picked == nil ? .rest : picked == index ? .marked : .dimmed)
            }
            .buttonStyle(ChartPieceStyle())
            .focused($focused, equals: String(index))
            .accessibilityLabel(label(index))
          }
        }
        .background { lines }
      }
      .frame(height: TVCharts.barsHeight)
    }

    /// The top, the middle, and the base, as the scale names them.
    private var lines: some View {
      VStack(spacing: 0) {
        Rectangle().fill(palette.border).frame(height: 2)
        Spacer(minLength: 0)
        Rectangle().fill(palette.border).frame(height: 2)
        Spacer(minLength: 0)
        Rectangle().fill(palette.border).frame(height: 2)
      }
      .accessibilityHidden(true)
    }

    private static func height(_ value: Double, top: Double) -> CGFloat {
      guard value > 0, top > 0 else { return 0 }
      return max(CGFloat(value / top) * TVCharts.barsHeight, TVCharts.barMinimum)
    }
  }

  private enum PieceState { case rest, marked, dimmed }

  /// One bar in its slot: the slot lit faintly while it has focus, so a
  /// day with nothing in it shows it's the one, and the bar in the text
  /// color; the accent otherwise, dimmed while another has focus.
  private struct BarFace: View {
    let height: CGFloat
    let width: CGFloat
    let slot: CGFloat
    let state: PieceState
    @Environment(\.palette) private var palette

    var body: some View {
      ZStack(alignment: .bottom) {
        RoundedRectangle.kit(min(TVRadius.sm, slot / 2))
          .fill(palette.foreground.opacity(state == .marked ? 0.1 : 0))
        UnevenRoundedRectangle(
          topLeadingRadius: min(TVCharts.barRadius, width / 2), bottomLeadingRadius: 0, bottomTrailingRadius: 0,
          topTrailingRadius: min(TVCharts.barRadius, width / 2), style: .circular
        )
        .fill(state == .marked ? palette.foreground : palette.accent)
        .opacity(state == .dimmed ? TVCharts.dimmed : 1)
        .frame(width: width, height: height)
      }
      .frame(width: slot)
      .frame(maxHeight: .infinity)
      .contentShape(Rectangle())
    }
  }

  /// A bar or a square as the focus target, drawn by its face alone: no
  /// fill or growth of a control's, as the face draws the mark itself.
  private struct ChartPieceStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { configuration.label }
  }

  /// A cell of a `TVHeatmap`: its row and its column.
  public struct TVHeatmapCell: Hashable, Sendable {
    public let row: Int
    public let column: Int

    public init(row: Int, column: Int) {
      self.row = row
      self.column = column
    }

    var key: String { "\(row):\(column)" }

    init?(key: String) {
      let parts = key.split(separator: ":").compactMap { Int($0) }
      guard parts.count == 2 else { return nil }
      self.init(row: parts[0], column: parts[1])
    }
  }

  /// A grid of squares, as when in the week watching starts: a row per
  /// name in `rows`, `columns` squares across, each the accent at the
  /// strength `intensity` gives (0 to 1), or the faint square for nil.
  /// `columnLabels` go under the columns they name, as every third hour.
  /// Each square takes focus; the one focused goes to `selection`, and its
  /// row's name lights. `label` is what VoiceOver says for a square.
  ///
  /// It's a row of `memory` under `key`, focus starting on `first`.
  public struct TVHeatmap: View {
    let rows: [String]
    let columns: Int
    let intensity: (TVHeatmapCell) -> Double?
    let columnLabels: [(column: Int, text: String)]
    let memory: TVFocusMemory
    let key: String
    let first: TVHeatmapCell?
    @Binding var selection: TVHeatmapCell?
    let label: (TVHeatmapCell) -> String
    @FocusState private var focused: String?
    @Environment(\.palette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(
      rows: [String], columns: Int, intensity: @escaping (TVHeatmapCell) -> Double?,
      columnLabels: [(column: Int, text: String)], memory: TVFocusMemory, key: String, first: TVHeatmapCell?,
      selection: Binding<TVHeatmapCell?>, label: @escaping (TVHeatmapCell) -> String
    ) {
      self.rows = rows
      self.columns = columns
      self.intensity = intensity
      self.columnLabels = columnLabels
      self.memory = memory
      self.key = key
      self.first = first
      _selection = selection
      self.label = label
    }

    public var body: some View {
      let picked = focused.flatMap(TVHeatmapCell.init(key:))
      VStack(alignment: .leading, spacing: TVSpace.s3) {
        HStack(alignment: .top, spacing: 0) {
          VStack(alignment: .leading, spacing: TVCharts.cellGap) {
            ForEach(rows.indices, id: \.self) { row in
              Text(rows[row]).textStyle(.caption).lineLimit(1)
                .foregroundStyle(picked?.row == row ? palette.foreground : palette.mutedForeground)
                .frame(height: TVCharts.cellHeight, alignment: .leading)
            }
          }
          .frame(width: TVCharts.rowLabelWidth, alignment: .leading)
          .accessibilityHidden(true)
          VStack(spacing: TVCharts.cellGap) {
            ForEach(rows.indices, id: \.self) { row in
              HStack(spacing: TVCharts.cellGap) {
                ForEach(0..<columns, id: \.self) { column in
                  let cell = TVHeatmapCell(row: row, column: column)
                  Button {} label: {
                    CellFace(strength: intensity(cell), marked: picked == cell)
                  }
                  .buttonStyle(ChartPieceStyle())
                  .focused($focused, equals: cell.key)
                  .accessibilityLabel(label(cell))
                }
              }
            }
          }
        }
        // The columns' names under the squares they name.
        GeometryReader { proxy in
          let width = (proxy.size.width - TVCharts.rowLabelWidth - TVCharts.cellGap * CGFloat(columns - 1))
            / CGFloat(max(columns, 1))
          ZStack(alignment: .topLeading) {
            ForEach(columnLabels, id: \.column) { mark in
              Text(mark.text).textStyle(.caption).lineLimit(1).fixedSize()
                .foregroundStyle(picked?.column == mark.column ? palette.foreground : palette.mutedForeground)
                .padding(.leading, TVCharts.rowLabelWidth + CGFloat(mark.column) * (width + TVCharts.cellGap))
            }
          }
        }
        .frame(height: 40)
        .accessibilityHidden(true)
      }
      .tvFocusRow(key, memory: memory, focused: $focused, first: first?.key)
      .onChange(of: focused) { _, now in selection = now.flatMap(TVHeatmapCell.init(key:)) }
      .animation(Motion.animation(Motion.color, reduceMotion: reduceMotion), value: focused)
    }
  }

  /// A square: the accent at its strength, or faint with nothing in it;
  /// focused, the text color, grown a little over its neighbours.
  private struct CellFace: View {
    let strength: Double?
    let marked: Bool
    @Environment(\.palette) private var palette

    var body: some View {
      RoundedRectangle.kit(TVCharts.cellRadius)
        .fill(marked ? palette.foreground : strength.map { palette.accent.opacity($0) } ?? palette.foreground.opacity(0.06))
        .frame(maxWidth: .infinity)
        .frame(height: TVCharts.cellHeight)
        .scaleEffect(marked ? 1.18 : 1)
        .shadow(color: .black.opacity(marked ? (palette.isDark ? 0.45 : 0.2) : 0), radius: 8, y: 4)
    }
  }
#endif
