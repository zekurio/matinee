#if os(tvOS)
  import SwiftUI

  /*
   * A dialog on a TV: a question in the middle of the screen, over the page
   * dimmed as a side panel dims it, with its answers as rows under it. For
   * what stops everything and wants an answer: signing out, a server that
   * changed. A choice among several things, or a card's actions, goes in a
   * side panel instead, which keeps the page in view.
   *
   * Focus starts on the answer marked `preferred`, the safe one, and stays
   * in the dialog; Menu closes it as Cancel would. Each answer closes the
   * dialog and then runs, so what it opens arrives once the dialog has gone.
   */

  /// An answer in a `tvDialog`: a row, `destructive` in the danger color.
  /// `preferred` takes focus as the dialog opens: the one that changes
  /// nothing, as Cancel, unless the dialog is a plain notice.
  public struct TVDialogButton: Identifiable {
    public let id: String
    public let label: String
    public let icon: Lucide?
    public let destructive: Bool
    public let preferred: Bool
    public let action: @MainActor () -> Void

    public init(
      _ label: String, icon: Lucide? = nil, destructive: Bool = false, preferred: Bool = false, id: String? = nil,
      action: @escaping @MainActor () -> Void = {}
    ) {
      self.id = id ?? label
      self.label = label
      self.icon = icon
      self.destructive = destructive
      self.preferred = preferred
      self.action = action
    }
  }

  extension View {
    /// A dialog in the middle of a TV screen while `isPresented`: `title`,
    /// `message` under it, and `buttons` as rows. Menu closes it.
    ///
    ///     .tvDialog(isPresented: $asking, title: "Sign out?", message: "…", buttons: [
    ///       TVDialogButton("Sign out", icon: .logOut, destructive: true) { signOut() },
    ///       TVDialogButton("Cancel", icon: .x, preferred: true),
    ///     ])
    public func tvDialog(
      isPresented: Binding<Bool>, title: String, message: String? = nil, buttons: [TVDialogButton],
      onDismiss: (() -> Void)? = nil
    ) -> some View {
      kitOverlay(isPresented: isPresented, onDismiss: onDismiss) { visible in
        TVDialogLayer(
          visible: visible, title: title, message: message, buttons: buttons,
          close: { isPresented.wrappedValue = false })
      }
    }

    /// Asks before something that can't be undone: `confirm`, in the danger
    /// color unless it's harmless, over `cancel`, which has focus.
    /// `onConfirm` runs once the dialog has gone.
    public func tvConfirmDialog(
      isPresented: Binding<Bool>, title: String, message: String? = nil, confirm: String, confirmIcon: Lucide? = nil,
      cancel: String, destructive: Bool = true, onConfirm: @escaping @MainActor () -> Void
    ) -> some View {
      tvDialog(
        isPresented: isPresented, title: title, message: message,
        buttons: [
          TVDialogButton(confirm, icon: confirmIcon, destructive: destructive, id: "confirm", action: onConfirm),
          TVDialogButton(cancel, icon: .x, preferred: true, id: "cancel"),
        ])
    }
  }

  /// The dialog's width: room for a question of two lines at the TV's size.
  public enum TVDialogs {
    public static let width: CGFloat = 1040
  }

  private struct TVDialogLayer: View {
    let visible: Bool
    let title: String
    let message: String?
    let buttons: [TVDialogButton]
    let close: () -> Void
    @FocusState private var focused: String?
    @Environment(\.palette) private var palette
    @Environment(\.overlayDismiss) private var dismiss

    var body: some View {
      ZStack {
        Color.black.opacity(palette.isDark ? 0.6 : 0.45)
          .ignoresSafeArea()
          .opacity(visible ? 1 : 0)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 0) {
          Text(title).textStyle(.headline).foregroundStyle(palette.foreground)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, TVListItems.inset)
            .accessibilityAddTraits(.isHeader)
          if let message {
            Text(message).textStyle(.body).foregroundStyle(palette.mutedForeground)
              .fixedSize(horizontal: false, vertical: true)
              .padding(.horizontal, TVListItems.inset)
              .padding(.top, TVSpace.s2)
          }
          VStack(spacing: TVListItems.gap) {
            ForEach(buttons) { button in
              TVListItem(button.label, icon: button.icon, destructive: button.destructive) {
                dismiss(then: button.action)
              }
              .focused($focused, equals: button.id)
            }
          }
          .padding(.top, TVSpace.s7)
          .focusSection()
        }
        .padding(48)
        .frame(width: TVDialogs.width, alignment: .leading)
        .background(palette.popover, in: RoundedRectangle.kit(TVRadius.lg))
        .overlay { RoundedRectangle.kit(TVRadius.lg).strokeBorder(palette.hairline) }
        .shadow(color: .black.opacity(0.4), radius: 48, y: 16)
        .scaleEffect(visible ? 1 : 0.96)
        // Never quite gone: the focus engine gives first focus only to what it can see as the dialog opens.
        .opacity(visible ? 1 : 0.4)
        .defaultFocus($focused, (buttons.first(where: \.preferred) ?? buttons.first)?.id)
      }
      .ignoresSafeArea()
      .closesOnExit(close)
    }
  }
#endif
