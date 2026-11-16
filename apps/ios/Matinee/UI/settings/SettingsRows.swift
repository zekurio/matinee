import MatineeCore
import MatineeKit
import SwiftUI

/*
 * SettingsRows.kt: the page and the rows Settings is built from, laid out
 * as Android's Settings: the kit's top bar with the page's name, then
 * sections 28 apart, each a heading in the page's title style over a
 * bordered block of rows split by hairlines.
 *
 * The pages use the kit's `ListSection`, `ListRow` (Android's LinkRow),
 * `SwitchRow`, `ValueRow`, and `SelectRow` (Android's PickerRow) directly,
 * which take Android's row measures; what's here is what Settings adds to
 * them: the page, a titled group, a choice that sits beside its name on an
 * iPad, and the line a block shows when it has no rows.
 */

extension EnvironmentValues {
  /// The page is an iPad's, wide enough for a choice to sit beside its
  /// name, as the web's `split` rows do from a container of 32rem. A phone
  /// keeps Android's value at the row's end, whichever way it's held.
  @Entry var settingsWide = false
}

/// The widest a Settings page's column grows, so rows don't stretch across
/// an iPad, as the web's settings dialog caps its panel.
let SETTINGS_COLUMN: CGFloat = 720

/// A Settings page, as Android's `SettingsScaffold`: the kit's top bar with
/// the page's name at its start, then its sections down a column, 28
/// apart, 8 under the bar and 20 over the end. Across an iPad the column
/// stays at most `SETTINGS_COLUMN` wide, in the middle. The admin pages
/// are `AdminPage`s, which lay out the same.
struct SettingsScaffold<Content: View>: View {
  let title: String
  @ViewBuilder let content: () -> Content
  @State private var wide = false
  @State private var position = ScrollPosition(edge: .top)
  @Environment(\.shellStyle) private var shellStyle

  init(_ title: String, @ViewBuilder content: @escaping () -> Content) {
    self.title = title
    self.content = content
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: SETTINGS_SPACING) { content() }
        .frame(maxWidth: SETTINGS_COLUMN, alignment: .leading)
        .onGeometryChange(for: Bool.self) { $0.size.width >= 512 } action: { wide = $0 }
        .padding(.horizontal, Space.gutter)
        .padding(.top, Space.s2)
        .padding(.bottom, Space.s5)
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
    .environment(\.settingsWide, wide && shellStyle == .tablet)
    .topBar(title)
  }
}

/// What's between a Settings page's sections, as Android's 28.
let SETTINGS_SPACING: CGFloat = Space.s7

/// A titled group of settings, as Android's `Section`: its heading in the
/// page's title style, 14 over what it holds. Renamed, as SwiftUI has a
/// `Section`. For a block of rows alone, `ListSection` says the same in one.
struct SettingsSection<Content: View>: View {
  let title: String
  var spacing: CGFloat = Space.s3_5
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette

  /// `spacing` is between what the section holds, as well as under its heading.
  init(_ title: String, spacing: CGFloat = Space.s3_5, @ViewBuilder content: @escaping () -> Content) {
    self.title = title
    self.spacing = spacing
    self.content = content
  }

  var body: some View {
    VStack(alignment: .leading, spacing: spacing) {
      Text(title)
        .pageTitleStyle()
        .foregroundStyle(palette.foreground)
        .accessibilityAddTraits(.isHeader)
      content()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// The block rows sit in, as the web's SettingRows and List:
/// `rounded-xl border bg-foreground/[0.02]`, for a block drawn by hand.
let PanelShape = RoundedRectangle.kit(Radius.xl)

/// A choice among `options`, as Android's PickerRow: the name, and the
/// value at the row's end, the row opening a menu of them. On an iPad the
/// web's Select sits beside the name instead, 288 wide. One that isn't
/// `enabled`, as a choice with only one option the server allows, shows
/// its value as text.
struct ChoiceRow<Value: Hashable>: View {
  let title: String
  let options: [(Value, String)]
  @Binding var selection: Value
  var enabled = true
  @Environment(\.settingsWide) private var wide
  @Environment(\.dynamicTypeSize) private var dynamicType
  @Environment(\.palette) private var palette

  init(_ title: String, selection: Binding<Value>, options: [(Value, String)], enabled: Bool = true) {
    self.title = title
    self._selection = selection
    self.options = options
    self.enabled = enabled
  }

  var body: some View {
    if !enabled {
      ValueRow(title, value: options.first { $0.0 == selection }?.1 ?? options.first?.1 ?? "")
    } else if wide && !dynamicType.isAccessibilitySize {
      HStack(spacing: Space.s6) {
        Text(title).textStyle(.base).foregroundStyle(palette.foreground)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityHidden(true)
        Select(title, selection: $selection, options: options).frame(width: 288)
      }
      .padding(.horizontal, Space.s4)
      .padding(.vertical, Space.s2_5)
      .frame(minHeight: 52)
    } else {
      SelectRow(title, selection: $selection, options: options)
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

/// What a block of rows says when it has none, such as no folders yet:
/// `text-sm` muted, 16 in, where its first row would be, as Android's.
struct EmptyRow: View {
  let text: String
  @Environment(\.palette) private var palette

  init(_ text: String) { self.text = text }

  var body: some View {
    Text(text).textStyle(.sm).foregroundStyle(palette.mutedForeground)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, Space.s4)
      .padding(.vertical, Space.s4)
  }
}
