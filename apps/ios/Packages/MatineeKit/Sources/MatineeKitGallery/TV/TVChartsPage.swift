#if os(tvOS)
  @_spi(Gallery) import MatineeKit
  import SwiftUI

  /// The charts read with the remote, each piece taking focus and named
  /// above as it does, and the full-screen reader for a long text.
  struct TVChartsPage: View {
    @Environment(TVGallerySettings.self) private var settings
    @State private var memory = TVFocusMemory()
    @State private var bar: Int?
    @State private var cell: TVHeatmapCell?
    @State private var reading = false

    private let hours: [Double] = [0.4, 1.2, 0, 2.6, 0.8, 3.4, 2.1, 0.2, 0, 1.6, 2.9, 3.8, 1.1, 0.5]

    var body: some View {
      TVGalleryPage(settings.t("Charts and the reader", "Diagramme und Leser")) {
        TVDemo(
          settings.t("Bars", "Balken"),
          note: settings.t(
            "Every bar takes focus: move across them and the caption names the focused one. The rest dim; Up or Down leaves the chart as it would a row.",
            "Jeder Balken nimmt den Fokus: Beim Bewegen nennt die Beschriftung den fokussierten. Die übrigen werden matter; Hoch oder Runter verlässt das Diagramm wie eine Reihe.")
        ) {
          VStack(alignment: .leading, spacing: TVSpace.s3) {
            TVCaption(bar.map { day($0) } ?? settings.t("Two weeks", "Zwei Wochen"))
            Text(hoursText(bar.map { hours[$0] } ?? hours.reduce(0, +))).textStyle(.display)
            TVBarChart(
              hours, top: 4, scale: ["4h", "2h"], start: day(0), end: day(hours.count - 1), memory: memory,
              key: "bars", first: hours.count - 1, selection: $bar
            ) { "\(day($0)), \(hoursText(hours[$0]))" }
            .frame(maxWidth: 1400)
          }
        }
        TVDemo(
          settings.t("Heatmap", "Heatmap"),
          note: settings.t(
            "Every square takes focus, and its row's and column's names light.",
            "Jedes Quadrat nimmt den Fokus, und die Namen seiner Zeile und Spalte leuchten auf.")
        ) {
          VStack(alignment: .leading, spacing: TVSpace.s3) {
            TVCaption(cell.map { "\(weekdays[$0.row]), \($0.column):00" } ?? settings.t("Most often Friday evenings", "Am häufigsten freitagabends"))
            TVHeatmap(
              rows: weekdays, columns: 24, intensity: strength,
              columnLabels: stride(from: 0, to: 24, by: 3).map { ($0, "\($0):00") }, memory: memory, key: "heatmap",
              first: TVHeatmapCell(row: 4, column: 20), selection: $cell
            ) { "\(weekdays[$0.row]), \($0.column):00" }
            .frame(maxWidth: 1400)
          }
        }
        TVDemo(
          settings.t("Reader", "Leser"),
          note: settings.t(
            "A long text over the whole screen, as a playback report or the app log. Up and Down turn it, Menu closes it.",
            "Ein langer Text über den ganzen Bildschirm, wie ein Wiedergabebericht oder das App-Protokoll. Hoch und Runter blättern, Menü schließt.")
        ) {
          TVButton(settings.t("Open the reader", "Leser öffnen"), icon: .list) { reading = true }
        }
      }
      .tvReader(isPresented: $reading, title: settings.t("App log", "App-Protokoll"), text: sample, fromEnd: true)
    }

    private var weekdays: [String] {
      settings.german ? ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    }

    private func day(_ index: Int) -> String { settings.t("Nov \(index + 3)", "\(index + 3). Nov.") }

    private func hoursText(_ value: Double) -> String {
      let minutes = Int((value * 60).rounded())
      return minutes >= 60 ? "\(minutes / 60)h \(minutes % 60)m" : "\(minutes)m"
    }

    private func strength(_ cell: TVHeatmapCell) -> Double? {
      let evening = cell.column >= 18 && cell.column <= 23
      let weekend = cell.row >= 5 && cell.column >= 12
      guard evening || weekend else { return nil }
      return 0.3 + Double((cell.row * 7 + cell.column * 3) % 7) / 10
    }

    private var sample: String {
      (0..<120).map { "2026-11-16T12:\(String(format: "%02d", $0 / 2)):\(String(format: "%02d", ($0 * 7) % 60))Z player: line \($0 + 1)" }
        .joined(separator: "\n")
    }
  }
#endif
