import MatineeCore
import MatineeKit
import SwiftUI

/*
 * The controls the screens had before MatineeKit, kept only so the screens
 * not yet rebuilt still build and look as they did. Nothing new uses them:
 * a rebuilt screen uses the kit's control instead (MatineeKit's README has
 * the table), and this folder goes once Matinee/UI/kit-exclusions.txt is
 * empty. Each is named Legacy… so what's left to rebuild is
 * `grep -rn Legacy Matinee/UI`.
 */

enum LegacyButtonLook: CaseIterable {
  case primary, secondary, frosted, outline, ghost
}

/// A button as the web draws one, a `ButtonStyle` so it works on any `Button`:
///
///     Button(action: retry) {
///       LucideIcon(.refreshCw, size: 16)
///       Text(Str.commonRetry)
///     }
///     .buttonStyle(.legacy(.outline))
///
/// Its content sits in a row, 8 apart, in `labelLarge`.
struct LegacyButtonStyle: ButtonStyle {
  var look: LegacyButtonLook = .primary
  var height: CGFloat = 44
  var horizontalPadding: CGFloat = 16

  func makeBody(configuration: Configuration) -> some View {
    Drawn(configuration: configuration, style: self)
  }

  private struct Drawn: View {
    let configuration: Configuration
    let style: LegacyButtonStyle
    @Environment(\.palette) private var palette
    @Environment(\.isEnabled) private var enabled
    @Environment(\.dynamicTypeSize) private var dynamicType

