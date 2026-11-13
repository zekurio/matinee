import MatineeCore
import SwiftUI

/*
 * Controls.kt and the controls Android takes from Material, drawn as the
 * web's: buttons, round icon buttons, chips, the watched badge, the
 * progress bar, section titles, avatars, badges, and the segmented control,
 * toggle, and slider settings use.
 */

/// The web's 0.625rem radius.
let ControlShape = RoundedRectangle(cornerRadius: 10, style: .continuous)
let CardShape = RoundedRectangle(cornerRadius: 6, style: .continuous)

/// The page gutter on phones.
let Gutter: CGFloat = 16

/// The smallest a touch target gets, as Apple's guidelines have it.
let MinTouch: CGFloat = 44

enum ButtonLook: CaseIterable {
  case primary, secondary, frosted, outline, ghost
}

/// A button as the web draws one, a `ButtonStyle` so it works on any `Button`:
///
///     Button(action: retry) {
///       LucideIcon(.refreshCw, size: 16)
///       Text(Str.commonRetry)
///     }
///     .buttonStyle(.matinee(.outline))
///
/// Its content sits in a row, 8 apart, in `labelLarge`.
struct MatineeButtonStyle: ButtonStyle {
  var look: ButtonLook = .primary
  var height: CGFloat = 44
  var horizontalPadding: CGFloat = 16

  func makeBody(configuration: Configuration) -> some View {
    Drawn(configuration: configuration, style: self)
  }

  private struct Drawn: View {
    let configuration: Configuration
    let style: MatineeButtonStyle
    @Environment(\.palette) private var palette
    @Environment(\.isEnabled) private var enabled

    var body: some View {
      let (background, foreground) = colors
      HStack(spacing: 8) { configuration.label }
        .textStyle(.labelLarge)
        .lineLimit(1)
        .foregroundStyle(enabled ? foreground : foreground.opacity(0.5))
        .padding(.horizontal, style.horizontalPadding)
        .frame(minHeight: style.height)
        .background(enabled ? background : background.opacity(0.5), in: ControlShape)
        .overlay {
          switch style.look {
          case .outline: ControlShape.strokeBorder(palette.border)
          case .frosted: ControlShape.strokeBorder(palette.foreground.opacity(0.1))
          default: EmptyView()
          }
        }
        .overlay { ControlShape.fill(palette.foreground.opacity(configuration.isPressed ? 0.1 : 0)) }
        .contentShape(ControlShape)
        .frame(minHeight: MinTouch)
        .motion(Motion.color, value: configuration.isPressed)
    }

    private var colors: (Color, Color) {
      switch style.look {
      case .primary: (palette.accent, palette.accentForeground)
      case .secondary: (palette.secondary, palette.foreground)
      case .frosted: (palette.foreground.opacity(0.15), palette.foreground)
      case .outline, .ghost: (.clear, palette.foreground)
      }
    }
  }
}

extension ButtonStyle where Self == MatineeButtonStyle {
  static func matinee(_ look: ButtonLook = .primary, height: CGFloat = 44) -> MatineeButtonStyle {
    MatineeButtonStyle(look: look, height: height)
  }
}

/// Android's `MatineeButton(onClick, look) { … }`, for the common case.
struct MatineeButton<Label: View>: View {
  var look: ButtonLook = .primary
  var height: CGFloat = 44
  let action: () -> Void
  @ViewBuilder let label: () -> Label

  init(
    _ look: ButtonLook = .primary, height: CGFloat = 44, action: @escaping () -> Void,
    @ViewBuilder label: @escaping () -> Label
  ) {
    self.look = look
    self.height = height
    self.action = action
    self.label = label
  }

  var body: some View {
    Button(action: action, label: label).buttonStyle(.matinee(look, height: height))
  }
}

/// A round button with one icon, like the watched and favorite buttons on a
/// title. A circle smaller than 44 points still takes 44 of layout, so its
/// touch target never overlaps a neighbour's.
struct RoundIconButton: View {
  let icon: Lucide
  let label: String
  var size: CGFloat = 44
  var iconSize: CGFloat = 20
  var tint: Color?
  var background: Color?
  let action: () -> Void

  @Environment(\.palette) private var palette

  init(
    _ icon: Lucide, label: String, size: CGFloat = 44, iconSize: CGFloat = 20, tint: Color? = nil,
    background: Color? = nil, action: @escaping () -> Void
  ) {
    self.icon = icon
    self.label = label
    self.size = size
    self.iconSize = iconSize
    self.tint = tint
    self.background = background
    self.action = action
  }

