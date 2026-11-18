import SwiftUI

/// A rounded rectangle whose corners can differ, mirrored in right-to-left
/// layouts, or a capsule: the shapes buttons, chips, and halves of split
/// buttons take.
public struct KitShape: InsettableShape {
  var topLeading: CGFloat
  var bottomLeading: CGFloat
  var bottomTrailing: CGFloat
  var topTrailing: CGFloat
  var capsule = false
  var inset: CGFloat = 0

  public init(radius: CGFloat) {
    topLeading = radius
    bottomLeading = radius
    bottomTrailing = radius
    topTrailing = radius
  }

  public init(topLeading: CGFloat, bottomLeading: CGFloat, bottomTrailing: CGFloat, topTrailing: CGFloat) {
    self.topLeading = topLeading
    self.bottomLeading = bottomLeading
    self.bottomTrailing = bottomTrailing
    self.topTrailing = topTrailing
  }

  public static var capsule: KitShape {
    var shape = KitShape(radius: 0)
    shape.capsule = true
    return shape
  }

  /// This shape, or a capsule when `on`.
  public func capsule(_ on: Bool) -> KitShape {
    var shape = self
    shape.capsule = on
    return shape
  }

  public nonisolated func path(in rect: CGRect) -> Path {
    let rect = rect.insetBy(dx: inset, dy: inset)
    guard rect.width > 0, rect.height > 0 else { return Path() }
    if capsule { return Capsule(style: .circular).path(in: rect) }
    func r(_ value: CGFloat) -> CGFloat { min(max(0, value - inset), min(rect.width, rect.height) / 2) }
    return UnevenRoundedRectangle(
      topLeadingRadius: r(topLeading), bottomLeadingRadius: r(bottomLeading),
      bottomTrailingRadius: r(bottomTrailing), topTrailingRadius: r(topTrailing), style: .circular
    ).path(in: rect)
  }

  public nonisolated func inset(by amount: CGFloat) -> KitShape {
    var shape = self
    shape.inset += amount
    return shape
  }

  public nonisolated var layoutDirectionBehavior: LayoutDirectionBehavior { .mirrors }
}

/// The web's button variants, with Frosted for buttons over a picture and
/// Glass, white over a dark shade on a picture whatever the theme, as
/// Android's `ButtonLook` has them.
public enum ButtonLook: String, CaseIterable, Sendable {
  /// `default`: the accent, for the one thing a page is for.
  case primary
  case secondary
  /// The foreground at 15% over a blur, with a faint rim: Play's neighbours on a title's art.
  case frosted
  /// White at 15% over a blur, white text, whatever the theme: over a picture or the player.
  case glass
  /// The page's color at 60% over a blur, as the round `.floating` buttons
  /// beside it: the page above, in a pill beside Back over a title's art.
  case floating
  case outline
  case ghost
  /// The danger color on its own tint: Delete, Sign out.
  case destructive
  /// Accent text and nothing else, for a button inside a sentence.
  case link
}

/// How big a button is. The web's are sized for a pointer; on a phone a
/// button that stands alone is `.touch`, Android's 44, and the web's own
/// sizes are for dense places, where the kit still gives a finger 44
/// points to hit.
public enum ButtonSize: String, CaseIterable, Sendable {
  /// The web's `sm`: 32 tall, 13-point text.
  case sm
  /// The web's `default`: 36 tall.
  case md
  /// 44 tall, a finger's height, as Android's `MatineeButton`. The default.
  case touch

  var height: CGFloat {
    switch self {
    case .sm: 32
    case .md: 36
    case .touch: 44
    }
  }

  var padding: CGFloat {
    switch self {
    case .sm: 10
    case .md: 12
    case .touch: 16
    }
  }

  var gap: CGFloat {
    switch self {
    case .sm: 4
    case .md: 6
    case .touch: 8
    }
  }

  var text: TextSize { self == .sm ? .px13 : .sm }
  var icon: CGFloat { self == .sm ? 14 : 16 }
  var radius: CGFloat { self == .sm ? Radius.md : Radius.lg }
}

/// A button's outline: rounded all round (`rounded-lg`), a capsule, or
/// rounded on one side only, for half of a split button.
public enum ButtonShape: Sendable {
  case rounded, capsule, leadingHalf, trailingHalf

  func shape(radius: CGFloat) -> KitShape {
    switch self {
    case .rounded: KitShape(radius: radius)
    case .capsule: .capsule
    case .leadingHalf: KitShape(topLeading: radius, bottomLeading: radius, bottomTrailing: 0, topTrailing: 0)
    case .trailingHalf: KitShape(topLeading: 0, bottomLeading: 0, bottomTrailing: radius, topTrailing: radius)
    }
  }
}