    var body: some View {
      let (background, foreground) = colors
      HStack(spacing: 8) { configuration.label }
        .textStyle(.sm, weight: .medium)
        // One line, as Android's; two at the accessibility sizes rather than cut off.
        .lineLimit(dynamicType.isAccessibilitySize ? 2 : 1)
        .padding(.vertical, dynamicType.isAccessibilitySize ? 6 : 0)
        .foregroundStyle(enabled ? foreground : foreground.opacity(0.5))
        .padding(.horizontal, style.horizontalPadding)
        .frame(minHeight: style.height)
        .background(enabled ? background : background.opacity(0.5), in: RoundedRectangle.kit(Radius.lg))
        .overlay {
          switch style.look {
          case .outline: RoundedRectangle.kit(Radius.lg).strokeBorder(palette.border)
          case .frosted: RoundedRectangle.kit(Radius.lg).strokeBorder(palette.foreground.opacity(0.1))
          default: EmptyView()
          }
        }
        .overlay { RoundedRectangle.kit(Radius.lg).fill(palette.foreground.opacity(configuration.isPressed ? 0.1 : 0)) }
        .contentShape(RoundedRectangle.kit(Radius.lg))
        .frame(minHeight: TouchTarget)
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

extension ButtonStyle where Self == LegacyButtonStyle {
  static func legacy(_ look: LegacyButtonLook = .primary, height: CGFloat = 44) -> LegacyButtonStyle {
    LegacyButtonStyle(look: look, height: height)
  }
}

/// Android's `LegacyButton(onClick, look) { … }`, for the common case.
struct LegacyButton<Label: View>: View {
  var look: LegacyButtonLook = .primary
  var height: CGFloat = 44
  let action: () -> Void
  @ViewBuilder let label: () -> Label

  init(
    _ look: LegacyButtonLook = .primary, height: CGFloat = 44, action: @escaping () -> Void,
    @ViewBuilder label: @escaping () -> Label
  ) {
    self.look = look
    self.height = height
    self.action = action
    self.label = label
  }

  var body: some View {
    Button(action: action, label: label).buttonStyle(.legacy(look, height: height))
  }
}

/// A round button with one icon, like the watched and favorite buttons on a
/// title. A circle smaller than 44 points still takes 44 of layout, so its
/// touch target never overlaps a neighbour's.
struct LegacyRoundIconButton: View {
  let icon: Lucide
  let label: String
  var size: CGFloat = 44
  var iconSize: CGFloat = 20
  var tint: Color?
  var background: Color?
  /// A hairline around the circle, for one floating over a page that may be as dark as it is.
  var border: Color?
  let action: () -> Void

  @Environment(\.palette) private var palette

  init(
    _ icon: Lucide, label: String, size: CGFloat = 44, iconSize: CGFloat = 20, tint: Color? = nil,
    background: Color? = nil, border: Color? = nil, action: @escaping () -> Void
  ) {
    self.icon = icon
    self.label = label
    self.size = size
    self.iconSize = iconSize
    self.tint = tint
    self.background = background
    self.border = border
    self.action = action
  }

  var body: some View {
    Button(action: action) {
      LucideIcon(icon, size: iconSize, tint: tint ?? palette.foreground, scales: false)
        .frame(width: size, height: size)
        .background(background ?? palette.secondary, in: Circle())
        .overlay {
          if let border { Circle().strokeBorder(border) }
        }
    }
    .buttonStyle(LegacyRoundPress())
    .frame(minWidth: TouchTarget, minHeight: TouchTarget)
    .contentShape(Rectangle())
    .accessibilityLabel(label)
    // The circle keeps its size at large text sizes; a long press shows it bigger, with its name.
    .accessibilityShowsLargeContentViewer {
      Image(icon)
      Text(label)
    }
  }
}

/// A little give when pressed, for buttons with no frame of their own to tint.
struct LegacyRoundPress: ButtonStyle {
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
struct LegacyChip: View {
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
        Text(label).textStyle(.sm, weight: .medium).lineLimit(1)
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
    .buttonStyle(LegacyRoundPress())
    .frame(minHeight: TouchTarget)
    .accessibilityAddTraits(trailingIcon == nil && selected ? .isSelected : [])
    .motion(Motion.color, value: selected)
  }
}

/// A small rounded box with a short fact, like an age rating or "1080p".
struct LegacyBadge: View {
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
      .textStyle(.px13, weight: .medium)
      .foregroundStyle(palette.foreground.opacity(0.85))
      .lineLimit(1)
      .fixedSize()
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
struct LegacySegmentedControl<Value: Hashable>: View {
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
            .textStyle(.sm, weight: .medium)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .foregroundStyle(selected ? palette.foreground : palette.mutedForeground)
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
    .frame(minHeight: TouchTarget)
    .background(palette.secondary, in: RoundedRectangle.kit(Radius.lg))
  }
}

/// iOS's switch in the accent, as Android's in SwitchRow: `.toggleStyle(.matinee)`.
struct LegacyToggleStyle: ToggleStyle {
  @Environment(\.palette) private var palette

  func makeBody(configuration: Configuration) -> some View {
    Toggle(isOn: configuration.$isOn) { configuration.label }
      .toggleStyle(.switch)
      .tint(palette.accent)
  }
}

extension ToggleStyle where Self == LegacyToggleStyle {
  static var legacy: LegacyToggleStyle { LegacyToggleStyle() }
}

/// A slider in the accent on the theme's track, for settings like the
/// subtitle size. It's iOS's own, for its feel and its VoiceOver
/// adjustments, colored to the theme.
struct LegacySlider<Value: BinaryFloatingPoint>: View where Value.Stride: BinaryFloatingPoint {
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
    .frame(minHeight: TouchTarget)
  }
}

/// A text field as the web draws one, on Android's terms: lighter than the
/// card it sits on, a quiet border that takes the accent while it has
/// focus, and the danger color for an error. The keyboard, content type,
/// and submit action are SwiftUI's modifiers on it, as on any field.
struct LegacyTextField<Trailing: View>: View {
  @Binding var text: String
  var placeholder: String?
  var leadingIcon: Lucide?
  var isError = false
  var secure = false
  @ViewBuilder var trailing: () -> Trailing

  @Environment(\.palette) private var palette
  @Environment(\.isEnabled) private var enabled
  @FocusState private var focused: Bool

  init(
    _ text: Binding<String>, placeholder: String? = nil, leadingIcon: Lucide? = nil, isError: Bool = false,
    secure: Bool = false, @ViewBuilder trailing: @escaping () -> Trailing
  ) {
    self._text = text
    self.placeholder = placeholder
    self.leadingIcon = leadingIcon
    self.isError = isError
    self.secure = secure
    self.trailing = trailing
  }

  var body: some View {
    HStack(spacing: 10) {
      if let leadingIcon { LucideIcon(leadingIcon, size: 18, tint: palette.mutedForeground) }
      field
        .textStyle(.base)
        .foregroundStyle(palette.foreground)
        .tint(palette.accent)
        .focused($focused)
        .frame(maxWidth: .infinity)
      trailing()
    }
    .padding(.horizontal, 14)
    .frame(minHeight: 52)
    .background(palette.secondary, in: RoundedRectangle.kit(Radius.lg))
    .overlay {
      RoundedRectangle.kit(Radius.lg).strokeBorder(
        isError ? palette.destructive : focused ? palette.accent : palette.input, lineWidth: focused ? 2 : 1)
    }
    .opacity(enabled ? 1 : 0.5)
    .contentShape(RoundedRectangle.kit(Radius.lg))
    .onTapGesture { focused = true }
    .motion(Motion.color, value: focused)
  }

