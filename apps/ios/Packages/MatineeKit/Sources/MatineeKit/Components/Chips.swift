import SwiftUI

/// A filter or library chip, as the web's `chipClass`: a capsule, filled
/// with the foreground when it's the current one, which VoiceOver reads as
/// selected, and outlined otherwise. 36 tall as Android's, taking 44 to
/// hit. One with a `trailingIcon` acts, as removing a filter does, so it's
/// a plain button. `frosted` gives it a veil of the page for sitting on art.
public struct Chip: View {
  let label: String
  let selected: Bool
  let frosted: Bool
  let trailingIcon: Lucide?
  let action: () -> Void
  @Environment(\.palette) private var palette

  public init(
    _ label: String, selected: Bool = false, frosted: Bool = false, trailingIcon: Lucide? = nil,
    action: @escaping () -> Void
  ) {
    self.label = label
    self.selected = selected
    self.frosted = frosted
    self.trailingIcon = trailingIcon
    self.action = action
  }

  public var body: some View {
    let color = selected ? palette.background : palette.foreground.opacity(0.75)
    Button(action: action) {
      HStack(spacing: 4) {
        Text(label).textStyle(.sm, weight: .medium).lineLimit(1)
        if let trailingIcon { LucideIcon(trailingIcon, size: 14, scales: false) }
      }
      .foregroundStyle(color)
      .padding(.horizontal, 14)
      .frame(minHeight: 36)
      .background(selected ? palette.foreground : frosted ? palette.background.opacity(0.4) : .clear, in: Capsule())
      .overlay { if !selected { Capsule().strokeBorder(palette.foreground.opacity(0.1)) } }
      .motion(Motion.color, value: selected)
    }
    .buttonStyle(KitPressStyle(shape: Capsule(), hitInset: 4))
    .accessibilityAddTraits(trailingIcon == nil && selected ? .isSelected : [])
  }
}

/// One of a few, of which one is picked, as the web's filter panel chips:
/// smaller than a page's `Chip`, 40 tall, 13-point text, filled with the
/// foreground when on, and a radio button to VoiceOver. `count` says how
/// many it stands for, after its label.
public struct ChoiceChip: View {
  let label: String
  let selected: Bool
  let count: String?
  let action: () -> Void

  public init(_ label: String, selected: Bool, count: String? = nil, action: @escaping () -> Void) {
    self.label = label
    self.selected = selected
    self.count = count
    self.action = action
  }

  public var body: some View {
    Button(action: action) { SmallChip(label: label, count: count, on: selected) }
      .buttonStyle(KitPressStyle(shape: Capsule(), hitInset: 2))
      .accessibilityAddTraits(selected ? [.isSelected] : [])
  }
}

/// A choice that turns on and off by itself, among others that do too, as
/// the web's `aria-pressed` filter chips: a checkbox to VoiceOver.
public struct ToggleChip: View {
  let label: String
  @Binding var isOn: Bool
  let count: String?

  public init(_ label: String, isOn: Binding<Bool>, count: String? = nil) {
    self.label = label
    self._isOn = isOn
    self.count = count
  }

  public var body: some View {
    Toggle(isOn: $isOn) { Text(label) }
      .toggleStyle(ChipToggleStyle(count: count))
  }
}

private struct ChipToggleStyle: ToggleStyle {
  let count: String?

  func makeBody(configuration: Configuration) -> some View {
    Button {
      configuration.isOn.toggle()
    } label: {
      SmallChip(label: nil, count: count, on: configuration.isOn) { configuration.label }
    }
    .buttonStyle(KitPressStyle(shape: Capsule(), hitInset: 2))
    .accessibilityRepresentation {
      Toggle(isOn: configuration.$isOn) { configuration.label }
    }
  }
}

private struct SmallChip<Label: View>: View {
  let label: String?
  let count: String?
  let on: Bool
  @ViewBuilder var custom: () -> Label
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 6) {
      Group {
        if let label { Text(label) } else { custom() }
      }
      .foregroundStyle(on ? palette.background : palette.foreground.opacity(0.8))
      if let count {
        Text(count).foregroundStyle(on ? palette.background.opacity(0.7) : palette.mutedForeground)
      }
    }
    .textStyle(.px13, weight: .medium)
    .lineLimit(1)
    .padding(.horizontal, 12)
    .frame(minHeight: 40)
    .background(on ? palette.foreground : .clear, in: Capsule())
    .overlay { Capsule().strokeBorder(on ? .clear : palette.foreground.opacity(0.15)) }
    .motion(Motion.color, value: on)
  }
}

extension SmallChip where Label == EmptyView {
  init(label: String?, count: String?, on: Bool) {
    self.init(label: label, count: count, on: on) { EmptyView() }
  }
}

/// The look of a badge: the web's Badge variants, and Android's small
/// rounded box for a fact about a title, like an age rating or "1080p".
public enum BadgeLook: String, CaseIterable, Sendable {
  case primary, secondary, destructive, outline
  /// A fact about a title: `rounded` 4, the foreground at 12%, 13-point text.
  case meta
  /// The same, outlined.
  case metaOutline
}

/// A short label, as the web's Badge: a pill `h-5`, `text-xs font-medium`,
/// in one of its variants, or a title's fact box in `.meta`.
public struct Badge: View {
  let text: String
  let look: BadgeLook
  let icon: Lucide?
  @Environment(\.palette) private var palette

  public init(_ text: String, look: BadgeLook = .secondary, icon: Lucide? = nil) {
    self.text = text
    self.look = look
    self.icon = icon
  }

  public var body: some View {
    let meta = look == .meta || look == .metaOutline
    let shape = meta ? KitShape(radius: 4) : .capsule
    HStack(spacing: 4) {
      if let icon { LucideIcon(icon, size: 12, scales: false) }
      Text(text).textStyle(meta ? .px13 : .xs, weight: .medium).lineLimit(1)
    }
    .fixedSize()
    .foregroundStyle(foreground)
    .padding(.horizontal, meta ? 6 : 8)
    .padding(.vertical, meta ? 1 : 2)
    .frame(minHeight: 20)
    .background(background, in: shape)
    .overlay { if let border { shape.strokeBorder(border) } }
  }

  private var foreground: Color {
    switch look {
    case .primary: palette.accentForeground
    case .secondary, .outline: palette.foreground
    case .destructive: palette.destructive
    case .meta, .metaOutline: palette.foreground.opacity(0.85)
    }
  }

  private var background: Color {
    switch look {
    case .primary: palette.accent
    case .secondary: palette.secondary
    case .destructive: palette.colors.danger.opacity(palette.isDark ? 0.2 : 0.1)
    case .meta: palette.foreground.opacity(0.12)
    case .outline, .metaOutline: .clear
    }
  }

  private var border: Color? {
    switch look {
    case .outline: palette.border
    case .metaOutline: palette.foreground.opacity(0.3)
    default: nil
    }
  }
}