  var body: some View {
    Button(action: action) {
      LucideIcon(icon, size: iconSize, tint: tint ?? palette.foreground)
        .frame(width: size, height: size)
        .background(background ?? palette.secondary, in: Circle())
    }
    .buttonStyle(RoundPress())
    .frame(minWidth: MinTouch, minHeight: MinTouch)
    .contentShape(Rectangle())
    .accessibilityLabel(label)
  }
}

/// A little give when pressed, for buttons with no frame of their own to tint.
struct RoundPress: ButtonStyle {
  @Environment(\.isEnabled) private var enabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .opacity(enabled ? (configuration.isPressed ? 0.6 : 1) : 0.4)
      .scaleEffect(configuration.isPressed ? 0.94 : 1)
      .motion(Motion.color, value: configuration.isPressed)
  }
}

/// A filter or library chip: filled when it's the current one, which
/// VoiceOver reads as selected. One with a `trailingIcon` acts, as removing
/// a filter does, so it's a plain button.
struct Chip: View {
  let label: String
  var selected = false
  var frosted = false
  var trailingIcon: Lucide?
  let action: () -> Void

  @Environment(\.palette) private var palette

  init(
    _ label: String, selected: Bool = false, frosted: Bool = false, trailingIcon: Lucide? = nil,
    action: @escaping () -> Void
  ) {
    self.label = label
    self.selected = selected
    self.frosted = frosted
    self.trailingIcon = trailingIcon
    self.action = action
  }

  var body: some View {
    let color = selected ? palette.background : palette.foreground.opacity(0.75)
    Button(action: action) {
      HStack(spacing: 4) {
        Text(label).textStyle(.labelLarge).lineLimit(1)
        if let trailingIcon { LucideIcon(trailingIcon, size: 14) }
      }
      .foregroundStyle(color)
      .padding(.horizontal, 14)
      .frame(minHeight: 36)
      .background(
        selected ? palette.foreground : frosted ? palette.background.opacity(0.4) : .clear, in: Capsule()
      )
      .overlay { if !selected { Capsule().strokeBorder(palette.foreground.opacity(0.1)) } }
      .contentShape(Capsule())
    }
    .buttonStyle(RoundPress())
    .frame(minHeight: MinTouch)
    .accessibilityAddTraits(trailingIcon == nil && selected ? .isSelected : [])
    .motion(Motion.color, value: selected)
  }
}

/// The round check on something watched, in the accent.
struct WatchedBadge: View {
  var size: CGFloat = 20
  @Environment(\.palette) private var palette

  var body: some View {
    Image(Lucide.check)
      .resizable()
      .frame(width: size * 0.6, height: size * 0.6)
      .foregroundStyle(palette.accentForeground)
      .frame(width: size, height: size)
      .background(palette.accent, in: Circle())
      .accessibilityElement()
      .accessibilityLabel(Str.mediaWatched)
  }
}

/// How far into a file the person is, over its picture, as the web's cards
/// draw it: clear of the edges by `inset`, the accent on a dark track.
struct ProgressBar: View {
  let progress: Double
  var inset: CGFloat = 8
  @Environment(\.palette) private var palette

  var body: some View {
    let value = min(max(progress, 0), 1)
    Capsule()
      .fill(.black.opacity(0.45))
      .overlay(alignment: .leading) {
        GeometryReader { proxy in
          Rectangle().fill(palette.accent).frame(width: proxy.size.width * value)
        }
      }
      .clipShape(Capsule())
      .frame(height: 4)
      .padding([.horizontal, .bottom], inset)
      .accessibilityElement()
      .accessibilityValue(Str.iosProgressWatched(Int((value * 100).rounded())))
  }
}

/// A rail or page section's heading, optionally a link with a chevron.
struct SectionTitle: View {
  let title: String
  var action: (() -> Void)?
  @Environment(\.palette) private var palette

  init(_ title: String, action: (() -> Void)? = nil) {
    self.title = title
    self.action = action
  }

  var body: some View {
    if let action {
      Button(action: action) { heading.contentShape(Rectangle()) }
        .buttonStyle(RoundPress())
        .frame(minHeight: MinTouch)
        .accessibilityAddTraits(.isHeader)
    } else {
      heading.accessibilityAddTraits(.isHeader)
    }
  }

