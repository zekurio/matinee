import MatineeCore
import MatineeKit
import SwiftUI

/*
 * SettingsRows.kt: the page and the rows Settings is built from, drawn by
 * MatineeKit as the web's settings sheet draws them at phone width
 * (settings-panel.tsx, setting-controls.tsx): sections 32 apart under a
 * heading, each a bordered block of rows split by hairlines.
 *
 * Settings' own pages use the kit's `ListSection`, `ListRow`, and
 * `MatineeKit.SwitchRow` directly, with `ChoiceRow` below for a choice.
 * The older names here, `Panel`, `RowDivider`, `PickerRow`, `SwitchRow`,
 * and the rest, keep their signatures for the pages that still call them
 * (the admin pages, the download sheet, the gallery), now drawn by the kit.
 */

extension EnvironmentValues {
  /// The page is wide enough for a choice to sit beside its name, as the
  /// web's `split` rows do from a container of 32rem.
  @Entry var settingsWide = false
}

/// The kit's theme, from the app's theme store: Matinee's palettes with the
/// server's accent, in the mode picked on this device.
// TODO(shell): the shell puts the kit's theme on the root once it moves onto
// the kit; this goes then, and Settings reads it from there.
struct KitTheme: ViewModifier {
  @Environment(ThemeStore.self) private var theme

  func body(content: Content) -> some View {
    content.matineeTheme(
      MatineeKit.MatineeTheme(accentLight: theme.accents.light, accentDark: theme.accents.dark),
      mode: MatineeKit.ThemeMode(rawValue: theme.mode.rawValue) ?? .system)
  }
}

/// The widest a Settings page's column grows, so rows don't stretch across
/// an iPad, as the web's settings dialog caps its panel.
let SETTINGS_COLUMN: CGFloat = 720

/// A Settings page: its top bar, then its sections down a column, 32 apart,
/// as the web's settings sheet on a phone (`px-4 py-6`, `gap-8`). The bar's
/// title is centered over a hairline, as the web's phone settings and iOS's
/// own settings pages have it. Across an iPad the column stays at most
/// `SETTINGS_COLUMN` wide, in the middle. The admin pages build on it too.
struct SettingsScaffold<Content: View>: View {
  let title: String
  var spacing: CGFloat = MatineeKit.Space.section
  @ViewBuilder let content: () -> Content
  @State private var wide = false
  @State private var position = ScrollPosition(edge: .top)

  /// `spacing` is what's between the sections, the web's `gap-8` unless given.
  init(_ title: String, spacing: CGFloat = MatineeKit.Space.section, @ViewBuilder content: @escaping () -> Content) {
    self.title = title
    self.spacing = spacing
    self.content = content
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: spacing) { content() }
        .frame(maxWidth: SETTINGS_COLUMN, alignment: .leading)
        .onGeometryChange(for: Bool.self) { $0.size.width >= 512 } action: { wide = $0 }
        .padding(.horizontal, MatineeKit.Space.gutter)
        .padding(.top, MatineeKit.Space.s6)
        .padding(.bottom, MatineeKit.Space.s8)
        .frame(maxWidth: .infinity)
    }
    .scrollDismissesKeyboard(.interactively)
    .scrollPosition($position)
    #if DEBUG
      // -settings.scroll 600: starts that far down, or at the end for `bottom`, to see a long page in a screenshot.
      .task {
        guard let to = UserDefaults.standard.string(forKey: "settings.scroll") else { return }
        try? await Task.sleep(for: .seconds(2))
        if to == "bottom" { position.scrollTo(edge: .bottom) } else if let y = Double(to) { position.scrollTo(y: y) }
      }
    #endif
    .environment(\.settingsWide, wide)
    .topBar(title, leading: .back, centered: true)
    .modifier(KitTheme())
  }
}

/// A titled group of settings, as the web's SettingsSubsection: its heading
/// in `text-base font-semibold tracking-tight`, 12 over what it holds.
/// Android's `Section`, renamed, as SwiftUI has one. For a block of rows
/// alone, `ListSection` says the same in one.
struct SettingsSection<Content: View>: View {
  let title: String
  @ViewBuilder let content: () -> Content
  @Environment(\.kitPalette) private var palette

  init(_ title: String, @ViewBuilder content: @escaping () -> Content) {
    self.title = title
    self.content = content
  }

