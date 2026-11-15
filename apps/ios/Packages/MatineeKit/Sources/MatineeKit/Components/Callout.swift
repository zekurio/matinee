import SwiftUI

/// What a callout is about: news in the card's colors, or something wrong
/// on the danger color's tint.
public enum CalloutLook: Sendable {
  /// `default`: `bg-card`, the icon in the text color.
  case standard
  /// `destructive`: `border-destructive/40 bg-destructive/10`, the icon in the danger color.
  case destructive
}

/// A note that stays on a page because it holds something back, as the
/// web's Alert and its FormAlert: `rounded-lg border`, an icon beside a
/// `font-medium` title and a muted description, then `actions`, such as a
/// button to where it can be put right. A failed action gets a toast
/// instead. VoiceOver reads the words as one, then the actions.
///
///     Callout(Str.notSetUp, description: Str.finishInBrowser, icon: .info)
///     Callout(Str.failed, icon: .circleAlert, look: .destructive) {
///       MatineeButton(Str.openSettings, look: .outline, size: .sm) { open() }
///     }
public struct Callout<Actions: View>: View {
  let title: String?
  let description: String?
  let icon: Lucide?
  let look: CalloutLook
  @ViewBuilder let actions: () -> Actions
  @Environment(\.palette) private var palette

  public init(
    _ title: String?, description: String? = nil, icon: Lucide? = nil, look: CalloutLook = .standard,
    @ViewBuilder actions: @escaping () -> Actions
  ) {
    self.title = title
    self.description = description
    self.icon = icon
    self.look = look
    self.actions = actions
  }

  public var body: some View {
    let shape = RoundedRectangle.kit(Radius.lg)
    let destructive = look == .destructive
    HStack(alignment: .top, spacing: Space.s2_5) {
      if let icon {
        // `translate-y-0.5` on a 16-point icon, set on the first line's 20.
        LucideIcon(icon, size: 16, tint: destructive ? palette.destructive : palette.foreground)
          .padding(.top, 2)
      }
      VStack(alignment: .leading, spacing: Space.s3) {
        VStack(alignment: .leading, spacing: Space.s0_5) {
          if let title {
            Text(title).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground)
          }
          if let description {
            Text(description)
              .textStyle(.sm)
              .foregroundStyle(destructive ? palette.foreground.opacity(0.9) : palette.mutedForeground)
          }
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
        if Actions.self != EmptyView.self {
          HStack(spacing: Space.s2) { actions() }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.horizontal, Space.s3)
    .padding(.vertical, Space.s2_5)
    .background(destructive ? palette.destructiveSoft : palette.card, in: shape)
    .overlay { shape.strokeBorder(destructive ? palette.destructive.opacity(0.4) : palette.border) }
    .accessibilityElement(children: .contain)
  }
}

extension Callout where Actions == EmptyView {
  public init(_ title: String?, description: String? = nil, icon: Lucide? = nil, look: CalloutLook = .standard) {
    self.init(title, description: description, icon: icon, look: look) { EmptyView() }
  }
}
