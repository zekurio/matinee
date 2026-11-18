#if os(tvOS)
  import SwiftUI
  import UIKit

  /*
   * A tap on the Siri Remote's touch surface, which isn't a press: the
   * focus engine and SwiftUI's buttons hear only the click. A player shows
   * its controls for a tap as for a click, as Apple TV's own player does.
   */

  extension View {
    /// Hears a tap on the remote's touch surface while `isEnabled`: a
    /// light touch that lifts without moving or clicking. A click is Select,
    /// which the focused button hears, so a tap that clicks counts only as
    /// the click. Like `onTVPress`, it hears taps wherever focus is: give it
    /// `isEnabled` only while what it's on has focus.
    public func onTVTap(isEnabled: Bool = true, perform action: @escaping () -> Void) -> some View {
      background(TapListener(isEnabled: isEnabled, action: action))
    }
  }

  private struct TapListener: UIViewRepresentable {
    let isEnabled: Bool
    let action: () -> Void

    func makeUIView(context: Context) -> TapListenerView { TapListenerView() }

    func updateUIView(_ view: TapListenerView, context: Context) {
      view.recognizer.action = action
      view.recognizer.isEnabled = isEnabled
    }

    static func dismantleUIView(_ view: TapListenerView, coordinator: ()) {
      view.recognizer.view?.removeGestureRecognizer(view.recognizer)
    }
  }

  final class TapListenerView: UIView {
    let recognizer = SurfaceTapRecognizer()

    override var canBecomeFocused: Bool { false }

    override func didMoveToWindow() {
      super.didMoveToWindow()
      if let window { window.addGestureRecognizer(recognizer) } else { recognizer.view?.removeGestureRecognizer(recognizer) }
    }
  }

  /// A tap of the touch surface that fails once the surface clicks, so a
  /// click goes to the focused button alone. It takes nothing from anything
  /// else: touches and presses go on as ever.
  final class SurfaceTapRecognizer: UITapGestureRecognizer {
    var action: (() -> Void)?

    init() {
      super.init(target: nil, action: nil)
      addTarget(self, action: #selector(tapped))
      allowedTouchTypes = [NSNumber(value: UITouch.TouchType.indirect.rawValue)]
      // Listens to Select only to fail on it.
      allowedPressTypes = [NSNumber(value: UIPress.PressType.select.rawValue)]
      cancelsTouchesInView = false
      delaysTouchesBegan = false
      delaysTouchesEnded = false
    }

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent) {
      state = .failed
    }

    override func canPrevent(_ preventedGestureRecognizer: UIGestureRecognizer) -> Bool { false }

    @objc private func tapped() {
      if state == .ended { action?() }
    }
  }
#endif
