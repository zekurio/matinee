import SwiftUI

extension View {
  /// A dialog as the web's: a popover panel in the middle of the screen,
  /// `rounded-xl` with a hairline ring, at most `max-w-sm` and 16 points
  /// clear of the edges, its title and `description` over `content`, and
  /// its buttons in a footer under a line. On a phone the web stacks the
  /// buttons full width with the main one on top, so `footer` lists them
  /// in that order, usually as `DialogButton`s. `centered` centers the
  /// title, as the web's alert dialogs do on a phone; `showsClose` adds the
  /// round close button in the corner. A tap outside closes it unless
  /// `dismissible` is off.
  public func dialog<Content: View, Footer: View>(
    isPresented: Binding<Bool>, title: String, description: String? = nil, centered: Bool = false,
    showsClose: Bool = false, dismissible: Bool = true, onDismiss: (() -> Void)? = nil,
    @ViewBuilder content: @escaping () -> Content, @ViewBuilder footer: @escaping () -> Footer
  ) -> some View {
    kitOverlay(isPresented: isPresented, onDismiss: onDismiss) { visible in
      DialogLayer(
        visible: visible, title: title, description: description, centered: centered, showsClose: showsClose,
        dismissible: dismissible, maxWidth: centered ? 320 : 384, content: content, footer: footer)
    }
  }

  /// A dialog with no content between its words and its buttons.
  public func dialog<Footer: View>(
    isPresented: Binding<Bool>, title: String, description: String? = nil, centered: Bool = false,
    showsClose: Bool = false, dismissible: Bool = true, onDismiss: (() -> Void)? = nil,
    @ViewBuilder footer: @escaping () -> Footer
  ) -> some View {
    dialog(
      isPresented: isPresented, title: title, description: description, centered: centered, showsClose: showsClose,
      dismissible: dismissible, onDismiss: onDismiss, content: { EmptyView() }, footer: footer)
  }

  /// Asks before something that can't be undone, as the web's AlertDialog
  /// and Android's `ConfirmDialog`: `confirm` names it, in the destructive
  /// look unless it's harmless, over Cancel. `onConfirm` runs once the
  /// dialog has gone.
  public func confirmDialog(
    isPresented: Binding<Bool>, title: String, message: String? = nil, confirm: String, destructive: Bool = true,
    onConfirm: @escaping @MainActor () -> Void
  ) -> some View {
    dialog(isPresented: isPresented, title: title, description: message, centered: true) {
      DialogButton(confirm, look: destructive ? .destructive : .primary, action: onConfirm)
      DialogButton.cancel()
    }
  }
}

/// A dialog footer's button: full width, as the web's are on a phone. It
/// closes the dialog and then runs `action`, unless `closes` is off, as
/// for a Save that checks what was typed first.
public struct DialogButton: View {
  let title: String
  let look: ButtonLook
  let closes: Bool
  let pending: Bool
  let action: @MainActor () -> Void
  @Environment(\.overlayDismiss) private var dismiss

  public init(
    _ title: String, look: ButtonLook = .outline, closes: Bool = true, pending: Bool = false,
    action: @escaping @MainActor () -> Void
  ) {
    self.title = title
    self.look = look
    self.closes = closes
    self.pending = pending
    self.action = action
  }

  public var body: some View {
    MatineeButton(title, look: look, pending: pending, fullWidth: true) {
      if closes { dismiss(then: action) } else { action() }
    }
  }

  /// Cancel: closes the dialog and does nothing else.
  public static func cancel() -> some View { CancelButton() }
}

private struct CancelButton: View {
  @Environment(\.locale) private var locale

  var body: some View {
    DialogButton(KitText.cancel(locale)) {}
  }
}

private struct DialogLayer<Content: View, Footer: View>: View {
  let visible: Bool
  let title: String
  let description: String?
  let centered: Bool
  let showsClose: Bool
  let dismissible: Bool
  let maxWidth: CGFloat
  @ViewBuilder let content: () -> Content
  @ViewBuilder let footer: () -> Footer
  @Environment(\.palette) private var palette
  @Environment(\.overlayDismiss) private var dismiss
  @Environment(\.locale) private var locale
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let shape = RoundedRectangle.kit(Radius.xl)
    ZStack {
      Backdrop(visible: visible) { if dismissible { dismiss() } }
      VStack(spacing: 0) {
        VStack(alignment: centered ? .center : .leading, spacing: Space.s4) {
          VStack(alignment: centered ? .center : .leading, spacing: Space.s1_5) {
            Text(title)
              .textStyle(.base, weight: .medium)
              .foregroundStyle(palette.foreground)
              .accessibilityAddTraits(.isHeader)
            if let description {
              Text(description)
                .textStyle(.sm)
                .foregroundStyle(palette.mutedForeground)
            }
          }
          .multilineTextAlignment(centered ? .center : .leading)
          .frame(maxWidth: .infinity, alignment: centered ? .center : .leading)
          .padding(.trailing, showsClose && !centered ? Space.s6 : 0)
          content()
        }
        .padding(Space.s4)
        Separator()
        // The web's footer is bg-muted/50 under a line, which on the popover is the popover.
        VStack(spacing: Space.s2) { footer() }
          .padding(Space.s4)
      }
      .frame(maxWidth: maxWidth)
      .background(palette.popover, in: shape)
      .overlay { shape.strokeBorder(palette.hairline) }
      .overlay(alignment: .topTrailing) {
        if showsClose {
          RoundIconButton(.x, label: KitText.close(locale), look: .ghost, size: 32, iconSize: 16) { dismiss() }
            .padding(Space.s2)
        }
      }
      .clipShape(shape)
      .kitShadow(.dialog)
      .padding(Space.s4)
      .scaleEffect(visible || reduceMotion ? 1 : 0.95)
      .opacity(visible ? 1 : 0)
      .accessibilityAddTraits(.isModal)
      .accessibilityElement(children: .contain)
    }
    .closesOnExit { if dismissible { dismiss() } }
  }
}
