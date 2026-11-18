import SwiftUI

/// A person's picture, or their initials on the muted surface, as the
/// web's Avatar: round, with a hairline rim, 32 points unless given (the
/// web's `sm` is 24, `lg` 40). The kit doesn't load pictures; pass the
/// loaded one, or nil while there's none. `dot` adds the accent dot at its
/// corner, as the web's avatar shows while requests wait for an admin.
public struct Avatar<Picture: View>: View {
  let name: String
  let size: CGFloat
  let dot: Bool
  @ViewBuilder let picture: () -> Picture
  @Environment(\.palette) private var palette

  public init(_ name: String, size: CGFloat = 32, dot: Bool = false, @ViewBuilder picture: @escaping () -> Picture) {
    self.name = name
    self.size = size
    self.dot = dot
    self.picture = picture
  }

  public var body: some View {
    Circle()
      .fill(palette.muted)
      .overlay {
        Text(Self.initials(name))
          .font(RedHatText.font(fixedSize: (size * (size <= 24 ? 0.5 : 0.4375)).rounded(), weight: .medium))
          .lineLimit(1)
          .foregroundStyle(palette.mutedForeground)
      }
      .overlay { picture() }
      .clipShape(Circle())
      .overlay { Circle().strokeBorder(palette.border) }
      .frame(width: size, height: size)
      .overlay(alignment: .bottomTrailing) {
        if dot {
          let side = size <= 24 ? 8.0 : size <= 32 ? 10 : 12
          Circle().fill(palette.accent)
            .frame(width: side, height: side)
            .overlay { Circle().strokeBorder(palette.background, lineWidth: 2).padding(-2) }
        }
      }
      .accessibilityElement()
      .accessibilityLabel(name)
      .accessibilityAddTraits(.isImage)
  }

  /// The first letters of the first and last words, or the first letter alone.
  public static func initials(_ name: String) -> String {
    let words = name.split(whereSeparator: \.isWhitespace)
    let letters = [words.first, words.count > 1 ? words.last : nil].compactMap { $0?.first }
    return String(letters).uppercased()
  }
}

extension Avatar where Picture == EmptyView {
  public init(_ name: String, size: CGFloat = 32, dot: Bool = false) {
    self.init(name, size: size, dot: dot) { EmptyView() }
  }
}

/// A page or section with nothing to show, or a failure, as the web's
/// Empty: an icon on a muted tile, a title, a line under it, and what can
/// be done about it.
public struct EmptyState<Actions: View>: View {
  let icon: Lucide?
  let title: String
  let description: String?
  @ViewBuilder let actions: () -> Actions
  @Environment(\.palette) private var palette

  public init(
    icon: Lucide? = nil, title: String, description: String? = nil, @ViewBuilder actions: @escaping () -> Actions
  ) {
    self.icon = icon
    self.title = title
    self.description = description
    self.actions = actions
  }

  public var body: some View {
    VStack(spacing: Space.s4) {
      VStack(spacing: Space.s2) {
        if let icon {
          LucideIcon(icon, size: 20, tint: palette.foreground, scales: false)
            .frame(width: 40, height: 40)
            .background(palette.muted, in: RoundedRectangle.kit(Radius.lg))
            .padding(.bottom, Space.s2)
        }
        Text(title)
          .textStyle(.base, weight: .medium, tracking: .tight)
          .foregroundStyle(palette.foreground)
          .accessibilityAddTraits(.isHeader)
        if let description {
          Text(description)
            .textStyle(.sm)
            .foregroundStyle(palette.mutedForeground)
        }
      }
      .multilineTextAlignment(.center)
      .frame(maxWidth: 384)
      actions()
    }
    .padding(Space.s6)
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .contain)
  }
}

extension EmptyState where Actions == EmptyView {
  public init(icon: Lucide? = nil, title: String, description: String? = nil) {
    self.init(icon: icon, title: title, description: description) { EmptyView() }
  }
}
