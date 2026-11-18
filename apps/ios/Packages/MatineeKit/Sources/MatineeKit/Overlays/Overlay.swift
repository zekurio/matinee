import SwiftUI

/*
 * How the kit puts its own overlays, dialogs and menus, above everything,
 * system sheets included, without the system's look. Each is a full-screen
 * cover with a clear background, shown and hidden with the system's
 * animation turned off, so the kit's own motion, the web's fade and zoom,
 * plays inside it. A cover keeps what makes a modal a modal: VoiceOver
 * stays inside it, and the presenting view's environment, objects a screen
 * put there included, reaches its content, so what's inside a dialog reads
 * the same environment as the screen that opened it.
 */

/// Closes the overlay something is in, then runs `then` once it's gone,
/// so a dialog an item opens doesn't arrive while its menu is leaving.
public struct OverlayDismiss: Sendable {
  let close: @MainActor @Sendable (_ then: (@MainActor () -> Void)?) -> Void

  @MainActor public func callAsFunction(then action: (@MainActor () -> Void)? = nil) { close(action) }
}

extension EnvironmentValues {
  /// Inside a kit dialog or menu: closes it. Elsewhere it does nothing.
  @Entry public var overlayDismiss = OverlayDismiss { action in action?() }
}

/// Mounts the cover without the system's animation, lets the layer animate
/// itself in from `visible`, and on the way out animates it away before
/// taking the cover down, then runs what was queued to run after.
struct OverlayPresenter<Layer: View>: ViewModifier {
  @Binding var isPresented: Bool
  let onDismiss: (() -> Void)?
  @ViewBuilder let layer: (_ visible: Bool) -> Layer

  @State private var mounted = false
  @State private var visible = false
  @State private var after: [@MainActor () -> Void] = []
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.layoutDirection) private var direction
  @Environment(\.dynamicTypeSize) private var dynamicType
  @Environment(\.locale) private var locale

  func body(content: Content) -> some View {
    content
      .onChange(of: isPresented, initial: true) { _, present in
        if present { open() } else { close() }
      }
      .fullScreenCover(isPresented: $mounted, onDismiss: finish) {
        layer(visible)
          .environment(
            \.overlayDismiss,
            OverlayDismiss { action in
              if let action { after.append(action) }
              isPresented = false
            }
          )
          // A presentation takes these from UIKit's traits rather than from
          // the view that presents it; a view that set its own keeps them.
          .environment(\.layoutDirection, direction)
          .environment(\.dynamicTypeSize, dynamicType)
          .environment(\.locale, locale)
          .presentationBackground(.clear)
          .onAppear {
            withAnimation(Motion.animation(Motion.enter, reduceMotion: reduceMotion)) { visible = true }
          }
      }
  }

  private func open() {
    guard !mounted else { return }
    visible = false
    withoutAnimation { mounted = true }
  }

  private func close() {
    guard mounted else { return }
    withAnimation(Motion.animation(Motion.exit, reduceMotion: reduceMotion)) {
      visible = false
    } completion: {
      withoutAnimation { mounted = false }
    }
  }

  private func finish() {
    // Dismissed some other way, as a scene going away: keep the binding true to what shows.
    if isPresented { isPresented = false }
    onDismiss?()
    let actions = after
    after = []
    // After the cover has gone, so whatever comes next can present.
    DispatchQueue.main.async { actions.forEach { $0() } }
  }
}

extension View {
  /// Presents `layer` over everything while `isPresented` is true, drawn
  /// entirely by the caller from `visible`, which turns true once it's up
  /// and false before it goes, inside an animation of the kit's timing.
  func kitOverlay<Layer: View>(
    isPresented: Binding<Bool>, onDismiss: (() -> Void)? = nil, @ViewBuilder layer: @escaping (Bool) -> Layer
  ) -> some View {
    modifier(OverlayPresenter(isPresented: isPresented, onDismiss: onDismiss, layer: layer))
  }
}

/// The backdrop under a dialog: the page's own background at 60% over a
/// slight blur, so what's underneath stays visible as context instead of
/// dropping to black (lib/modal.ts). A tap on it does `onTap`.
struct Backdrop: View {
  let visible: Bool
  var blur = true
  let onTap: (() -> Void)?
  @Environment(\.palette) private var palette
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

  var body: some View {
    ZStack {
      if blur, !reduceTransparency {
        Rectangle().fill(.ultraThinMaterial).environment(\.colorScheme, palette.scheme).opacity(0.5)
      }
      Rectangle().fill(palette.background.opacity(reduceTransparency ? 0.85 : 0.6))
    }
    .ignoresSafeArea()
    .opacity(visible ? 1 : 0)
    .contentShape(Rectangle())
    .onTapGesture { onTap?() }
    .accessibilityHidden(true)
  }
}

extension View {
  /// Escape on a keyboard and Menu on a remote close the overlay this is in.
  func closesOnExit(_ close: @escaping () -> Void) -> some View {
    self
      #if os(tvOS)
        .onExitCommand(perform: close)
      #else
        .onKeyPress(.escape) {
          close()
          return .handled
        }
      #endif
      .accessibilityAction(.escape, close)
  }
}
