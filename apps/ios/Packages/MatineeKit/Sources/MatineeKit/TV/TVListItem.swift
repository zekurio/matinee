#if os(tvOS)
  import SwiftUI

  /// How list rows on TV pages and panels look: rounded, a quiet fill or
  /// none, and the text color filling them on focus.
  public enum TVListItems {
    public static let radius: CGFloat = TVRadius.row
    /// A row with one line; one with a subtitle grows to fit it.
    public static let height: CGFloat = 96
    /// Between a row's edge and its content; text beside a list lines up with its rows' text by it.
    public static let inset: CGFloat = 40
    /// Between rows.
    public static let gap: CGFloat = 8
  }

  /// A row of a TV list, like a server to connect to or a setting: an
  /// icon, a title and a line under it, and `trailing` at its end, such as
  /// a `TVListValue` or a `TVListSwitch`. Focused, it fills with the text
  /// color and its content inverts. `quiet` rows have no fill until
  /// focused, for long lists like Settings and a panel's choices; the rest
  /// have a faint one, so a few large targets read as such. A `selected`
  /// row, like the category whose rows show beside it, keeps a fill and the
  /// accent while focus is elsewhere. A `checked` row, the choice in force
  /// in a panel, has a check at its end.
  ///
  ///     TVListItem("Subtitles", icon: .captions, quiet: true) { open() } trailing: {
  ///       TVListValue("English")
  ///     }
  public struct TVListItem<Leading: View, Trailing: View>: View {
    let title: String
    let subtitle: String?
    let icon: Lucide?
    let quiet: Bool
    let selected: Bool
    let destructive: Bool
    let checked: Bool
    let action: () -> Void
    let onLongPress: (() -> Void)?
    @ViewBuilder let leading: () -> Leading
    @ViewBuilder let trailing: () -> Trailing
    @Environment(\.palette) private var palette

    public init(
      _ title: String, subtitle: String? = nil, icon: Lucide? = nil, quiet: Bool = false, selected: Bool = false,
      destructive: Bool = false, checked: Bool = false, action: @escaping () -> Void, onLongPress: (() -> Void)? = nil,
      @ViewBuilder leading: @escaping () -> Leading, @ViewBuilder trailing: @escaping () -> Trailing
    ) {
      self.title = title
      self.subtitle = subtitle
      self.icon = icon
      self.quiet = quiet
      self.selected = selected
      self.destructive = destructive
      self.checked = checked
      self.action = action
      self.onLongPress = onLongPress
      self.leading = leading
      self.trailing = trailing
    }

    public var body: some View {
      let rest: Color =
        selected ? palette.foreground.opacity(0.1) : quiet ? .clear : palette.foreground.opacity(0.07)
      let content: Color? = destructive ? palette.destructive : selected ? palette.accent : nil
      TVControlButton(
        shape: RoundedRectangle.kit(TVListItems.radius), rest: rest, content: content, scale: TVFocus.rowScale,
        action: action, onLongPress: onLongPress
      ) {
        RowFace(
          title: title, subtitle: subtitle, icon: icon, tinted: destructive || selected, checked: checked,
          leading: leading, trailing: trailing)
      }
    }
  }

  extension TVListItem where Leading == EmptyView {
    public init(
      _ title: String, subtitle: String? = nil, icon: Lucide? = nil, quiet: Bool = false, selected: Bool = false,
      destructive: Bool = false, checked: Bool = false, action: @escaping () -> Void, onLongPress: (() -> Void)? = nil,
      @ViewBuilder trailing: @escaping () -> Trailing
    ) {
      self.init(
        title, subtitle: subtitle, icon: icon, quiet: quiet, selected: selected, destructive: destructive,
        checked: checked, action: action, onLongPress: onLongPress, leading: { EmptyView() }, trailing: trailing)
    }
  }

  extension TVListItem where Leading == EmptyView, Trailing == EmptyView {
    public init(
      _ title: String, subtitle: String? = nil, icon: Lucide? = nil, quiet: Bool = false, selected: Bool = false,
      destructive: Bool = false, checked: Bool = false, action: @escaping () -> Void, onLongPress: (() -> Void)? = nil
    ) {
      self.init(
        title, subtitle: subtitle, icon: icon, quiet: quiet, selected: selected, destructive: destructive,
        checked: checked, action: action, onLongPress: onLongPress, leading: { EmptyView() }, trailing: { EmptyView() })
    }
  }

  private struct RowFace<Leading: View, Trailing: View>: View {
    let title: String
    let subtitle: String?
    let icon: Lucide?
    let tinted: Bool
    let checked: Bool
    @ViewBuilder let leading: () -> Leading
    @ViewBuilder let trailing: () -> Trailing
    @Environment(\.tvFocused) private var focused
    @Environment(\.palette) private var palette

    var body: some View {
      HStack(spacing: 32) {
        if Leading.self != EmptyView.self {
          leading()
        } else if let icon {
          LucideIcon(icon, size: 48, scales: false).opacity(focused || tinted ? 1 : 0.7)
        }
        VStack(alignment: .leading, spacing: 0) {
          Text(title).textStyle(.facts).lineLimit(1)
          if let subtitle {
            Text(subtitle).textStyle(.caption).lineLimit(2)
              .foregroundStyle(focused ? palette.background.opacity(0.7) : palette.mutedForeground)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        trailing()
        if checked {
          LucideIcon(.check, size: 44, tint: focused ? nil : palette.accent, scales: false)
        }
      }
      .padding(.horizontal, TVListItems.inset)
      .padding(.vertical, 20)
      .frame(maxWidth: .infinity, minHeight: TVListItems.height)
    }
  }

  /// A setting's value at the end of its row, with the chevron of a row
  /// that opens a choice.
  public struct TVListValue: View {
    let value: String
    let chevron: Bool

    public init(_ value: String, chevron: Bool = true) {
      self.value = value
      self.chevron = chevron
    }

    public var body: some View {
      HStack(spacing: 12) {
        Text(value).textStyle(.label).lineLimit(1).opacity(0.7).frame(maxWidth: 480, alignment: .trailing)
        if chevron { LucideIcon(.chevronRight, size: 40, scales: false).opacity(0.6) }
      }
    }
  }

  /// An on and off switch at the end of a row, drawn in the row's content
  /// color so it reads focused or not.
  public struct TVListSwitch: View {
    let isOn: Bool
    @Environment(\.palette) private var palette
    @Environment(\.tvFocused) private var focused
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(_ isOn: Bool) { self.isOn = isOn }

    public var body: some View {
      let content = focused ? palette.background : palette.foreground
      Capsule()
        .fill(isOn ? palette.accent : content.opacity(0.25))
        .frame(width: 96, height: 56)
        .overlay(alignment: isOn ? .trailing : .leading) {
          Circle().fill(isOn ? palette.accentForeground : content.opacity(0.9))
            .frame(width: 40, height: 40)
            .padding(8)
        }
        .animation(Motion.animation(Motion.move, reduceMotion: reduceMotion), value: isOn)
        .accessibilityHidden(true)
    }
  }

  /// One part of a value that Left and Right step, as a row: a day, a
  /// month, a year, a subtitle delay. Arrows either side show while it's
  /// focused; `onStep` gets -1 or 1. Select runs `action`, if there is one.
  ///
  ///     TVStepRow(day.formatted(.dateTime.day())) { day.add(days: $0) }
  public struct TVStepRow: View {
    let value: String
    let title: String?
    let label: String?
    let onStep: (Int) -> Void
    let action: () -> Void
    @Environment(\.palette) private var palette

    /// With a `title`, the row reads as a setting, the title at its start
    /// and the value at its end; without one, the value is centred, as a
    /// part of a date. `label` is what VoiceOver calls it, the title unless given.
    public init(
      _ value: String, title: String? = nil, label: String? = nil, action: @escaping () -> Void = {},
      onStep: @escaping (Int) -> Void
    ) {
      self.value = value
      self.title = title
      self.label = label ?? title
      self.onStep = onStep
      self.action = action
    }

    public var body: some View {
      TVControlButton(
        shape: RoundedRectangle.kit(TVListItems.radius), rest: palette.foreground.opacity(0.07), scale: TVFocus.rowScale,
        action: action
      ) {
        StepFace(value: value, title: title)
      }
      .onMoveCommand { direction in
        switch direction {
        case .left: onStep(-1)
        case .right: onStep(1)
        default: break
        }
      }
      .accessibilityLabel(label ?? value)
      .accessibilityValue(value)
      .accessibilityAdjustableAction { direction in
        switch direction {
        case .increment: onStep(1)
        case .decrement: onStep(-1)
        @unknown default: break
        }
      }
    }
  }

  private struct StepFace: View {
    let value: String
    let title: String?
    @Environment(\.tvFocused) private var focused

    var body: some View {
      HStack(spacing: 24) {
        if let title {
          Text(title).textStyle(.facts).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
          LucideIcon(.chevronLeft, size: 40, scales: false).opacity(focused ? 0.8 : 0)
          Text(value).textStyle(.label).lineLimit(1).opacity(focused ? 1 : 0.7)
          LucideIcon(.chevronRight, size: 40, scales: false).opacity(focused ? 0.8 : 0)
        } else {
          LucideIcon(.chevronLeft, size: 40, scales: false).opacity(focused ? 1 : 0)
          Text(value).textStyle(.facts).lineLimit(1).frame(maxWidth: .infinity)
          LucideIcon(.chevronRight, size: 40, scales: false).opacity(focused ? 1 : 0)
        }
      }
      .padding(.horizontal, TVListItems.inset)
      .frame(maxWidth: .infinity, minHeight: TVListItems.height)
    }
  }

  /// A heading over a group of rows in a TV list, in line with their text.
  public struct TVListHeading: View {
    let text: String
    @Environment(\.palette) private var palette

    public init(_ text: String) { self.text = text }

    public var body: some View {
      Text(text).textStyle(.label).foregroundStyle(palette.mutedForeground).lineLimit(1)
        .padding(.leading, TVListItems.inset)
        .padding(.top, 24)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
    }
  }
#endif
