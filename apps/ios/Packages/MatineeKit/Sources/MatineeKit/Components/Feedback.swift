import SwiftUI

/// Something loading, as the web's Spinner: lucide's loader circle turning
/// once a second (`animate-spin`), in the foreground style unless `tint`
/// says otherwise. VoiceOver reads "Loading". It keeps turning under
/// Reduce Motion, as the web's does: a still one would read as stuck.
public struct Spinner: View {
  let size: CGFloat
  let tint: Color?
  @Environment(\.locale) private var locale

  public init(size: CGFloat = 16, tint: Color? = nil) {
    self.size = size
    self.tint = tint
  }

  public var body: some View {
    TimelineView(.animation) { context in
      let turn = context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1)
      LucideIcon(.loaderCircle, size: size, tint: tint, scales: false)
        .rotationEffect(.degrees(turn * 360))
    }
    .frame(width: size, height: size)
    .accessibilityElement()
    .accessibilityLabel(KitText.loading(locale))
    .accessibilityAddTraits(.updatesFrequently)
  }
}

/// A ring that fills clockwise in the accent, for how much of something is
/// done, as the web's catalog card draws it: a 24-unit box, a 9-unit radius,
/// and a 2.5 stroke over a faint track. With `progress` nil it's dotted: on
/// its way, nothing to count yet.
public struct ProgressRing: View {
  let progress: Double?
  let size: CGFloat
  @Environment(\.palette) private var palette

  public init(_ progress: Double?, size: CGFloat = 20) {
    self.progress = progress
    self.size = size
  }

  public var body: some View {
    let stroke = size * 2.5 / 24
    let inset = size * 3 / 24
    let shown = min(max(progress ?? 0, 0), 1)
    ZStack {
      Circle().inset(by: inset).stroke(palette.foreground.opacity(0.2), lineWidth: stroke)
      if progress == nil {
        let circumference = Double.pi * (size - 2 * inset)
        Circle().inset(by: inset)
          .stroke(
            palette.accent,
            style: StrokeStyle(lineWidth: stroke, lineCap: .round, dash: [0.1, circumference / 12]))
      } else {
        Circle().inset(by: inset)
          .trim(from: 0, to: shown)
          .stroke(palette.accent, style: StrokeStyle(lineWidth: stroke, lineCap: .round))
          .rotationEffect(.degrees(-90))
          .motion(.easeOut(duration: 0.7), value: shown)
      }
    }
    .frame(width: size, height: size)
    .accessibilityElement()
    .accessibilityValue(progress.map { Text($0, format: .percent.precision(.fractionLength(0))) } ?? Text(verbatim: ""))
  }
}

/// How far along something is, as a bar: the accent on a track, round at
/// both ends. Over a picture, as a card's watched progress, give it the
/// dark `track` the web's cards use; the banner's is the text's color on a
/// faint one, `fill:`.
public struct ProgressBar: View {
  let value: Double
  let height: CGFloat
  let track: Color?
  let fill: Color?
  @Environment(\.palette) private var palette

  public init(_ value: Double, height: CGFloat = 4, track: Color? = nil, fill: Color? = nil) {
    self.value = value
    self.height = height
    self.track = track
    self.fill = fill
  }

  public var body: some View {
    let shown = min(max(value, 0), 1)
    Capsule()
      .fill(track ?? palette.muted)
      .overlay(alignment: .leading) {
        GeometryReader { proxy in
          Capsule().fill(fill ?? palette.accent).frame(width: max(height, proxy.size.width * shown))
            .opacity(shown > 0 ? 1 : 0)
        }
      }
      .clipShape(Capsule())
      .frame(height: height)
      .accessibilityElement()
      .accessibilityValue(Text(shown, format: .percent.precision(.fractionLength(0))))
  }
}

/// A placeholder in the shape of what's loading, as the web's Skeleton:
/// `rounded-md bg-muted`, pulsing. Still under Reduce Motion.
public struct Skeleton<S: Shape>: View {
  let shape: S
  @Environment(\.palette) private var palette
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  public init(shape: S) { self.shape = shape }

  public var body: some View {
    TimelineView(.animation(paused: reduceMotion)) { context in
      // Tailwind's animate-pulse: 2s, opacity 1 → 0.5 → 1, eased.
      let phase = context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 2) / 2
      let pulse = reduceMotion ? 1 : 0.75 + 0.25 * cos(phase * 2 * .pi)
      shape.fill(palette.muted).opacity(pulse)
    }
    .accessibilityHidden(true)
  }
}

extension Skeleton where S == RoundedRectangle {
  /// `rounded-md`, the web's default.
  public init(radius: CGFloat = Radius.md) { self.init(shape: .kit(radius)) }
}
