#if os(tvOS)
  import SwiftUI

  /// The measures of the player's seek bar on a TV: Android TV's `TvSeekBar`, at two points a dp.
  public enum TVSeekBars {
    /// The room the track takes, which Select and focus land on.
    public static let height: CGFloat = 56
    /// The track at rest, and focused.
    public static let thickness: CGFloat = 10
    public static let focusedThickness: CGFloat = 16
    /// The head, shown while focused.
    public static let thumb: CGFloat = 44
    /// How wide the trickplay frame over the head is.
    public static let previewWidth: CGFloat = 480
    /// Between the times and the track.
    public static let gap: CGFloat = 32
    /// The room the time over the head takes above the track while focused,
    /// which whatever sits over the bar leaves clear.
    public static let bubbleRoom: CGFloat = 64
  }

  /// The player's seek bar for a remote, as Android TV draws it: the time
  /// played at its start, a track across in the accent over what's
  /// buffered, and the time left at its end. Focused, the track thickens,
  /// its head shows, and `bubble`, the time at the head, floats over it;
  /// while `scrubbing`, `preview`, the trickplay frame there, floats over
  /// that. Select runs `action`, play and pause.
  ///
  /// It only shows where things are: Left, Right, and swipes move the head
  /// through the screen's `TVScrub`, which `fraction` follows, so the
  /// screen decides what the arrows do while it has focus. `widest` is the
  /// longest time the clocks can show, so they keep their width as they count.
  ///
  ///     TVSeekBar(fraction: 0.4, buffered: 0.6, elapsed: "8:40", remaining: "13:20", bubble: "8:40",
  ///       scrubbing: false, label: "Seek", value: "8:40 of 22:00", action: togglePlay) { EmptyView() }
  public struct TVSeekBar<Preview: View>: View {
    let fraction: Double
    let buffered: Double
    let elapsed: String
    let remaining: String
    let bubble: String
    let widest: String?
    let scrubbing: Bool
    let label: String
    let value: String
    let action: () -> Void
    @ViewBuilder let preview: () -> Preview

    public init(
      fraction: Double, buffered: Double, elapsed: String, remaining: String, bubble: String, widest: String? = nil,
      scrubbing: Bool, label: String, value: String, action: @escaping () -> Void,
      @ViewBuilder preview: @escaping () -> Preview
    ) {
      self.fraction = fraction
      self.buffered = buffered
      self.elapsed = elapsed
      self.remaining = remaining
      self.bubble = bubble
      self.widest = widest
      self.scrubbing = scrubbing
      self.label = label
      self.value = value
      self.action = action
      self.preview = preview
    }

    public var body: some View {
      Button(action: action) {
        SeekFace(
          fraction: fraction, buffered: buffered, elapsed: elapsed, remaining: remaining, bubble: bubble,
          widest: widest, scrubbing: scrubbing, preview: preview)
      }
      .buttonStyle(SeekStyle())
      .accessibilityLabel(label)
      .accessibilityValue(value)
    }
  }

  extension TVSeekBar where Preview == EmptyView {
    /// A seek bar with no trickplay frame.
    public init(
      fraction: Double, buffered: Double, elapsed: String, remaining: String, bubble: String, widest: String? = nil,
      scrubbing: Bool, label: String, value: String, action: @escaping () -> Void
    ) {
      self.init(
        fraction: fraction, buffered: buffered, elapsed: elapsed, remaining: remaining, bubble: bubble, widest: widest,
        scrubbing: scrubbing, label: label, value: value, action: action, preview: { EmptyView() })
    }
  }

  private struct SeekStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { SeekBody(configuration: configuration) }
  }

  private struct SeekBody: View {
    let configuration: ButtonStyleConfiguration
    @Environment(\.isFocused) private var focused

    var body: some View {
      configuration.label.environment(\.tvFocused, focused)
    }
  }

  private struct SeekFace<Preview: View>: View {
    let fraction: Double
    let buffered: Double
    let elapsed: String
    let remaining: String
    let bubble: String
    let widest: String?
    let scrubbing: Bool
    @ViewBuilder let preview: () -> Preview
    @Environment(\.tvFocused) private var focused
    @Environment(\.palette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var width: CGFloat = 0
    @State private var bubbleWidth: CGFloat = 0

    var body: some View {
      let played = min(max(fraction, 0), 1)
      let loaded = min(max(buffered, 0), 1)
      HStack(spacing: TVSeekBars.gap) {
        SeekClock(text: elapsed, widest: widest, alignment: .leading)
        ZStack(alignment: .leading) {
          let thickness = focused ? TVSeekBars.focusedThickness : TVSeekBars.thickness
          Capsule().fill(Color.white.opacity(0.25)).frame(height: thickness)
          Capsule().fill(Color.white.opacity(0.45)).frame(width: width * loaded, height: thickness)
          Capsule().fill(palette.accent).frame(width: max(thickness, width * played), height: thickness)
          Circle().fill(palette.foreground)
            .frame(width: TVSeekBars.thumb, height: TVSeekBars.thumb)
            .shadow(color: .black.opacity(0.4), radius: 8, y: 2)
            .scaleEffect(focused ? 1 : 0.01)
            .opacity(focused ? 1 : 0)
            .offset(x: width * played - TVSeekBars.thumb / 2)
        }
        .frame(height: TVSeekBars.height)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .overlay(alignment: .bottomLeading) {
          if focused || scrubbing {
            // Over the head without taking room, kept over the track.
            let x = min(max(width * played - bubbleWidth / 2, 0), max(width - bubbleWidth, 0))
            Bubble(text: bubble, scrubbing: scrubbing, preview: preview)
              .fixedSize()
              .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { bubbleWidth = $0 }
              .offset(x: x, y: -(TVSeekBars.height / 2 + TVSeekBars.thumb / 2 + 8))
              .transition(.opacity)
              .allowsHitTesting(false)
          }
        }
        SeekClock(text: "-" + remaining, widest: widest.map { "-" + $0 }, alignment: .trailing)
          .opacity(0.75)
      }
      .animation(Motion.animation(Motion.color, reduceMotion: reduceMotion), value: focused)
      .animation(Motion.animation(Motion.enter, reduceMotion: reduceMotion), value: scrubbing)
    }
  }

  /// A time beside the track, as wide as the longest it can show, so the track keeps its length as it counts.
  private struct SeekClock: View {
    let text: String
    let widest: String?
    let alignment: Alignment

    var body: some View {
      ZStack(alignment: alignment) {
        if let widest { Text(widest).hidden() }
        Text(text)
      }
      .textStyle(.facts)
      .monospacedDigit()
      .lineLimit(1)
      .fixedSize()
      .shadow(color: .black.opacity(0.6), radius: 5, y: 2)
    }
  }

  /// The time at the head, in the text color as a focused control is, with the trickplay frame above it while scrubbing.
  private struct Bubble<Preview: View>: View {
    let text: String
    let scrubbing: Bool
    @ViewBuilder let preview: () -> Preview
    @Environment(\.palette) private var palette

    var body: some View {
      VStack(spacing: 16) {
        if scrubbing, Preview.self != EmptyView.self {
          preview()
            .clipShape(RoundedRectangle.kit(TVRadius.card))
            .overlay { RoundedRectangle.kit(TVRadius.card).strokeBorder(palette.foreground, lineWidth: 4) }
            .shadow(color: .black.opacity(0.5), radius: 24, y: 8)
        }
        Text(text)
          .textStyle(.facts)
          .monospacedDigit()
          .foregroundStyle(palette.background)
          .padding(.horizontal, 20)
          .padding(.vertical, 4)
          .background(palette.foreground, in: RoundedRectangle.kit(TVRadius.sm * 2))
      }
    }
  }
#endif
