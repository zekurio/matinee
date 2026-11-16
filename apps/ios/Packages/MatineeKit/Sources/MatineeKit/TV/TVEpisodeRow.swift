#if os(tvOS)
  import SwiftUI

  /// The sizes of a season's list of `TVEpisodeRow`s.
  public enum TVEpisodeRows {
    /// The still's width, 16:9: a landscape card's, so a season's list and
    /// a row of its episodes show the same picture.
    public static let stillWidth: CGFloat = TVCards.landscapeWidth
    /// Between the still and the text beside it.
    public static let textGap: CGFloat = 48
    /// Between one episode and the next, room for the focused still's lift included.
    public static let gap: CGFloat = 48
    /// How wide the text beside the still runs at most, so an overview reads in lines of a comfortable length.
    public static let textWidth: CGFloat = 1040
  }

  /// One episode in a season's list, as Android TV's season page and the
  /// web's episode list show them: its 16:9 still at the leading edge, with
  /// how far in the person is along its bottom or the watched dot, and
  /// beside it `marker` in the accent (Next up, Continue watching), its
  /// `number` and `name`, its `facts` (air date, length, time left), and two
  /// lines of its `overview`. Only the still takes focus, and lifts; the
  /// text beside it brightens with it, so the row reads as one. Select runs
  /// `action`, a long press `onLongPress`, and Play/Pause `onPlayPause`, as
  /// on the other cards.
  ///
  ///     TVEpisodeRow("Pilot", number: "1", marker: "Next up", facts: ["Jan 20, 2008", "58 min"],
  ///       overview: overview, progress: 0.4, action: { open(episode) }) { still }
  public struct TVEpisodeRow<Art: View>: View {
    let name: String
    let number: String?
    let marker: String?
    let facts: [String]
    let overview: String?
    let progress: Double?
    let watched: Bool
    let stillWidth: CGFloat
    let action: () -> Void
    let onLongPress: (() -> Void)?
    let onPlayPause: (() -> Void)?
    @ViewBuilder let art: () -> Art
    @FocusState private var focused: Bool
    @Environment(\.palette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// `number` is how the episode is numbered in its season, "4", set
    /// before the name; leave it out for one whose name is its number.
    public init(
      _ name: String, number: String? = nil, marker: String? = nil, facts: [String] = [], overview: String? = nil,
      progress: Double? = nil, watched: Bool = false, stillWidth: CGFloat = TVEpisodeRows.stillWidth,
      action: @escaping () -> Void, onLongPress: (() -> Void)? = nil, onPlayPause: (() -> Void)? = nil,
      @ViewBuilder art: @escaping () -> Art
    ) {
      self.name = name
      self.number = number
      self.marker = marker
      self.facts = facts
      self.overview = overview
      self.progress = progress
      self.watched = watched
      self.stillWidth = stillWidth
      self.action = action
      self.onLongPress = onLongPress
      self.onPlayPause = onPlayPause
      self.art = art
    }

    public var body: some View {
      HStack(alignment: .top, spacing: TVEpisodeRows.textGap) {
        TVArtCard(
          toneKey: name, aspect: 16 / 9, label: spoken, action: action, onLongPress: onLongPress,
          onPlayPause: onPlayPause
        ) {
          ZStack(alignment: .bottom) {
            art()
            if watched {
              TVWatchedMark().padding(16).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            } else if let progress, progress > 0 {
              TVProgress(progress).padding(20)
            }
          }
        }
        .focused($focused)
        .frame(width: stillWidth)
        text
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var text: some View {
      VStack(alignment: .leading, spacing: 0) {
        if let marker {
          Text(marker).textStyle(.caption, weight: .semibold).foregroundStyle(palette.accent).lineLimit(1)
            .padding(.bottom, 4)
        }
        HStack(alignment: .firstTextBaseline, spacing: 20) {
          if let number {
            Text(number).textStyle(.title).monospacedDigit().foregroundStyle(palette.mutedForeground)
          }
          Text(name).textStyle(.title).foregroundStyle(palette.foreground).lineLimit(1)
        }
        if !facts.isEmpty {
          Text(facts.joined(separator: "  ·  ")).textStyle(.caption).monospacedDigit()
            .foregroundStyle(palette.mutedForeground).lineLimit(1)
            .padding(.top, 4)
        }
        if let overview {
          Text(overview).textStyle(.body).foregroundStyle(palette.foreground.opacity(focused ? 0.85 : 0.6))
            .lineLimit(2)
            .padding(.top, 12)
        }
      }
      // The text sits a little lower than the still's top, level with the still once it lifts.
      .padding(.top, 8)
      .frame(maxWidth: TVEpisodeRows.textWidth, alignment: .leading)
      .opacity(focused ? 1 : 0.8)
      .animation(Motion.animation(focused ? Motion.enter : Motion.exit, reduceMotion: reduceMotion), value: focused)
      .accessibilityHidden(true)
    }

    /// What VoiceOver says for the still: the marker, the number and name, and the facts.
    private var spoken: String {
      ([marker, [number, name].compactMap { $0 }.joined(separator: " ")] + facts).compactMap { $0 }
        .joined(separator: ", ")
    }
  }

  extension TVEpisodeRow where Art == TVPicture {
    /// An episode with its still loaded from `url`.
    public init(
      _ name: String, number: String? = nil, marker: String? = nil, facts: [String] = [], overview: String? = nil,
      progress: Double? = nil, watched: Bool = false, url: URL?, stillWidth: CGFloat = TVEpisodeRows.stillWidth,
      action: @escaping () -> Void, onLongPress: (() -> Void)? = nil, onPlayPause: (() -> Void)? = nil
    ) {
      self.init(
        name, number: number, marker: marker, facts: facts, overview: overview, progress: progress, watched: watched,
        stillWidth: stillWidth, action: action, onLongPress: onLongPress, onPlayPause: onPlayPause
      ) { TVPicture(url) }
    }
  }
#endif