/// A button as the web draws one:
///
///     MatineeButton("Play", icon: .play) { play() }
///     MatineeButton(look: .outline, size: .md, action: retry) {
///       LucideIcon(.refreshCw, size: 16)
///       Text("Try again")
///     }
///
/// `dimmed` draws it disabled while it still takes a tap, for a button
/// whose tap says why it can't do its job. `pending` swaps its icon for a
/// spinner and stops taps, while what it started runs.
public struct MatineeButton<Label: View>: View {
  let look: ButtonLook
  let size: ButtonSize
  let shape: ButtonShape
  let dimmed: Bool
  let pending: Bool
  let fullWidth: Bool
  let action: () -> Void
  @ViewBuilder let label: () -> Label

  public init(
    look: ButtonLook = .primary, size: ButtonSize = .touch, shape: ButtonShape = .rounded, dimmed: Bool = false,
    pending: Bool = false, fullWidth: Bool = false, action: @escaping () -> Void,
    @ViewBuilder label: @escaping () -> Label
  ) {
    self.look = look
    self.size = size
    self.shape = shape
    self.dimmed = dimmed
    self.pending = pending
    self.fullWidth = fullWidth
    self.action = action
    self.label = label
  }

  public var body: some View {
    Button(action: action) {
      ButtonFace(look: look, size: size, shape: shape, pending: pending, fullWidth: fullWidth, label: label)
    }
    .buttonStyle(
      KitPressStyle(
        shape: shape.shape(radius: size.radius), wash: look != .link, washColor: look == .glass ? .white : nil,
        // Pending stays at full strength, as the web's FeedbackButton: it's busy, not unavailable.
        dimsWhenDisabled: !pending, hitInset: max(0, (TouchTarget - size.height) / 2))
    )
    .opacity(dimmed ? 0.5 : 1)
    .disabled(pending)
  }
}

extension MatineeButton where Label == ButtonLabel {
  /// A button with text and, before it, an icon.
  public init(
    _ title: String, icon: Lucide? = nil, look: ButtonLook = .primary, size: ButtonSize = .touch,
    shape: ButtonShape = .rounded, dimmed: Bool = false, pending: Bool = false, fullWidth: Bool = false,
    action: @escaping () -> Void
  ) {
    self.init(
      look: look, size: size, shape: shape, dimmed: dimmed, pending: pending, fullWidth: fullWidth, action: action
    ) {
      ButtonLabel(title: title, icon: icon, iconSize: size.icon, pending: pending)
    }
  }
}

/// A button's text and leading icon, or a spinner in the icon's place while pending.
public struct ButtonLabel: View {
  let title: String
  let icon: Lucide?
  let iconSize: CGFloat
  let pending: Bool

  public var body: some View {
    if pending {
      Spinner(size: iconSize)
    } else if let icon {
      LucideIcon(icon, size: iconSize)
    }
    Text(title)
  }
}

private struct ButtonFace<Label: View>: View {
  let look: ButtonLook
  let size: ButtonSize
  let shape: ButtonShape
  let pending: Bool
  let fullWidth: Bool
  @ViewBuilder let label: () -> Label
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

  var body: some View {
    let outline = shape.shape(radius: size.radius)
    HStack(spacing: size.gap) { label() }
      .textStyle(size.text, weight: .medium)
      // One line, as the web's; two at the accessibility sizes rather than cut off.
      .lineLimit(dynamicType.isAccessibilitySize ? 2 : 1)
      .multilineTextAlignment(.center)
      .foregroundStyle(foreground)
      .underline(look == .link)
      .padding(.horizontal, look == .link ? 0 : size.padding)
      .padding(.vertical, dynamicType.isAccessibilitySize ? 6 : 0)
      .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: size.height)
      .background {
        if [.frosted, .glass, .floating].contains(look), !reduceTransparency {
          outline.fill(.ultraThinMaterial).environment(\.colorScheme, look == .glass ? .dark : palette.scheme)
        }
      }
      .background(background, in: outline)
      .overlay {
        if let border { outline.strokeBorder(border, lineWidth: 1) }
      }
      .contentShape(outline)
  }

  private var foreground: Color {
    switch look {
    case .primary: palette.accentForeground
    case .secondary, .outline, .frosted, .floating: palette.foreground
    case .ghost: palette.foreground.opacity(0.75)
    case .glass: .white
    case .destructive: palette.destructive
    case .link: palette.accent
    }
  }

  private var background: Color {
    switch look {
    case .primary: palette.accent
    case .secondary: palette.secondary
    case .frosted: palette.foreground.opacity(0.15)
    case .glass: reduceTransparency ? .black.opacity(0.6) : .white.opacity(0.15)
    case .floating: palette.background.opacity(reduceTransparency ? 0.9 : 0.6)
    case .destructive: palette.colors.danger.opacity(palette.isDark ? 0.2 : 0.1)
    case .outline, .ghost, .link: .clear
    }
  }

  private var border: Color? {
    switch look {
    case .outline: palette.input
    case .frosted: palette.foreground.opacity(0.1)
    case .glass: .white.opacity(0.15)
    default: nil
    }
  }
}

