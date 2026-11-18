import SwiftUI

/*
 * A panel of choices from the trailing edge, drawn in the window it's on
 * rather than presented, for the player's audio, subtitle, quality, and
 * speed menus. The web opens those as a Drawer from the bottom on a touch
 * screen; held sideways, a phone's sheet would cover the picture the
 * choice is about, so Android's player slides a panel in from the side
 * and the kit does the same, in the Drawer's glass with its rows. A
 * presentation of its own would also bring back the status bar and the
 * home indicator the player hides.
 */

extension View {
  /// A panel that slides in from the trailing edge over this view while
  /// `isPresented`, over the web's backdrop, which closes it when tapped.
  /// `title` heads it beside a close button. Its `PanelChoice`s close it as
  /// they pick. Escape on a keyboard and VoiceOver's escape close it too.
  ///
  ///     .sidePanel(isPresented: $open, title: "Audio") {
  ///       PanelChoice("English", detail: "AAC · Stereo", selected: true) { pick(english) }
  ///     }
  public func sidePanel<Panel: View>(
    isPresented: Binding<Bool>, title: String? = nil, @ViewBuilder content: @escaping () -> Panel
  ) -> some View {
    modifier(SidePanelModifier(isPresented: isPresented, title: title, panel: content))
  }
}

extension EnvironmentValues {
  /// Inside a side panel: closes it, then runs what's passed.
  @Entry public var sidePanelDismiss = OverlayDismiss { action in action?() }
}

private struct SidePanelModifier<Panel: View>: ViewModifier {
  @Binding var isPresented: Bool
  let title: String?
  @ViewBuilder let panel: () -> Panel
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    content.overlay {
      GeometryReader { proxy in
        // Android's 42% of the width, from 300 to 420, leaving some picture beside it.
        let width = min(max(0, proxy.size.width - 48), min(420, max(300, proxy.size.width * 0.42)))
        ZStack(alignment: .trailing) {
          if isPresented {
            Backdrop(visible: true) { isPresented = false }
              .transition(.opacity)
            PanelBody(title: title, close: { isPresented = false }, content: panel)
              .frame(width: width)
              .frame(maxHeight: .infinity)
              .transition(reduceMotion ? .opacity : .move(edge: .trailing))
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
        .environment(
          \.sidePanelDismiss,
          OverlayDismiss { action in
            isPresented = false
            action?()
          })
      }
      .animation(
        Motion.animation(isPresented ? Motion.move : Motion.exit, reduceMotion: reduceMotion), value: isPresented)
    }
  }
}

private struct PanelBody<Content: View>: View {
  let title: String?
  let close: () -> Void
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette
  @Environment(\.locale) private var locale

  var body: some View {
    // Round on the side facing the picture, `rounded-l-xl`, mirrored right to left.
    let shape = KitShape(topLeading: Radius.xl, bottomLeading: Radius.xl, bottomTrailing: 0, topTrailing: 0)
    VStack(alignment: .leading, spacing: 0) {
      if let title {
        HStack(spacing: Space.s2) {
          Text(title)
            .textStyle(.base, weight: .semibold, tracking: .tight)
            .foregroundStyle(palette.foreground)
            .lineLimit(2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
          RoundIconButton(.x, label: KitText.close(locale), look: .ghost, size: 36, action: close)
        }
        .padding(.leading, Space.s5)
        .padding(.trailing, Space.s3)
        .padding(.vertical, Space.s2)
        // To the screen's edge, under the safe area beside it.
        Separator(color: palette.foreground.opacity(0.1)).ignoresSafeArea(edges: .trailing)
      }
      ScrollView {
        VStack(alignment: .leading, spacing: 0) { content() }
          .padding(.horizontal, Space.s2)
          .padding(.vertical, Space.s2)
      }
      .scrollBounceBehavior(.basedOnSize)
    }
    .padding(.top, Space.s2)
    .foregroundStyle(palette.foreground)
    .background {
      Rectangle().fill(.clear)
        .glassBackground(in: shape)
        .overlay { shape.strokeBorder(palette.hairline) }
        .kitShadow(.dialog)
        .ignoresSafeArea(edges: [.vertical, .trailing])
    }
    .contentShape(Rectangle())
    .accessibilityElement(children: .contain)
    .accessibilityAddTraits(.isModal)
    .closesOnExit(close)
  }
}

/// One choice in a side panel, as the web's Drawer row for a menu's
/// choices: `min-h-12 rounded-lg px-3 text-sm`, small print after it in
/// `text-xs font-medium text-foreground/70`, and a check when it's the one
/// picked. VoiceOver hears it as a button, selected when it's picked. A tap
/// runs `action` and closes the panel; a disabled one only dims.
public struct PanelChoice: View {
  let title: String
  let detail: String?
  let selected: Bool
  let enabled: Bool
  let action: @MainActor () -> Void
  @Environment(\.palette) private var palette
  @Environment(\.sidePanelDismiss) private var dismiss

  public init(
    _ title: String, detail: String? = nil, selected: Bool = false, enabled: Bool = true,
    action: @escaping @MainActor () -> Void
  ) {
    self.title = title
    self.detail = detail
    self.selected = selected
    self.enabled = enabled
    self.action = action
  }

  public var body: some View {
    Button {
      action()
      dismiss()
    } label: {
      HStack(spacing: 0) {
        Text(title)
          .textStyle(.sm, weight: selected ? .medium : .regular)
          .foregroundStyle(palette.foreground)
          .frame(maxWidth: .infinity, alignment: .leading)
        if let detail, !detail.isEmpty {
          Text(detail)
            .textStyle(.xs, weight: .medium)
            .foregroundStyle(palette.foreground.opacity(0.7))
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
            .padding(.leading, Space.s4)
        }
        LucideIcon(.check, size: 16, tint: palette.foreground, scales: false)
          .opacity(selected ? 1 : 0)
          .padding(.leading, Space.s3)
      }
      .padding(.horizontal, Space.s3)
      .padding(.vertical, Space.s2)
      .frame(minHeight: 48)
      .contentShape(Rectangle())
    }
    .buttonStyle(KitPressStyle(shape: RoundedRectangle.kit(Radius.lg), ring: .inside))
    .disabled(!enabled)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

/// A line of quiet text in a side panel, as for a list with nothing in it:
/// `text-sm` muted, as the web's Drawer says it.
public struct PanelNote: View {
  let text: String
  @Environment(\.palette) private var palette

  public init(_ text: String) { self.text = text }

  public var body: some View {
    Text(text)
      .textStyle(.sm)
      .foregroundStyle(palette.mutedForeground)
      .padding(.horizontal, Space.s3)
      .padding(.vertical, Space.s3)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A group's name in a side panel, over its choices: `text-xs font-medium`
/// muted, as a menu's label.
public struct PanelLabel: View {
  let text: String
  @Environment(\.palette) private var palette

  public init(_ text: String) { self.text = text }

  public var body: some View {
    Text(text)
      .textStyle(.xs, weight: .medium)
      .foregroundStyle(palette.mutedForeground)
      .padding(.horizontal, Space.s3)
      .padding(.top, Space.s2)
      .padding(.bottom, Space.s1)
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityAddTraits(.isHeader)
  }
}

/// The rule between groups in a side panel, as the web's `mt-2 border-t pt-2`.
public struct PanelSeparator: View {
  @Environment(\.palette) private var palette

  public init() {}

  public var body: some View {
    Separator(color: palette.foreground.opacity(0.1)).padding(.vertical, Space.s2)
  }
}
