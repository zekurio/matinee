import Flutter
import UIKit

/// The storyboard's Flutter view controller, with what the player needs of
/// it: a view the video shows through, and the fullscreen the player route
/// asks for.
final class MatineeViewController: FlutterViewController {
  /// The player route that asked for fullscreen, which alone can let it go.
  private var fullscreenOwner: Int64?

  override func viewDidLoad() {
    super.viewDidLoad()
    // Flutter's view is opaque by default, which would hide the video the
    // player puts beneath it. Unpainted pixels then show the window, so the
    // window gets the app's background for the moment before Flutter's first
    // frame.
    isViewOpaque = false
    view.backgroundColor = .clear
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    view.window?.backgroundColor = UIColor(red: 0x0E / 255.0, green: 0x0E / 255.0, blue: 0x10 / 255.0, alpha: 1)
  }

  var fullscreen: Bool { fullscreenOwner != nil }

  func setFullscreen(owner: Int64, enabled: Bool) {
    if enabled {
      fullscreenOwner = owner
    } else if fullscreenOwner == owner {
      fullscreenOwner = nil
    } else {
      return
    }
    setNeedsStatusBarAppearanceUpdate()
    setNeedsUpdateOfHomeIndicatorAutoHidden()
    updateOrientation()
  }

  override var prefersStatusBarHidden: Bool { fullscreen || super.prefersStatusBarHidden }

  override var prefersHomeIndicatorAutoHidden: Bool { fullscreen || super.prefersHomeIndicatorAutoHidden }

  /// A phone turns the video sideways, as the Android player does below
  /// 600dp; an iPad stays as it's held.
  override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
    fullscreen && traitCollection.userInterfaceIdiom == .phone ? .landscape : super.supportedInterfaceOrientations
  }

  private func updateOrientation() {
    setNeedsUpdateOfSupportedInterfaceOrientations()
    guard let scene = view.window?.windowScene else { return }
    scene.requestGeometryUpdate(.iOS(interfaceOrientations: supportedInterfaceOrientations)) { _ in }
  }
}
