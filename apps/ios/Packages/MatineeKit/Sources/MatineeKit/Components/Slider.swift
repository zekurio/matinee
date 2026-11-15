import SwiftUI

/*
 * Sliders as the web's: a thin round track, the accent along the chosen
 * part, and white round thumbs ringed in the accent, 20 points as the
 * web's are on a touch screen, with the web's `active:ring-3` halo while
 * held. Drawn by the kit and moved by a drag; VoiceOver adjusts each thumb
 * by a step with a swipe, and a remote moves the focused one left and right.
 */

/// One thumb on a range: `MatineeSlider(value: $size, in: 0.5...2, step: 0.1, label: "Subtitle size")`.
/// `onEditingChanged` says when a drag starts and ends, for work to do once
/// it's let go. `valueText` is what VoiceOver says the value is.
public struct MatineeSlider: View {
  @Binding var value: Double
  let range: ClosedRange<Double>
  let step: Double?
  let label: String
  let valueText: ((Double) -> String)?
  let onEditingChanged: (Bool) -> Void

  public init(
    value: Binding<Double>, in range: ClosedRange<Double>, step: Double? = nil, label: String,
    valueText: ((Double) -> String)? = nil, onEditingChanged: @escaping (Bool) -> Void = { _ in }
  ) {
    self._value = value
    self.range = range
    self.step = step
    self.label = label
    self.valueText = valueText
    self.onEditingChanged = onEditingChanged
  }

  public var body: some View {
    SliderTrack(
      values: [value], range: range, step: step, labels: [label], valueText: valueText,
      onEditingChanged: onEditingChanged
    ) { _, new in value = new }
  }
}

/// Two thumbs on a range, as the web's Slider with two values and Android's
/// `RangeSlider`, for a filter's years or runtime. The thumbs can meet but
/// not cross.
public struct RangeSlider: View {
  @Binding var value: ClosedRange<Double>
  let range: ClosedRange<Double>
  let step: Double?
  let labels: [String]?
  let valueText: ((Double) -> String)?
  let onEditingChanged: (Bool) -> Void
  @Environment(\.locale) private var locale

  /// `labels` names the two thumbs for VoiceOver, "Minimum" and "Maximum" unless given.
  public init(
    value: Binding<ClosedRange<Double>>, in range: ClosedRange<Double>, step: Double? = nil,
    labels: (String, String)? = nil, valueText: ((Double) -> String)? = nil,
    onEditingChanged: @escaping (Bool) -> Void = { _ in }
  ) {
    self._value = value
    self.range = range
    self.step = step
    self.labels = labels.map { [$0.0, $0.1] }
    self.valueText = valueText
    self.onEditingChanged = onEditingChanged
  }

  public var body: some View {
    SliderTrack(
      values: [value.lowerBound, value.upperBound], range: range, step: step,
      labels: labels ?? [KitText.rangeStart(locale), KitText.rangeEnd(locale)], valueText: valueText,
      onEditingChanged: onEditingChanged
    ) { index, new in
      value = index == 0 ? min(new, value.upperBound)...value.upperBound : value.lowerBound...max(new, value.lowerBound)
    }
  }
}

private struct SliderTrack: View {
  let values: [Double]
  let range: ClosedRange<Double>
  let step: Double?
  let labels: [String]
  let valueText: ((Double) -> String)?
  let onEditingChanged: (Bool) -> Void
  let set: (Int, Double) -> Void

  @Environment(\.palette) private var palette
  @Environment(\.isEnabled) private var enabled
  @Environment(\.layoutDirection) private var direction
  @Environment(\.forcedInteraction) private var forced
  @State private var dragging: Int?
  @FocusState private var focusedThumb: Int?

  private let thumb: CGFloat = 20
  private let trackHeight: CGFloat = 4

