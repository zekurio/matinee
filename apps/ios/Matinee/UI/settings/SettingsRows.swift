import MatineeCore
import MatineeKit
import SwiftUI

/*
 * SettingsRows.kt: the page and the rows Settings is built from, drawn by
 * MatineeKit as the web's settings sheet draws them at phone width
 * (settings-panel.tsx, setting-controls.tsx): sections 32 apart under a
 * heading, each a bordered block of rows split by hairlines.
 *
 * The pages use the kit's `ListSection`, `ListRow`, `SwitchRow`, and
 * `ValueRow` directly; what's here is what Settings adds to them: the
 * page, a titled group, a choice that sits beside its name on a wide page,
 * and the line a block shows when it has no rows.
 */

extension EnvironmentValues {
  /// The page is wide enough for a choice to sit beside its name, as the
  /// web's `split` rows do from a container of 32rem.
  @Entry var settingsWide = false
}

/// The widest a Settings page's column grows, so rows don't stretch across
/// an iPad, as the web's settings dialog caps its panel.
let SETTINGS_COLUMN: CGFloat = 720

/// A Settings page: its top bar, then its sections down a column, 32 apart,
/// as the web's settings sheet on a phone (`px-4 py-6`, `gap-8`). The bar's
/// title is centered over a hairline, as the web's phone settings and iOS's
/// own settings pages have it. Across an iPad the column stays at most
/// `SETTINGS_COLUMN` wide, in the middle. The admin pages are `AdminPage`s,
/// drawn as the web's admin panels.
struct SettingsScaffold<Content: View>: View {
  let title: String
  var spacing: CGFloat = Space.section
  @ViewBuilder let content: () -> Content
  @State private var wide = false
  @State private var position = ScrollPosition(edge: .top)

  /// `spacing` is what's between the sections, the web's `gap-8` unless given.
  init(_ title: String, spacing: CGFloat = Space.section, @ViewBuilder content: @escaping () -> Content) {
    self.title = title
    self.spacing = spacing
    self.content = content
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: spacing) { content() }
        .frame(maxWidth: SETTINGS_COLUMN, alignment: .leading)
        .onGeometryChange(for: Bool.self) { $0.size.width >= 512 } action: { wide = $0 }
        .padding(.horizontal, Space.gutter)
        .padding(.top, Space.s6)
        .padding(.bottom, Space.s8)
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
    .topBar(title, centered: true)
  }
}

/// A titled group of settings, as the web's SettingsSubsection: its heading
/// in `text-base font-semibold tracking-tight`, 12 over what it holds.
/// Android's `Section`, renamed, as SwiftUI has one. For a block of rows
/// alone, `ListSection` says the same in one.
struct SettingsSection<Content: View>: View {
  let title: String
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette

  init(_ title: String, @ViewBuilder content: @escaping () -> Content) {
    self.title = title
    self.content = content
  }

  var body: some View {
    VStack(alignment: .leading, spacing: Space.s3) {
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
/// `rounded-xl border bg-foreground/[0.02]`, for a block drawn by hand.
let PanelShape = RoundedRectangle.kit(Radius.xl)

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
        Text(title).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityHidden(true)
        Select(title, selection: $selection, options: options).frame(width: 288)
      }
      .padding(.horizontal, Space.s4)
      .padding(.vertical, Space.s2_5)
      .frame(minHeight: 52)
    } else {
      SelectRow(title, selection: $selection, options: options, stacked: true)
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
/// `text-sm` muted, where its first row would be.
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
