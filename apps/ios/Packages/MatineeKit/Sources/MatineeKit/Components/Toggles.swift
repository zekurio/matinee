import SwiftUI

/// An on and off switch in the web's look: the accent when on and
/// `--input-hover` when off, with a thumb that slides across. Larger than
/// the web's 36 by 20, a 44 by 24 track with a 20-point thumb, as
/// Android's, since a finger reads and hits it rather than a pointer; it
/// takes 44 points to hit. `label` is what VoiceOver reads; a `SwitchRow`
/// shows its own.
public struct Switch: View {
  @Binding var isOn: Bool
  let label: String

  public init(isOn: Binding<Bool>, label: String) {
    self._isOn = isOn
    self.label = label
  }

  public var body: some View {
    Toggle(isOn: $isOn) { Text(label) }
      .toggleStyle(SwitchStyle())
  }
}

struct SwitchStyle: ToggleStyle {
  func makeBody(configuration: Configuration) -> some View {
    Button {
      withMotion(Motion.enter) { configuration.isOn.toggle() }
    } label: {
      SwitchTrack(isOn: configuration.isOn)
    }
    .buttonStyle(KitPressStyle(shape: Capsule(), hitInset: 10))
    .accessibilityRepresentation {
      Toggle(isOn: configuration.$isOn) { configuration.label }
    }
  }
}

/// The track and thumb alone, for a row that toggles itself.
struct SwitchTrack: View {
  let isOn: Bool
  @Environment(\.palette) private var palette
  private let width: CGFloat = 44
  private let height: CGFloat = 24
  private let thumb: CGFloat = 20

  var body: some View {
    Capsule()
      .fill(isOn ? palette.accent : palette.inputHover)
      .frame(width: width, height: height)
      .overlay(alignment: isOn ? .trailing : .leading) {
        Circle()
          .fill(isOn ? palette.accentForeground : palette.foreground)
          .frame(width: thumb, height: thumb)
          .padding(2)
      }
      .motion(Motion.enter, value: isOn)
  }
}

/// A square box that ticks, as the web's Checkbox: 18 points,
/// `rounded-[5px]`, an `--input-hover` border, and the accent with a check
/// in it once checked. `indeterminate` draws a dash, for "some of them".
/// It takes 44 points to hit.
public struct Checkbox: View {
  @Binding var isOn: Bool
  let label: String
  let indeterminate: Bool

  public init(isOn: Binding<Bool>, label: String, indeterminate: Bool = false) {
    self._isOn = isOn
    self.label = label
    self.indeterminate = indeterminate
  }

  public var body: some View {
    Toggle(isOn: $isOn) { Text(label) }
      .toggleStyle(CheckboxStyle(indeterminate: indeterminate))
  }
}

struct CheckboxStyle: ToggleStyle {
  var indeterminate = false

  func makeBody(configuration: Configuration) -> some View {
    Button {
      configuration.isOn.toggle()
    } label: {
      CheckboxBox(isOn: configuration.isOn, indeterminate: indeterminate)
    }
    .buttonStyle(KitPressStyle(shape: RoundedRectangle.kit(5), hitInset: 13))
    .accessibilityRepresentation {
      Toggle(isOn: configuration.$isOn) { configuration.label }
    }
  }
}

/// The box alone, for a row that toggles itself.
struct CheckboxBox: View {
  let isOn: Bool
  var indeterminate = false
  @Environment(\.palette) private var palette

  var body: some View {
    let on = isOn || indeterminate
    let shape = RoundedRectangle.kit(5)
    shape
      .fill(on ? palette.accent : .clear)
      .overlay { shape.strokeBorder(on ? palette.accent : palette.inputHover, lineWidth: 1) }
      .overlay {
        if on {
          LucideIcon(indeterminate ? .minus : .checkBold, size: 14, tint: palette.accentForeground, scales: false)
            .transition(.scale(scale: 0.6).combined(with: .opacity))
        }
      }
      .frame(width: 18, height: 18)
      .motion(Motion.color, value: on)
  }
}