  var body: some View {
    GeometryReader { proxy in
      let width = proxy.size.width
      let usable = max(1, width - thumb)
      let fractions = values.map(fraction)
      ZStack(alignment: .leading) {
        Capsule().fill(palette.muted).frame(height: trackHeight)
        // The chosen part: from the start, or between two thumbs.
        let from = values.count == 1 ? 0 : fractions[0]
        let to = fractions.last ?? 0
        Capsule().fill(palette.accent)
          .frame(width: max(0, (to - from) * usable + (values.count == 1 ? thumb / 2 : 0)), height: trackHeight)
          .padding(.leading, values.count == 1 ? 0 : from * usable + thumb / 2)
        ForEach(values.indices, id: \.self) { index in
          thumbView(index)
            .padding(.leading, fractions[index] * usable)
        }
      }
      .frame(maxHeight: .infinity)
      .contentShape(Rectangle())
      #if os(iOS)
        .gesture(drag(width: width, usable: usable))
      #endif
    }
    .frame(height: TouchTarget)
    .opacity(enabled ? 1 : 0.5)
  }

  private func thumbView(_ index: Int) -> some View {
    let held = dragging == index || forced == .pressed
    let focused = focusedThumb == index || (forced == .focused && index == 0)
    return Circle()
      .fill(Color.white)
      .overlay { Circle().strokeBorder(palette.ring, lineWidth: 1) }
      .frame(width: thumb, height: thumb)
      .background {
        // `ring-3 ring-ring/50` while held or focused.
        if held || focused { Circle().inset(by: -3).fill(palette.ring.opacity(0.5)) }
      }
      .kitShadow(.small)
      .motion(Motion.color, value: held || focused)
      .focusable()
      .focused($focusedThumb, equals: index)
      #if os(tvOS)
        .onMoveCommand { direction in
          switch direction {
          case .left: nudge(index, by: -1)
          case .right: nudge(index, by: 1)
          default: break
          }
        }
      #endif
      .accessibilityElement()
      .accessibilityLabel(labels[min(index, labels.count - 1)])
      .accessibilityValue(valueText?(values[index]) ?? values[index].formatted(.number.precision(.fractionLength(0...2))))
      .accessibilityAdjustableAction { direction in
        switch direction {
        case .increment: nudge(index, by: 1)
        case .decrement: nudge(index, by: -1)
        @unknown default: break
        }
      }
  }

  private func fraction(_ value: Double) -> CGFloat {
    let span = range.upperBound - range.lowerBound
    guard span > 0 else { return 0 }
    return CGFloat(min(max((value - range.lowerBound) / span, 0), 1))
  }

  private func snapped(_ value: Double) -> Double {
    var value = min(max(value, range.lowerBound), range.upperBound)
    if let step, step > 0 {
      value = range.lowerBound + ((value - range.lowerBound) / step).rounded() * step
      value = min(value, range.upperBound)
    }
    return value
  }

  private func nudge(_ index: Int, by steps: Double) {
    let increment = step ?? (range.upperBound - range.lowerBound) / 20
    set(index, snapped(values[index] + increment * steps))
  }

  #if os(iOS)
    private func drag(width: CGFloat, usable: CGFloat) -> some Gesture {
      DragGesture(minimumDistance: 0)
        .onChanged { gesture in
          guard enabled else { return }
          // The gesture's coordinates run left to right whatever the layout direction.
          var x = (gesture.location.x - thumb / 2) / usable
          if direction == .rightToLeft { x = 1 - x }
          let value = snapped(range.lowerBound + Double(min(max(x, 0), 1)) * (range.upperBound - range.lowerBound))
          if dragging == nil {
            // The thumb nearest where the finger went down; of two together, the one it moves toward.
            let start = values.map { abs(fraction($0) - x) }
            let nearest = start.indices.min { start[$0] < start[$1] } ?? 0
            let tied = values.count == 2 && abs(start[0] - start[1]) < 0.001
            dragging = tied ? (x > fraction(values[0]) ? 1 : 0) : nearest
            onEditingChanged(true)
          }
          if let dragging { set(dragging, value) }
        }
        .onEnded { _ in
          if dragging != nil { onEditingChanged(false) }
          dragging = nil
        }
    }
  #endif
}
