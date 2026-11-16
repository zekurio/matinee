#if os(tvOS)
  import MatineeKit
  import SwiftUI

  /// A season's episodes as a list, the way a season's page shows them:
  /// `TVEpisodeRow` watched, in progress and marked as the one Play starts,
  /// up next, with no still yet, and with no overview, in one focus row
  /// that remembers its episode.
  struct TVEpisodesPage: View {
    @Environment(TVGallerySettings.self) private var settings
    @Environment(\.palette) private var palette
    @State private var memory = TVFocusMemory()
    @FocusState private var focused: String?
    @State private var log = ""

    private struct Sample: Identifiable {
      let id: String
      let number: Int
      let en: String
      let de: String
      let minutes: Int
      let progress: Double?
      let watched: Bool
      let still: Bool
      let overview: Bool
    }

    private let samples = [
      Sample(id: "e1", number: 1, en: "The Long Harbour", de: "Der lange Hafen", minutes: 58, progress: nil, watched: true, still: true, overview: true),
      Sample(id: "e2", number: 2, en: "Low Tide", de: "Ebbe", minutes: 47, progress: nil, watched: true, still: true, overview: true),
      Sample(id: "e3", number: 3, en: "Pressure", de: "Druck", minutes: 51, progress: 0.62, watched: false, still: true, overview: true),
      Sample(id: "e4", number: 4, en: "Lanterns", de: "Laternen", minutes: 49, progress: nil, watched: false, still: false, overview: true),
      Sample(id: "e5", number: 5, en: "A Name for the Boat That Runs Rather Longer Than One Line Allows", de: "Ein Name für das Boot, der etwas länger ist, als eine Zeile erlaubt", minutes: 55, progress: nil, watched: false, still: true, overview: false),
    ]

    var body: some View {
      let show = Samples.title("harbour")
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          VStack(alignment: .leading, spacing: 8) {
            Text(settings.t("Episode rows", "Folgenzeilen")).textStyle(.headline)
            Text(
              log.isEmpty
                ? settings.t(
                  "A season's list: watched, in progress and marked as Play's, with no still yet, and with no overview. Only the still takes focus; the text brightens with it.",
                  "Die Liste einer Staffel: gesehen, angefangen und als die von Abspielen markiert, ohne Standbild, ohne Beschreibung. Nur das Standbild nimmt den Fokus, der Text hellt sich mit ihm auf.")
                : log
            )
            .textStyle(.caption).foregroundStyle(palette.mutedForeground)
          }
          .padding(.bottom, TVSpace.s8)
          VStack(alignment: .leading, spacing: TVEpisodeRows.gap) {
            ForEach(samples) { sample in
              let name = settings.t(sample.en, sample.de)
              TVEpisodeRow(
                name, number: "\(sample.number)",
                marker: sample.id == "e3" ? settings.t("Continue watching", "Weiterschauen") : nil,
                facts: [
                  settings.t("Mar \(sample.number + 4), 2024", "\(sample.number + 4). März 2024"),
                  sample.progress != nil
                    ? settings.t("18 min left", "noch 18 Min.") : settings.t("\(sample.minutes) min", "\(sample.minutes) Min."),
                ],
                overview: sample.overview ? show.overview : nil, progress: sample.progress, watched: sample.watched,
                action: { log = "▶ \(name)" }, onLongPress: { log = "⋯ \(name)" }, onPlayPause: { log = "⏯ \(name)" }
              ) {
                if sample.still { WideArt(title: show, variant: sample.number) }
              }
              .focused($focused, equals: sample.id)
            }
          }
          .tvFocusRow("episodes", memory: memory, focused: $focused, first: "e3")
        }
        .padding(.leading, TVPage.start)
        .padding(.trailing, TVPage.end)
        .padding(.vertical, TVOverscan.vertical)
      }
      .scrollClipDisabled()
      .ignoresSafeArea()
      .onAppear { memory.restore(fallback: ("episodes", "e3")) }
    }
  }
#endif