  private var heading: some View {
    HStack(spacing: 4) {
      Text(title).textStyle(.titleLarge).lineLimit(1).foregroundStyle(palette.foreground)
      if action != nil { LucideIcon(.chevronRight, size: 20, tint: palette.muted) }
    }
  }
}

/// A person's picture, or their initials on a neutral circle.
struct Avatar: View {
  let name: String
  let url: String?
  var size: CGFloat = 36
  @Environment(\.palette) private var palette

  init(_ name: String, url: String?, size: CGFloat = 36) {
    self.name = name
    self.url = url
    self.size = size
  }

  var body: some View {
    Circle()
      .fill(palette.secondary)
      .overlay {
        Text(initials(name))
          .font(RedHatText.font(fixedSize: 14 * size / 36, weight: .medium))
          .foregroundStyle(palette.muted)
      }
      .overlay { Picture(url.flatMap { ImageSource($0) }) }
      .clipShape(Circle())
      .frame(width: size, height: size)
      .accessibilityHidden(true)
  }
}

/// A small rounded box with a short fact, like an age rating or "1080p".
struct Badge: View {
  let text: String
  var outlined = false
  @Environment(\.palette) private var palette

  init(_ text: String, outlined: Bool = false) {
    self.text = text
    self.outlined = outlined
  }

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: 4, style: .continuous)
    Text(text)
      .textStyle(.labelMedium)
      .foregroundStyle(palette.foreground.opacity(0.85))
      .lineLimit(1)
      .padding(.horizontal, 6)
      .padding(.vertical, 1)
      .background { if !outlined { shape.fill(palette.foreground.opacity(0.12)) } }
      .overlay { if outlined { shape.strokeBorder(palette.foreground.opacity(0.3)) } }
  }
}

/// A choice of a few, side by side, as the web's tabs draw it: a sunken
/// track with the current one raised on it. For what Android lays out as a
/// row of chips or a picker in a settings row, where the choices are few
/// and short.
struct SegmentedControl<Value: Hashable>: View {
  let options: [(Value, String)]
  @Binding var selection: Value
  @Environment(\.palette) private var palette
  @Namespace private var pill

  init(_ options: [(Value, String)], selection: Binding<Value>) {
    self.options = options
    self._selection = selection
  }

  var body: some View {
    HStack(spacing: 2) {
      ForEach(options, id: \.0) { value, label in
        let selected = value == selection
        Button {
          withMotion(Motion.move) { selection = value }
        } label: {
          Text(label)
            .textStyle(.labelLarge)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .foregroundStyle(selected ? palette.foreground : palette.muted)
            .frame(maxWidth: .infinity, minHeight: 36)
            .padding(.horizontal, 10)
            .background {
              if selected {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                  .fill(palette.background)
                  .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(palette.border) }
                  .shadow(color: .black.opacity(0.12), radius: 2, y: 1)
                  .matchedGeometryEffect(id: "pill", in: pill)
              }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
      }
    }
    .padding(4)
    .frame(minHeight: MinTouch)
    .background(palette.secondary, in: ControlShape)
  }
}

/// iOS's switch in the accent, as Android's in SwitchRow: `.toggleStyle(.matinee)`.
struct MatineeToggleStyle: ToggleStyle {
  @Environment(\.palette) private var palette

  func makeBody(configuration: Configuration) -> some View {
    Toggle(isOn: configuration.$isOn) { configuration.label }
      .toggleStyle(.switch)
      .tint(palette.accent)
  }
}

extension ToggleStyle where Self == MatineeToggleStyle {
  static var matinee: MatineeToggleStyle { MatineeToggleStyle() }
}

/// A slider in the accent on the theme's track, for settings like the
/// subtitle size. It's iOS's own, for its feel and its VoiceOver
/// adjustments, colored to the theme.
struct MatineeSlider<Value: BinaryFloatingPoint>: View where Value.Stride: BinaryFloatingPoint {
  @Binding var value: Value
  let range: ClosedRange<Value>
  var step: Value.Stride?
  let label: String
  @Environment(\.palette) private var palette

  init(_ label: String, value: Binding<Value>, in range: ClosedRange<Value>, step: Value.Stride? = nil) {
    self.label = label
    self._value = value
    self.range = range
    self.step = step
  }

  var body: some View {
    Group {
      if let step {
        Slider(value: $value, in: range, step: step) { Text(label) }
      } else {
        Slider(value: $value, in: range) { Text(label) }
      }
    }
    .tint(palette.accent)
    .frame(minHeight: MinTouch)
  }
}
