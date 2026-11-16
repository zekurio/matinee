import MatineeCore
import MatineeKit
import Nuke
import OSLog
import SwiftUI
import UIKit

/// MatineeApp.kt's application: the one session and the one set of
/// downloads the app has, made at launch and kept for its life, with the
/// theme. The app delegate makes it, since the system may launch the app in
/// the background for a download before any scene, and the scene shares it.
@Observable final class AppModel {
  let session: MatineeSession
  let downloads: Downloads
  let theme = ThemeStore()
  let signInErrors = SignInErrors()
  /// The messages that pop up at the bottom, one host for the whole app (Root.swift).
  let toasts = ToastState()

  init() {
    let store = SessionStore()
    #if DEBUG
      DevLaunch.prepare(store)
    #endif
    session = MatineeSession(store: store, deviceName: UIDevice.current.name)
    downloads = Self.makeDownloads(session)
    // A server removed takes its downloads, what waited to reach it, and its artwork along.
    session.onRemove = { [downloads] origin, api in
      do {
        try await downloads.forgetServer(origin, api: api)
      } catch {
        AppLog.downloads.error("Could not remove a server's downloads")
      }
      ImagePipeline.forgetAll()
    }
    Task { [downloads] in await downloads.restore() }
    #if DEBUG
      DevLaunch.follow(session)
    #endif
  }

  private static func makeDownloads(_ session: MatineeSession) -> Downloads {
    let client: @MainActor (String) -> MatineeApi? = { [weak session] origin in
      session?.serverClient(origin: origin)?.api
    }
    do {
      return try Downloads(client: client)
    } catch {
      // Without its folder the app still runs; downloads just don't outlive the launch.
      AppLog.downloads.error("Could not open the downloads folder")
      let temporary = FileManager.default.temporaryDirectory.appending(path: "downloads")
      // SAFETY: a fresh folder in the app's own temporary directory can always be made.
      return try! Downloads(root: temporary, client: client)
    }
  }

  /// The browser handing back a sign-in code by opening the app, as when
  /// /authorize was opened outside the web sign-in sheet. The sheet itself
  /// gets its callback without this.
  func open(_ url: URL) {
    guard BrowserSignIn.isCallback(url) else { return }
    Task {
      do {
        try await session.finishBrowserSignIn(url)
        signInErrors.browser = nil
      } catch {
        signInErrors.browser = browserFailure(error)
      }
    }
  }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
  lazy var model = AppModel()

  func application(
    _ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    _ = model
    // Before launch finishes, as iOS requires: tapped notices and the background look for them.
    RequestNoticeDelivery.register(session: model.session)
    return true
  }

  /// A download's background session finished while the app wasn't running: the worker takes it over.
  func application(
    _ application: UIApplication, handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    // SAFETY: UIKit calls this on the main thread and takes the handler back there; the worker calls it on the main actor.
    nonisolated(unsafe) let completion = completionHandler
    let handled = model.downloads.worker.handleEventsForBackgroundURLSession(
      identifier: identifier, completionHandler: { completion() })
    if !handled { completion() }
  }

  func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?)
    -> UIInterfaceOrientationMask
  {
    Orientation.mask
  }
}

/// Which way the screen may turn: any way, but for the player on a phone,
/// which turns it to landscape as Android's player activity does, and lets
/// it go back.
///
/// An iPad's player follows the device instead. An iPad app that supports
/// multitasking isn't asked which way it may turn, so a lock there would
/// do nothing; and an iPad is held either way to watch, stood on a desk
/// upright as often as on its side, as Apple's own video apps let it be.
/// The player's controls lay out for both.
enum Orientation {
  private static var phone: Bool { UIDevice.current.userInterfaceIdiom == .phone }

  static var mask: UIInterfaceOrientationMask {
    locked ?? (phone ? .allButUpsideDown : .all)
  }
  private static var locked: UIInterfaceOrientationMask?

  static func lock(_ orientations: UIInterfaceOrientationMask) {
    guard phone else { return }
    UIDevice.current.beginGeneratingDeviceOrientationNotifications()
    locked = orientations
    update(orientations)
  }

  /// Lets go, turning the screen back the way the device is held.
  static func unlock() {
    guard phone, locked != nil else { return }
    locked = nil
    let held = UIDevice.current.orientation
    update(held.isLandscape ? .landscape : .portrait)
    UIDevice.current.endGeneratingDeviceOrientationNotifications()
  }

  private static func update(_ orientations: UIInterfaceOrientationMask) {
    for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
      scene.keyWindow?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
      scene.requestGeometryUpdate(.iOS(interfaceOrientations: orientations)) { _ in }
    }
  }
}

@main
struct MatineeApp: App {
  @UIApplicationDelegateAdaptor private var delegate: AppDelegate

  var body: some Scene {
    WindowGroup {
      let model = delegate.model
      root
        .environment(model.theme)
        .environment(model.session)
        .environment(model.downloads)
        .environment(model.signInErrors)
        .environment(model.toasts)
        .measuresWindow()
        .systemColors()
        .matineeTheme(model.theme)
        .onOpenURL(perform: model.open)
    }
  }

  @ViewBuilder private var root: some View {
    #if DEBUG
      // The components on the theme, for checking them: `-gallery YES` (Gallery.swift).
      if UserDefaults.standard.bool(forKey: "gallery") {
        GalleryRoot().environment(ViewerState())
      } else {
        MatineeRoot()
      }
    #else
      MatineeRoot()
    #endif
  }
}

extension View {
  /// The theme's colors on what UIKit still draws for SwiftUI: the spinner
  /// of pull to refresh, and the windows' tint and background, which the
  /// system's own sheets and transitions show. Goes once, on the root.
  fileprivate func systemColors() -> some View { modifier(SystemColors()) }
}

private struct SystemColors: ViewModifier {
  @Environment(\.palette) private var palette

  func body(content: Content) -> some View {
    content.onChange(of: palette, initial: true) { apply(palette.colors) }
  }

  private func apply(_ colors: ThemeColors) {
    UIRefreshControl.appearance().tintColor = colors.textDim.uiColor
    for scene in UIApplication.shared.connectedScenes {
      // Only the app's own windows: the system adds others over them, on an
      // iPad, which an opaque background would hide the app behind.
      for window in (scene as? UIWindowScene)?.windows ?? [] where window.windowLevel == .normal {
        window.tintColor = colors.accent.uiColor
        window.backgroundColor = colors.background.uiColor
      }
    }
  }
}
