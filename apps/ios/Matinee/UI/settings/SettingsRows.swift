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

/// A Settings page: its top bar, then its sections down a list, 28 apart,
/// within the gutter. The admin pages build on it too. Across an iPad it
/// takes the width, as Android's pages do on a tablet.
struct SettingsScaffold<Content: View>: View {
  let title: String
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette

  init(_ title: String, @ViewBuilder content: @escaping () -> Content) {
    self.title = title
    self.content = content
  }

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 28) { content() }
        .padding(.horizontal, Gutter)
        .padding(.top, 8)
        .padding(.bottom, 20)
    }
    .scrollDismissesKeyboard(.interactively)
    .background(palette.background)
    .topBar(title)
  }
}

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
      // A long German title, "Hardwarebeschleunigung", shrinks to fit rather than break.
      Text(title).textStyle(.titleLarge).keepsWordsWhole(title, .titleLarge).accessibilityAddTraits(.isHeader)
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

/// A row's title and the value at its end, which takes at most 160 points
/// and the room the title leaves. At the accessibility text sizes the value
/// goes under the title instead, as iOS's own settings put it, rather than
/// be cut to an ellipsis.
private struct TitleValue<Trailing: View>: View {
  let title: String
  let value: String
  @ViewBuilder let trailing: () -> Trailing
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType

  var body: some View {
    HStack(spacing: 0) {
      if dynamicType.isAccessibilitySize {
        VStack(alignment: .leading, spacing: 2) {
          Text(title).textStyle(.bodyLarge).foregroundStyle(palette.foreground).keepsWordsWhole(title, .bodyLarge)
          Text(value).textStyle(.bodyMedium).foregroundStyle(palette.muted)
        }
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, alignment: .leading)
      } else {
        Text(title).textStyle(.bodyLarge).foregroundStyle(palette.foreground).layoutPriority(1)
          .multilineTextAlignment(.leading)
        Spacer(minLength: 12)
        Text(value).textStyle(.bodyMedium).foregroundStyle(palette.muted).lineLimit(1)
          .frame(maxWidth: 160, alignment: .trailing)
      }
      trailing()
    }
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
    let row = TitleValue(title: title, value: value) {
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

/// A choice among many, like the languages: the row shows the current one
/// and opens a page of them all, a check by the current one, as iOS's own
/// settings do where a menu would run off the screen. Picking goes back.
struct ListPickerRow<Value: Hashable>: View {
  let title: String
  let options: [(Value, String)]
  let current: Value
  let onPick: (Value) -> Void
  @Environment(\.palette) private var palette

  init(_ title: String, options: [(Value, String)], current: Value, onPick: @escaping (Value) -> Void) {
    self.title = title
    self.options = options
    self.current = current
    self.onPick = onPick
  }

  var body: some View {
    let value = options.first { $0.0 == current }?.1 ?? String(describing: current)
    NavigationLink {
      ChoicePage(title: title, options: options, current: current, onPick: onPick)
    } label: {
      TitleValue(title: title, value: value) {
        LucideIcon(.chevronRight, size: 16, tint: palette.muted).padding(.leading, 4)
      }
      .modifier(RowFrame())
    }
    .buttonStyle(RowPress())
    .accessibilityValue(value)
  }
}

/// The page a `ListPickerRow` opens.
private struct ChoicePage<Value: Hashable>: View {
  let title: String
  let options: [(Value, String)]
  let current: Value
  let onPick: (Value) -> Void
  @Environment(\.dismiss) private var dismiss
  @Environment(\.palette) private var palette

  var body: some View {
    SettingsScaffold(title) {
      Panel {
        ForEach(Array(options.enumerated()), id: \.offset) { index, option in
          if index > 0 { RowDivider() }
          let selected = option.0 == current
          Button {
            if !selected { onPick(option.0) }
            dismiss()
          } label: {
            HStack(spacing: 12) {
              Text(option.1).textStyle(.bodyLarge).foregroundStyle(palette.foreground)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
              if selected { LucideIcon(.check, size: 18, tint: palette.accent) }
            }
            .modifier(RowFrame())
          }
          .buttonStyle(RowPress())
          .accessibilityAddTraits(selected ? .isSelected : [])
        }
      }
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
        Text(title).textStyle(.bodyLarge).foregroundStyle(palette.foreground).keepsWordsWhole(title, .bodyLarge)
      }
    }
    .toggleStyle(.matinee)
    .modifier(RowFrame())
    // The switch takes its own taps; the rest of the row flips it too, as on Android.
    .onTapGesture { isOn.toggle() }
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
  @Environment(\.dynamicTypeSize) private var dynamicType

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
        // At the accessibility sizes the value goes under the title, as in `TitleValue`.
        let stacked = dynamicType.isAccessibilitySize
        VStack(alignment: .leading, spacing: 0) {
          // Across the row when nothing sits at its end; beside a value it takes only what it needs.
          if stacked || value == nil {
            Text(title).textStyle(.bodyLarge).foregroundStyle(color).keepsWordsWhole(title, .bodyLarge)
          } else {
            Text(title).textStyle(.bodyLarge).foregroundStyle(color)
          }
          if stacked, let value {
            Text(value).textStyle(.bodyMedium).foregroundStyle(palette.muted)
          }
          if let description {
            Text(description).textStyle(.bodySmall).foregroundStyle(palette.muted)
          }
        }
        .multilineTextAlignment(.leading)
        .layoutPriority(1)
        Spacer(minLength: value == nil || stacked ? 0 : 12)
        if !stacked, let value {
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

/// A row that says where something is set that the app can't open, its
/// title over the way there.
struct NoteRow: View {
  let title: String
  let description: String
  @Environment(\.palette) private var palette

  init(_ title: String, description: String) {
    self.title = title
    self.description = description
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(title).textStyle(.bodyLarge).foregroundStyle(palette.foreground).keepsWordsWhole(title, .bodyLarge)
      Text(description).textStyle(.bodySmall).foregroundStyle(palette.muted)
    }
    .modifier(RowFrame())
    .accessibilityElement(children: .combine)
  }
}