  @ViewBuilder private var field: some View {
    let prompt = placeholder.map { Text($0).foregroundStyle(palette.foregroundFaint) }
    if secure {
      SecureField("", text: $text, prompt: prompt)
    } else {
      TextField("", text: $text, prompt: prompt)
    }
  }
}

extension LegacyTextField where Trailing == EmptyView {
  init(
    _ text: Binding<String>, placeholder: String? = nil, leadingIcon: Lucide? = nil, isError: Bool = false,
    secure: Bool = false
  ) {
    self.init(text, placeholder: placeholder, leadingIcon: leadingIcon, isError: isError, secure: secure) {
      EmptyView()
    }
  }
}

extension View {
  /// A sheet's look: the raised surface rather than the system's gray, its
  /// grabber, and `detents`, as iOS sheets have them.
  func legacySheet(_ detents: Set<PresentationDetent> = [.medium, .large]) -> some View {
    modifier(LegacySheetLook(detents: detents))
  }
}

private struct LegacySheetLook: ViewModifier {
  let detents: Set<PresentationDetent>
  @Environment(\.palette) private var palette

  func body(content: Content) -> some View {
    content
      .presentationBackground(palette.popover)
      .presentationDetents(detents)
      .presentationDragIndicator(.visible)
      .presentationCornerRadius(20)
  }
}

/// A sheet's heading: what it's for, and under it where that belongs.
struct LegacySheetHeader: View {
  let title: String
  var subtitle: String?
  @Environment(\.palette) private var palette

  init(_ title: String, _ subtitle: String? = nil) {
    self.title = title
    self.subtitle = subtitle
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 0) {
        Text(title).textStyle(.base, weight: .semibold).lineLimit(2).accessibilityAddTraits(.isHeader)
        if let subtitle {
          Text(subtitle).textStyle(.sm).foregroundStyle(palette.mutedForeground).lineLimit(1)
        }
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 8)
      Rectangle().fill(palette.border).frame(height: 1).padding(.vertical, 6)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A row in a sheet menu: an icon and a label.
struct LegacySheetItem: View {
  let icon: Lucide
  let label: String
  var destructive = false
  let action: () -> Void
  @Environment(\.palette) private var palette

  init(_ icon: Lucide, _ label: String, destructive: Bool = false, action: @escaping () -> Void) {
    self.icon = icon
    self.label = label
    self.destructive = destructive
    self.action = action
  }

  var body: some View {
    let color = destructive ? palette.destructive : palette.foreground
    Button(action: action) {
      HStack(spacing: 16) {
        LucideIcon(icon, tint: destructive ? color : palette.mutedForeground)
        Text(label).textStyle(.base).foregroundStyle(color)
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 14)
      .frame(minHeight: TouchTarget)
      .contentShape(Rectangle())
    }
    .buttonStyle(LegacyRowPress())
  }
}

/// A list row's press: the row's color deepens under the finger, as iOS lists do.
struct LegacyRowPress: ButtonStyle {
  @Environment(\.palette) private var palette
  @Environment(\.isEnabled) private var enabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .opacity(enabled ? 1 : 0.5)
      .background(palette.foreground.opacity(configuration.isPressed ? 0.08 : 0))
  }
}

/// A page or section with nothing to show yet: an icon, what's missing, and
/// what to do about it, as Home's note for no libraries.
struct LegacyEmptyState: View {
  let icon: Lucide
  let title: String
  var message: String?
  @Environment(\.palette) private var palette

  init(_ icon: Lucide, _ title: String, _ message: String? = nil) {
    self.icon = icon
    self.title = title
    self.message = message
  }

  var body: some View {
    VStack(spacing: 0) {
      LucideIcon(icon, size: 32, tint: palette.mutedForeground)
      Text(title).textStyle(.base, weight: .semibold).multilineTextAlignment(.center).padding(.top, 16)
      if let message {
        Text(message).textStyle(.sm).foregroundStyle(palette.mutedForeground)
          .multilineTextAlignment(.center).padding(.top, 4)
      }
    }
    .padding(.horizontal, Space.gutter)
    .padding(.vertical, 48)
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .combine)
  }
}

/// A card's press: it dims a little under the finger, as a list row does.
struct LegacyCardPress: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .opacity(configuration.isPressed ? 0.7 : 1)
      .motion(Motion.color, value: configuration.isPressed)
  }
}