  var body: some View {
    VStack(alignment: .leading, spacing: MatineeKit.Space.s3) {
      Text(title)
        .textStyle(.base, weight: .semibold, tracking: .tight)
        .foregroundStyle(palette.foreground)
        .accessibilityAddTraits(.isHeader)
      content()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// The block rows sit in, as the web's SettingRows and List:
/// `rounded-xl border bg-foreground/[0.02]`.
let PanelShape = RoundedRectangle.kit(MatineeKit.Radius.xl)

/// A block of rows that puts its own lines between them with `RowDivider`.
/// `ListBlock` puts them in by itself.
struct Panel<Content: View>: View {
  @ViewBuilder let content: () -> Content
  @Environment(\.kitPalette) private var palette

  init(@ViewBuilder content: @escaping () -> Content) { self.content = content }

  var body: some View {
    VStack(spacing: 0) { content() }
      .frame(maxWidth: .infinity)
      .background(palette.foreground.opacity(0.02), in: PanelShape)
      .clipShape(PanelShape)
      .overlay { PanelShape.strokeBorder(palette.border) }
  }
}

/// The hairline between rows in a `Panel`.
struct RowDivider: View {
  var body: some View { MatineeKit.Separator() }
}

/// A choice among `options`, as the web's SelectRow in its `split` layout:
/// the name, and the Select under it on a phone, or beside it, 288 wide, on
/// a page with room, as an iPad's. At the accessibility text sizes it stays
/// under the name. One that isn't `enabled`, as a choice with only one
/// option the server allows, shows its value as text, as the web's FixedRow.
struct ChoiceRow<Value: Hashable>: View {
  let title: String
  let options: [(Value, String)]
  @Binding var selection: Value
  var enabled = true
  @Environment(\.settingsWide) private var wide
  @Environment(\.dynamicTypeSize) private var dynamicType
  @Environment(\.kitPalette) private var palette

  init(_ title: String, selection: Binding<Value>, options: [(Value, String)], enabled: Bool = true) {
    self.title = title
    self._selection = selection
    self.options = options
    self.enabled = enabled
  }

  var body: some View {
    if !enabled {
      MatineeKit.ValueRow(title, value: options.first { $0.0 == selection }?.1 ?? options.first?.1 ?? "")
    } else if wide && !dynamicType.isAccessibilitySize {
      HStack(spacing: MatineeKit.Space.s6) {
        Text(title).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityHidden(true)
        MatineeKit.Select(title, selection: $selection, options: options).frame(width: 288)
      }
      .padding(.horizontal, MatineeKit.Space.s4)
      .padding(.vertical, MatineeKit.Space.s2_5)
      .frame(minHeight: 52)
    } else {
      MatineeKit.SelectRow(title, selection: $selection, options: options, stacked: true)
    }
  }
}

extension ChoiceRow {
  /// A choice that calls `onPick` with a new value, rather than writing to a binding.
  init(_ title: String, current: Value, options: [(Value, String)], enabled: Bool = true, onPick: @escaping (Value) -> Void) {
    self.init(
      title, selection: Binding(get: { current }, set: { if $0 != current { onPick($0) } }), options: options,
      enabled: enabled)
  }
}

#if DEBUG
  /// `-settings.open NAME`: opens a dialog, sheet, or menu of a page as it
  /// shows, to see it in a screenshot without a finger on the simulator.
  func debugOpens(_ name: String) -> Bool { UserDefaults.standard.string(forKey: "settings.open") == name }
#endif

/// A short line of status under a block, as the web's SettingNote:
/// `text-13px` muted, 4 in from the block's edge.
struct SettingNote: View {
  let text: String
  var color: Color?
  @Environment(\.kitPalette) private var palette

  init(_ text: String, color: Color? = nil) {
    self.text = text
    self.color = color
  }

  var body: some View {
    Text(text).textStyle(.px13).foregroundStyle(color ?? palette.mutedForeground)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, MatineeKit.Space.s1)
  }
}

// MARK: The older rows

/// A choice among `options`, picked from a Select: `ChoiceRow` under the
/// name the older pages call it by. A row that isn't `enabled` only shows its value.
struct PickerRow<Value: Hashable>: View {
  let title: String
  let options: [(Value, String)]
  let current: Value
  var enabled = true
  let onPick: (Value) -> Void

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
    ChoiceRow(title, current: current, options: options, enabled: enabled, onPick: onPick)
  }
}

/// A choice among many, like the languages. The kit's Select scrolls a long
/// list in its menu, as the web's does, so it's a `ChoiceRow` too.
struct ListPickerRow<Value: Hashable>: View {
  let title: String
  let options: [(Value, String)]
  let current: Value
  let onPick: (Value) -> Void

  init(_ title: String, options: [(Value, String)], current: Value, onPick: @escaping (Value) -> Void) {
    self.title = title
    self.options = options
    self.current = current
    self.onPick = onPick
  }

  var body: some View {
    ChoiceRow(title, current: current, options: options, onPick: onPick)
  }
}

/// A setting that's on or off: the kit's `SwitchRow`, with the older argument order.
struct SwitchRow: View {
  let title: String
  @Binding var isOn: Bool
  var icon: MatineeKit.Lucide?

  init(_ title: String, isOn: Binding<Bool>, icon: MatineeKit.Lucide? = nil) {
    self.title = title
    self._isOn = isOn
    self.icon = icon
  }

  var body: some View {
    MatineeKit.SwitchRow(title, icon: icon, isOn: $isOn)
  }
}

/// A row that only tells something, its value at its end.
struct ValueRow: View {
  let title: String
  let value: String

  init(_ title: String, value: String) {
    self.title = title
    self.value = value
  }

  var body: some View { MatineeKit.ValueRow(title, value: value) }
}

/// A row that goes somewhere else, with what's set there at its end, or
/// what it's for under its title: the kit's `ListRow`.
struct LinkRow: View {
  let title: String
  var value: String?
  var destructive = false
  var icon: MatineeKit.Lucide?
  var description: String?
  let action: () -> Void

  init(
    _ title: String, value: String? = nil, destructive: Bool = false, icon: MatineeKit.Lucide? = nil,
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
    MatineeKit.ListRow(
      title, subtitle: description, icon: icon, value: value, destructive: destructive, action: action)
  }
}

/// A row that says where something is set that the app can't open, its
/// title over the way there.
struct NoteRow: View {
  let title: String
  let description: String

  init(_ title: String, description: String) {
    self.title = title
    self.description = description
  }

  var body: some View { MatineeKit.ListRow(title, subtitle: description) }
}
