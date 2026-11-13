import SwiftUI

/*
 * The rows Settings is built from, as the web's setting-controls and
 * Android's SettingsRows.kt: a titled section, a panel of rows with lines
 * between them, and rows that pick, switch, tell, or go somewhere.
 *
 *     SettingsSection(Str.settingsPageAppearance) {
 *       Panel {
 *         PickerRow(Str.webAppearanceColorScheme, options: modes, current: theme.mode) { theme.setMode($0) }
 *         RowDivider()
 *         SwitchRow(Str.…, isOn: $on)
 *       }
 *     }
 */

let PanelShape = RoundedRectangle(cornerRadius: 12, style: .continuous)

/// A titled group of settings. Android's `Section`, renamed, as SwiftUI has one.
struct SettingsSection<Content: View>: View {
  let title: String
  @ViewBuilder let content: () -> Content

  init(_ title: String, @ViewBuilder content: @escaping () -> Content) {
    self.title = title
    self.content = content
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text(title).textStyle(.titleLarge).accessibilityAddTraits(.isHeader)
      content()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A card of rows, with lines between them.
struct Panel<Content: View>: View {
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette

  init(@ViewBuilder content: @escaping () -> Content) { self.content = content }

  var body: some View {
    VStack(spacing: 0) { content() }
      .frame(maxWidth: .infinity)
      .background(palette.card, in: PanelShape)
      .clipShape(PanelShape)
      .overlay { PanelShape.strokeBorder(palette.border) }
  }
}

struct RowDivider: View {
  @Environment(\.palette) private var palette

  var body: some View { Rectangle().fill(palette.border).frame(height: 1) }
}

/// A row's padding and minimum height, the same for every kind. Its title
/// takes the room it needs first, wrapping at large text sizes, and what's
/// at its end, at most 160 points, gets the rest.
private struct RowFrame: ViewModifier {
  func body(content: Content) -> some View {
    content
      .padding(.horizontal, 16)
      .padding(.vertical, 14)
      .frame(maxWidth: .infinity, minHeight: MinTouch, alignment: .leading)
      .contentShape(Rectangle())
  }
}

/// A row's icon, ahead of its title.
private struct RowIcon: View {
  let icon: Lucide?
  var tint: Color

  var body: some View {
    if let icon { LucideIcon(icon, size: 20, tint: tint).padding(.trailing, 14) }
  }
}

/// A choice among `options`, shown at the row's end and picked from a menu
/// that opens there, with a check by the current one. A row that isn't
/// `enabled` only shows its value.
struct PickerRow<Value: Hashable>: View {
  let title: String
  let options: [(Value, String)]
  let current: Value
  var enabled = true
  let onPick: (Value) -> Void
  @Environment(\.palette) private var palette

  init(
    _ title: String, options: [(Value, String)], current: Value, enabled: Bool = true,
    onPick: @escaping (Value) -> Void
  ) {
    self.title = title
    self.options = options
    self.current = current
    self.enabled = enabled
    self.onPick = onPick
  }

  var body: some View {
    let value = options.first { $0.0 == current }?.1 ?? String(describing: current)
    let row = HStack(spacing: 0) {
      Text(title).textStyle(.bodyLarge).foregroundStyle(palette.foreground).layoutPriority(1)
      Spacer(minLength: 12)
      Text(value).textStyle(.bodyMedium).foregroundStyle(palette.muted).lineLimit(1)
        .frame(maxWidth: 160, alignment: .trailing)
      if enabled { LucideIcon(.chevronDown, size: 16, tint: palette.muted).padding(.leading, 4) }
    }
    .modifier(RowFrame())
    if enabled {
      Menu {
        Picker(
          title,
          selection: Binding(get: { current }, set: { if $0 != current { onPick($0) } })
        ) {
          ForEach(options, id: \.0) { option, label in Text(label).tag(option) }
        }
        .pickerStyle(.inline)
      } label: {
        row
      }
      .buttonStyle(RowPress())
      .accessibilityValue(value)
    } else {
      row.accessibilityElement(children: .combine)
    }
  }
}

/// A setting that's on or off, the switch at its end; the whole row flips it.
struct SwitchRow: View {
  let title: String
  @Binding var isOn: Bool
  var icon: Lucide?
  @Environment(\.palette) private var palette

  init(_ title: String, isOn: Binding<Bool>, icon: Lucide? = nil) {
    self.title = title
    self._isOn = isOn
    self.icon = icon
  }

  var body: some View {
    Toggle(isOn: $isOn) {
      HStack(spacing: 0) {
        RowIcon(icon: icon, tint: palette.muted)
        Text(title).textStyle(.bodyLarge).foregroundStyle(palette.foreground)
      }
    }
    .toggleStyle(.matinee)
    .modifier(RowFrame())
  }
}

/// A row that only tells something, its value at its end.
struct ValueRow: View {
  let title: String
  let value: String
  @Environment(\.palette) private var palette

  init(_ title: String, value: String) {
    self.title = title
    self.value = value
  }

  var body: some View {
    HStack(spacing: 0) {
      Text(title).textStyle(.bodyLarge).foregroundStyle(palette.foreground).layoutPriority(1)
      Spacer(minLength: 12)
      Text(value).textStyle(.bodyMedium).foregroundStyle(palette.muted).multilineTextAlignment(.trailing)
    }
    .modifier(RowFrame())
    .accessibilityElement(children: .combine)
  }
}

/// A row that goes somewhere else, like the system's settings, with what's
/// set there at its end, or what it's for under its title.
struct LinkRow: View {
  let title: String
  var value: String?
  var destructive = false
  var icon: Lucide?
  var description: String?
  let action: () -> Void
  @Environment(\.palette) private var palette

  init(
    _ title: String, value: String? = nil, destructive: Bool = false, icon: Lucide? = nil,
    description: String? = nil, action: @escaping () -> Void
  ) {
    self.title = title
    self.value = value
    self.destructive = destructive
    self.icon = icon
    self.description = description
    self.action = action
  }

  var body: some View {
    let color = destructive ? palette.danger : palette.foreground
    Button(action: action) {
      HStack(spacing: 0) {
        RowIcon(icon: icon, tint: destructive ? palette.danger : palette.muted)
        VStack(alignment: .leading, spacing: 0) {
          Text(title).textStyle(.bodyLarge).foregroundStyle(color)
          if let description {
            Text(description).textStyle(.bodySmall).foregroundStyle(palette.muted)
          }
        }
        .multilineTextAlignment(.leading)
        .layoutPriority(1)
        Spacer(minLength: value == nil ? 0 : 12)
        if let value {
          Text(value).textStyle(.bodyMedium).foregroundStyle(palette.muted).lineLimit(1)
            .frame(maxWidth: 160, alignment: .trailing)
        }
        if !destructive { LucideIcon(.chevronRight, size: 16, tint: palette.muted).padding(.leading, 4) }
      }
      .modifier(RowFrame())
    }
    .buttonStyle(RowPress())
  }
}
