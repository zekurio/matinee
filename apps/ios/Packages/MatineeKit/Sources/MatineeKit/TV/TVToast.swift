#if os(tvOS)
  import SwiftUI

  /*
   * Toasts on a TV: the phone's `ToastState`, drawn at the TV's size. A
   * message rises at the bottom of the screen, clear of the drawer's rail,
   * and goes by itself, as Android TV's snackbar does. Nothing in it takes
   * focus, so a toast never pulls focus off the card the person was on:
   * a toast's action (Undo) isn't offered on a TV, and what needs an answer
   * goes in a `.tvSidePanel` or a `.tvDialog` instead.
   */

  extension View {
    /// Where `state`'s toasts show on a TV: at the bottom, centred between
    /// the drawer's rail and the right margin. Goes once, on the root, as
    /// `.toastHost` does on a phone; screens post to the same `ToastState`.
    public func tvToastHost(_ state: ToastState) -> some View {
      modifier(TVToastHost(state: state))
    }
  }

  private struct TVToastHost: ViewModifier {
    let state: ToastState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
      content
        .overlay(alignment: .bottom) {
          ZStack {
            if let message = state.current {
              TVToast(message)
                .id(message.id)
                .transition(
                  reduceMotion
                    ? .opacity
                    : .asymmetric(
                      insertion: .move(edge: .bottom).combined(with: .opacity),
                      removal: .opacity.combined(with: .scale(scale: 0.96))))
            }
          }
          .frame(maxWidth: .infinity)
          .padding(.leading, TVPage.start)
          .padding(.trailing, TVPage.end)
          .padding(.bottom, TVOverscan.vertical + TVSpace.s6)
          .allowsHitTesting(false)
          .animation(
            Motion.animation(state.current == nil ? Motion.exit : Motion.move, reduceMotion: reduceMotion),
            value: state.current?.id)
        }
        .ignoresSafeArea()
    }
  }

  /// One toast at a TV's size: the popover color in a rounded block with a
  /// shadow, the status icon before the title, the description under it.
  public struct TVToast: View {
    let message: ToastMessage
    @Environment(\.palette) private var palette

    public init(_ message: ToastMessage) { self.message = message }

    public var body: some View {
      HStack(alignment: .center, spacing: TVSpace.s5) {
        icon
        VStack(alignment: .leading, spacing: 4) {
          Text(message.title).textStyle(.body, weight: .medium).foregroundStyle(palette.foreground).lineLimit(2)
          if let description = message.description {
            Text(description).textStyle(.caption).foregroundStyle(palette.mutedForeground).lineLimit(2)
          }
        }
        .fixedSize(horizontal: false, vertical: true)
      }
      // As wide as it says, up to the room between the drawer's rail and the right margin.
      .padding(.horizontal, 48)
      .padding(.vertical, 28)
      .background(palette.popover, in: RoundedRectangle.kit(TVRadius.lg))
      .overlay { RoundedRectangle.kit(TVRadius.lg).strokeBorder(palette.hairline) }
      .shadow(color: .black.opacity(palette.isDark ? 0.5 : 0.18), radius: 32, y: 12)
      .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var icon: some View {
      switch message.kind {
      case .plain: EmptyView()
      case .success: LucideIcon(.circleCheck, size: 44, tint: palette.success, scales: false)
      case .info: LucideIcon(.info, size: 44, tint: palette.mutedForeground, scales: false)
      case .warning: LucideIcon(.triangleAlert, size: 44, tint: palette.warning, scales: false)
      case .error: LucideIcon(.octagonX, size: 44, tint: palette.destructive, scales: false)
      case .loading: Spinner(size: 44, tint: palette.mutedForeground)
      }
    }
  }
#endif
