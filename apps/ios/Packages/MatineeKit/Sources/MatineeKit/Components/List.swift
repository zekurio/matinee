import SwiftUI

/*
 * Lists as the web draws them, not as iOS's grouped tables do: a bordered
 * block of rows, `rounded-xl`, split by hairlines (packages/ui's List and
 * the settings' SettingRows), under a title. Build a page's lists from a
 * ScrollView of `ListSection`s; the kit has no `List`, since SwiftUI's
 * draws the system's look.
 */

/// How a section's title reads: a heading over a settings block (`text-base
/// font-semibold`, the web's SettingsSubsection), or a quiet label over a
/// group of links (`text-sm` muted, as Settings' "Administration").
public enum ListSectionTitleStyle: Sendable {
  case heading, label
}

/// A titled block of rows: `ListRow`s, `SwitchRow`s, `SelectRow`s,
/// `ValueRow`s, or any view, with hairlines put between them. `footer` is
/// a line of status under the block, `text-13px` muted, as the web's
/// SettingNote. `action` sits at the title's end, as a section's Add.
public struct ListSection<Content: View, Action: View>: View {
  let title: String?
  let titleStyle: ListSectionTitleStyle
  let footer: String?
  @ViewBuilder let content: () -> Content
  @ViewBuilder let action: () -> Action
  @Environment(\.palette) private var palette

  public init(
    _ title: String? = nil, titleStyle: ListSectionTitleStyle = .heading, footer: String? = nil,
    @ViewBuilder content: @escaping () -> Content, @ViewBuilder action: @escaping () -> Action
  ) {
    self.title = title
    self.titleStyle = titleStyle
    self.footer = footer
    self.content = content
    self.action = action
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: titleStyle == .heading ? Space.s3 : Space.s2) {
      if let title {
        HStack(spacing: Space.s3) {
          Group {
            if titleStyle == .heading {
              Text(title).textStyle(.base, weight: .semibold, tracking: .tight).foregroundStyle(palette.foreground)
            } else {
              Text(title).textStyle(.sm).foregroundStyle(palette.mutedForeground).padding(.horizontal, 4)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityAddTraits(.isHeader)
          action()
        }
      }
      ListBlock(content: content)
      if let footer {
        Text(footer).textStyle(.px13).foregroundStyle(palette.mutedForeground).padding(.horizontal, 4)
      }
    }
  }
}

extension ListSection where Action == EmptyView {
  public init(
    _ title: String? = nil, titleStyle: ListSectionTitleStyle = .heading, footer: String? = nil,
    @ViewBuilder content: @escaping () -> Content
  ) {
    self.init(title, titleStyle: titleStyle, footer: footer, content: content) { EmptyView() }
  }
}

/// The block alone: `divide-y rounded-xl border bg-foreground/[0.02]`.
public struct ListBlock<Content: View>: View {
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette

  public init(@ViewBuilder content: @escaping () -> Content) { self.content = content }

  public var body: some View {
    let shape = RoundedRectangle.kit(Radius.xl)
    VStack(spacing: 0) {
      Group(subviews: content()) { rows in
        ForEach(rows.indices, id: \.self) { index in
          if index > 0 { Separator() }
          rows[index]
        }
      }
    }
    .background(palette.foreground.opacity(0.02), in: shape)
    .clipShape(shape)
    .overlay { shape.strokeBorder(palette.border) }
  }
}

/// What a row shows at its end.
public enum ListRowAccessory: Sendable {
  /// It opens something: the web's ListItemButton chevron. The default for a row with an action.
  case chevron
  /// A check when it's the chosen one, as a row in a list of choices.
  case check(Bool)
  case none
}

/// A row in a list, as the web's ListItem and ListItemButton: `min-h-14
/// px-4 gap-3`, an icon, bare or on a tile (the web's RowIcon), a title
/// in `text-base` and a line under it, then a value, what's in `trailing`,
/// and the accessory. With an `action` the whole row is one tap target
/// that lights up under a finger. `destructive` paints it in the danger color.
public struct ListRow<Trailing: View>: View {
  let title: String
  let subtitle: String?
  let icon: Lucide?
  let iconTile: Bool
  let value: String?
  let accessory: ListRowAccessory?
  let destructive: Bool
  let action: (() -> Void)?
  @ViewBuilder let trailing: () -> Trailing
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType

  public init(
    _ title: String, subtitle: String? = nil, icon: Lucide? = nil, iconTile: Bool = false, value: String? = nil,
    accessory: ListRowAccessory? = nil, destructive: Bool = false, action: (() -> Void)? = nil,
    @ViewBuilder trailing: @escaping () -> Trailing
  ) {
    self.title = title
    self.subtitle = subtitle
    self.icon = icon
    self.iconTile = iconTile
    self.value = value
    self.accessory = accessory
    self.destructive = destructive
    self.action = action
    self.trailing = trailing
  }

  public var body: some View {
    if let action {
      Button(action: action) { face }
        .buttonStyle(KitPressStyle(shape: Rectangle(), ring: .inside))
        .accessibilityAddTraits(isChecked ? .isSelected : [])
    } else {
      face.accessibilityElement(children: .combine)
    }
  }

  private var isChecked: Bool {
    if case .check(true) = accessory { return true }
    return false
  }

  private var face: some View {
    let color = destructive ? palette.destructive : palette.foreground
    return HStack(spacing: Space.s3) {
      if let icon {
        if iconTile {
          LucideIcon(icon, size: 16, tint: destructive ? color : palette.mutedForeground)
            .frame(width: 36, height: 36)
            .background(palette.secondary, in: RoundedRectangle.kit(Radius.lg))
        } else {
          LucideIcon(icon, size: 20, tint: destructive ? color : palette.mutedForeground)
            .frame(minWidth: 24)
        }
      }
      VStack(alignment: .leading, spacing: 2) {
        Text(title).textStyle(.base).foregroundStyle(color)
        if let subtitle {
          Text(subtitle).textStyle(.sm).foregroundStyle(palette.mutedForeground)
        }
        // Under the title at the accessibility sizes, where there's no room beside it.
        if let value, dynamicType.isAccessibilitySize {
          Text(value).textStyle(.sm).foregroundStyle(palette.mutedForeground)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      if let value, !dynamicType.isAccessibilitySize {
        Text(value)
          .textStyle(.sm)
          .foregroundStyle(palette.mutedForeground)
          .lineLimit(1)
          .frame(maxWidth: 180, alignment: .trailing)
          .fixedSize(horizontal: false, vertical: true)
      }
      trailing()
      switch accessory ?? (action != nil && !destructive ? .chevron : .none) {
      case .chevron: LucideIcon(.chevronRight, size: 16, tint: palette.mutedForeground)
      case .check(let on): LucideIcon(.check, size: 18, tint: palette.accent).opacity(on ? 1 : 0)
      case .none: EmptyView()
      }
    }
    .padding(.horizontal, Space.s4)
    .padding(.vertical, Space.s2_5)
    .frame(minHeight: 56)
    .contentShape(Rectangle())
  }
}

extension ListRow where Trailing == EmptyView {
  public init(
    _ title: String, subtitle: String? = nil, icon: Lucide? = nil, iconTile: Bool = false, value: String? = nil,
    accessory: ListRowAccessory? = nil, destructive: Bool = false, action: (() -> Void)? = nil
  ) {
    self.init(
      title, subtitle: subtitle, icon: icon, iconTile: iconTile, value: value, accessory: accessory,
      destructive: destructive, action: action
    ) { EmptyView() }
  }
}

/// A setting's row, as the web's SettingRow: its name in `text-sm
/// font-medium`, `px-4 py-2.5`, and the control. The whole row toggles a
/// `SwitchRow`, as Android's does.
private struct SettingRowLayout<Control: View>: View {
  let title: String
  let subtitle: String?
  let icon: Lucide?
  let stacked: Bool
  var stacksWhenLarge = true
  @ViewBuilder let control: () -> Control
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType

  var body: some View {
    // At the accessibility sizes a name and a value no longer fit side by side.
    let stacked = stacked || (stacksWhenLarge && dynamicType.isAccessibilitySize)
    let text = VStack(alignment: .leading, spacing: 2) {
      Text(title).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground)
      if let subtitle { Text(subtitle).textStyle(.px13).foregroundStyle(palette.mutedForeground) }
    }
    Group {
      if stacked {
        VStack(alignment: .leading, spacing: Space.s2_5) {
          text
          control()
        }
      } else {
        HStack(spacing: Space.s3) {
          if let icon { LucideIcon(icon, size: 20, tint: palette.mutedForeground).frame(minWidth: 24) }
          text.frame(maxWidth: .infinity, alignment: .leading)
          control()
        }
      }
    }
    .padding(.horizontal, Space.s4)
    .padding(.vertical, Space.s2_5)
    .frame(minHeight: 52, alignment: .leading)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A setting that's on or off: its name and a `Switch`. A tap anywhere on
/// the row flips it, and VoiceOver reads the row as one switch.
public struct SwitchRow: View {
  let title: String
  let subtitle: String?
  let icon: Lucide?
  @Binding var isOn: Bool

  public init(_ title: String, subtitle: String? = nil, icon: Lucide? = nil, isOn: Binding<Bool>) {
    self.title = title
    self.subtitle = subtitle
    self.icon = icon
    self._isOn = isOn
  }

  public var body: some View {
    Toggle(isOn: $isOn) { Text(title) }
      .toggleStyle(RowToggleStyle(title: title, subtitle: subtitle, icon: icon))
  }
}

private struct RowToggleStyle: ToggleStyle {
  let title: String
  let subtitle: String?
  let icon: Lucide?

  func makeBody(configuration: Configuration) -> some View {
    Button {
      withMotion(Motion.enter) { configuration.isOn.toggle() }
    } label: {
      SettingRowLayout(title: title, subtitle: subtitle, icon: icon, stacked: false, stacksWhenLarge: false) {
        SwitchTrack(isOn: configuration.isOn)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(KitPressStyle(shape: Rectangle(), ring: .inside))
    .accessibilityRepresentation {
      Toggle(isOn: configuration.$isOn) { configuration.label }
        .accessibilityHint(subtitle ?? "")
    }
  }
}

/// A choice among `options`, as the web's SelectRow: its name, and the
/// `Select` under it on a phone (`stacked`, the web's `split` layout at
/// phone width), or its value at the row's end with a chevron, opening the
/// menu there, as Android's PickerRow (`stacked: false`).
public struct SelectRow<Value: Hashable>: View {
  let title: String
  let options: [(Value, String)]
  @Binding var selection: Value
  let stacked: Bool
  @State private var open = false
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType

  public init(_ title: String, selection: Binding<Value>, options: [(Value, String)], stacked: Bool = true) {
    self.title = title
    self._selection = selection
    self.options = options
    self.stacked = stacked
  }

  public var body: some View {
    if stacked {
      SettingRowLayout(title: title, subtitle: nil, icon: nil, stacked: true) {
        Select(title, selection: $selection, options: options)
      }
    } else {
      let current = options.first { $0.0 == selection }?.1 ?? ""
      Button {
        open = true
      } label: {
        SettingRowLayout(title: title, subtitle: nil, icon: nil, stacked: false) {
          HStack(spacing: 4) {
            Text(current).textStyle(.sm).foregroundStyle(palette.mutedForeground).lineLimit(1)
            LucideIcon(.chevronDown, size: 16, tint: palette.mutedForeground)
          }
          .frame(maxWidth: dynamicType.isAccessibilitySize ? nil : 180, alignment: .trailing)
          .dropdownMenu(isPresented: $open, align: .trailing) {
            ForEach(options.indices, id: \.self) { index in
              let option = options[index]
              MenuItem(option.1, selected: option.0 == selection) { selection = option.0 }
            }
          }
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(KitPressStyle(shape: Rectangle(), ring: .inside))
      .accessibilityLabel(title)
      .accessibilityValue(current)
    }
  }
}

/// A row that only tells something: its name, and the value at its end.
public struct ValueRow: View {
  let title: String
  let value: String
  @Environment(\.palette) private var palette

  public init(_ title: String, value: String) {
    self.title = title
    self.value = value
  }

  public var body: some View {
    SettingRowLayout(title: title, subtitle: nil, icon: nil, stacked: false) {
      Text(value).textStyle(.sm).foregroundStyle(palette.mutedForeground).multilineTextAlignment(.trailing)
    }
    .accessibilityElement(children: .combine)
  }
}