extension Palette {
  /// The color scheme this palette draws, for the system materials under glass.
  public var scheme: ColorScheme { isDark ? .dark : .light }
}

/// The look of a round icon button: the web's `size-*` icon buttons and the
/// bars' and title pages' round buttons.
public enum IconButtonLook: String, CaseIterable, Sendable {
  /// `--secondary`: the watched and favorite buttons beside Play.
  case secondary
  /// Nothing behind it until it's pressed: a bar's Back.
  case ghost
  /// The foreground at 15% over a blur, with a faint rim.
  case frosted
  /// White at 15% over a blur, white icon: on a picture or the player.
  case glass
  /// The page's color at 60% over a blur: Back and Home over a title's art, the web's `ItemTopBar`.
  case floating
  case primary
  case outline
}

/// A round button with one icon, as the web's `size-icon` buttons and
/// Android's `RoundIconButton`. `label` is what VoiceOver reads, and what
/// a long press shows at the large text sizes. A circle smaller than 44
/// points still takes 44 to hit, so it never steals a neighbour's tap.
public struct RoundIconButton: View {
  let icon: Lucide
  let label: String
  let look: IconButtonLook
  let size: CGFloat
  let iconSize: CGFloat
  let tint: Color?
  let selected: Bool
  let action: () -> Void
  @Environment(\.palette) private var palette
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

  /// `size` is the circle, 36 as the web's `size-9` unless given; `iconSize` the glyph, 20 unless given.
  public init(
    _ icon: Lucide, label: String, look: IconButtonLook = .secondary, size: CGFloat = 36, iconSize: CGFloat? = nil,
    tint: Color? = nil, selected: Bool = false, action: @escaping () -> Void
  ) {
    self.icon = icon
    self.label = label
    self.look = look
    self.size = size
    self.iconSize = iconSize ?? (size >= 44 ? 22 : size >= 36 ? 20 : 16)
    self.tint = tint
    self.selected = selected
    self.action = action
  }

  public var body: some View {
    Button(action: action) {
      LucideIcon(icon, size: iconSize, tint: tint ?? foreground, scales: false)
        .frame(width: size, height: size)
        .background {
          if [.frosted, .glass, .floating].contains(look), !reduceTransparency {
            Circle().fill(.ultraThinMaterial).environment(\.colorScheme, look == .glass ? .dark : palette.scheme)
          }
        }
        .background(background, in: Circle())
        .overlay {
          if let border { Circle().strokeBorder(border, lineWidth: 1) }
        }
    }
    .buttonStyle(
      KitPressStyle(
        shape: Circle(), washColor: look == .glass ? .white : nil, hitInset: max(0, (TouchTarget - size) / 2))
    )
    .accessibilityLabel(label)
    .accessibilityAddTraits(selected ? .isSelected : [])
    // The circle keeps its size at large text sizes; a long press shows it bigger, with its name.
    .accessibilityShowsLargeContentViewer {
      Image(icon)
      Text(label)
    }
  }

  private var foreground: Color {
    switch look {
    case .primary: palette.accentForeground
    case .glass: .white
    default: palette.foreground
    }
  }

  private var background: Color {
    switch look {
    case .secondary: palette.secondary
    case .ghost: selected ? palette.foreground.opacity(0.1) : .clear
    case .frosted: palette.foreground.opacity(0.15)
    case .glass: reduceTransparency ? .black.opacity(0.6) : .white.opacity(0.15)
    case .floating: palette.background.opacity(reduceTransparency ? 0.9 : 0.6)
    case .primary: palette.accent
    case .outline: .clear
    }
  }

  private var border: Color? {
    switch look {
    case .frosted: palette.foreground.opacity(0.1)
    case .glass: .white.opacity(0.15)
    case .outline: palette.input
    default: nil
    }
  }
}
