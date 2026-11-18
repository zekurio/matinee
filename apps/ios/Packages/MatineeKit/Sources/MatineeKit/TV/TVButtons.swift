#if os(tvOS)
  import SwiftUI

  /// The size TV buttons share, so a row of them lines up.
  public enum TVButtons {
    /// Apple's own buttons are 86 points; Android TV's 48 dp would be 96.
    public static let height: CGFloat = 88
    public static let iconSize: CGFloat = 40
    /// Between buttons in a row.
    public static let gap: CGFloat = 24
  }

  /// A pill button for TV pages and the player: an `icon`, if any, and
  /// `label`, with `detail` after it, dimmer, like the time left, and a
  /// `trailingIcon` at its end, like the chevron of one that opens a choice.
  /// `active` marks one whose choice is in force, like a filter that narrows
  /// a grid, in the accent. Focused, it fills with the text color. `rest`
  /// replaces the fill it has without focus, as for one on the moving picture.
  ///
  ///     TVButton("Resume", icon: .play, detail: "18 min left") { play() }
  public struct TVButton: View {
    let label: String
    let icon: Lucide?
    let detail: String?
    let trailingIcon: Lucide?
    let active: Bool
    let rest: Color?
    let action: () -> Void
    @Environment(\.palette) private var palette

    public init(
      _ label: String, icon: Lucide? = nil, detail: String? = nil, trailingIcon: Lucide? = nil, active: Bool = false,
      rest: Color? = nil, action: @escaping () -> Void
    ) {
      self.label = label
      self.icon = icon
      self.detail = detail
      self.trailingIcon = trailingIcon
      self.active = active
      self.rest = rest
      self.action = action
    }

    public var body: some View {
      TVControlButton(
        shape: Capsule(), rest: rest ?? (active ? palette.accentSoft : nil), content: active ? palette.accent : nil,
        action: action
      ) {
        TVButtonFace(label: label, icon: icon, detail: detail, trailingIcon: trailingIcon)
      }
    }
  }

  private struct TVButtonFace: View {
    let label: String
    let icon: Lucide?
    let detail: String?
    let trailingIcon: Lucide?

    var body: some View {
      HStack(spacing: 20) {
        if let icon { LucideIcon(icon, size: TVButtons.iconSize, scales: false) }
        // The label keeps its length; a detail too long for the row gives way.
        Text(label).textStyle(.facts).lineLimit(1).fixedSize()
        if let detail { Text(detail).textStyle(.facts).lineLimit(1).opacity(0.65) }
        if let trailingIcon { LucideIcon(trailingIcon, size: 32, scales: false).opacity(0.7) }
      }
      .padding(.leading, icon == nil ? 48 : 40)
      .padding(.trailing, trailingIcon == nil ? 48 : 32)
      .frame(height: TVButtons.height)
    }
  }

  /// A round button beside a `TVButton`, its icon alone until it takes
  /// focus, when it opens to say `label`. `tint` colors the icon, like the
  /// accent on a watched mark, while it's not focused.
  ///
  ///     TVIconButton(.heart, label: "Favorite") { toggle() }
  public struct TVIconButton: View {
    let icon: Lucide
    let label: String
    let tint: Color?
    let action: () -> Void

    public init(_ icon: Lucide, label: String, tint: Color? = nil, action: @escaping () -> Void) {
      self.icon = icon
      self.label = label
      self.tint = tint
      self.action = action
    }

    public var body: some View {
      TVControlButton(shape: Capsule(), content: tint, action: action) {
        IconButtonFace(icon: icon, label: label)
      }
      .accessibilityLabel(label)
    }
  }

  private struct IconButtonFace: View {
    let icon: Lucide
    let label: String
    @Environment(\.tvFocused) private var focused
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
      HStack(spacing: 0) {
        LucideIcon(icon, size: TVButtons.iconSize, scales: false)
        if focused {
          Text(label).textStyle(.facts).lineLimit(1).fixedSize()
            .padding(.leading, 20)
            .padding(.trailing, 8)
            .transition(.opacity)
        }
      }
      .padding(.horizontal, 24)
      .frame(minWidth: TVButtons.height, minHeight: TVButtons.height)
      .animation(Motion.animation(focused ? Motion.enter : Motion.exit, reduceMotion: reduceMotion), value: focused)
    }
  }

  /// A round button that stays an icon, like the search field's clear or
  /// the player's play and pause, `size` across. `label` names it for
  /// VoiceOver. `lit` gives it the focused look ahead of focus, for one
  /// about to take it as it appears.
  ///
  ///     TVRoundButton(.pause, label: "Pause") { player.pause() }
  public struct TVRoundButton<Content: View>: View {
    let label: String
    let size: CGFloat
    let lit: Bool
    let action: () -> Void
    @ViewBuilder let content: () -> Content

    public init(
      label: String, size: CGFloat = TVButtons.height, lit: Bool = false, action: @escaping () -> Void,
      @ViewBuilder content: @escaping () -> Content
    ) {
      self.label = label
      self.size = size
      self.lit = lit
      self.action = action
      self.content = content
    }

    public var body: some View {
      TVControlButton(shape: Circle(), lit: lit, action: action) {
        content().frame(width: size, height: size)
      }
      .accessibilityLabel(label)
    }
  }

  extension TVRoundButton where Content == LucideIcon {
    /// A round button with an icon, 42% of it across.
    public init(_ icon: Lucide, label: String, size: CGFloat = TVButtons.height, lit: Bool = false, action: @escaping () -> Void) {
      self.init(label: label, size: size, lit: lit, action: action) {
        LucideIcon(icon, size: (size * 0.42).rounded(), scales: false)
      }
    }
  }

  /// A small pill, like a genre or a studio that leads to its titles, or a
  /// season's tab. `selected` marks the one in force, in the accent, as an
  /// active `TVButton` is. Focused, it fills with the text color.
  ///
  ///     TVChip("Drama") { open(genre) }
  public struct TVChip: View {
    let label: String
    let selected: Bool
    let action: () -> Void
    @Environment(\.palette) private var palette

    public init(_ label: String, selected: Bool = false, action: @escaping () -> Void) {
      self.label = label
      self.selected = selected
      self.action = action
    }

    public var body: some View {
      TVControlButton(
        shape: Capsule(), rest: selected ? palette.accentSoft : nil, content: selected ? palette.accent : nil,
        action: action
      ) {
        Text(label).textStyle(.label).lineLimit(1)
          .padding(.horizontal, 36)
          .padding(.vertical, 18)
      }
      .accessibilityAddTraits(selected ? .isSelected : [])
    }
  }
#endif
