import AVFoundation
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  /// Made at launch rather than with the Flutter engine: the system starts
  /// the app in the background for the download session's events, with no
  /// scene and no Dart.
  private let downloads = Downloads()
  private var registrar: FlutterPluginRegistrar?
  private var player: PlayerBridge?
  private var playerSystem: PlayerSystem?
  private var downloadsBridge: DownloadsBridge?
  private var scanner: ScannerBridge?
  private var system: SystemBridge?

  override init() {
    AppDelegate.discardSwiftScenes()
    super.init()
  }

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Playback, so the sound plays on with the screen locked and picture in
    // picture can open; the player activates the session when it plays.
    try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback, policy: .longFormVideo)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  /// The SwiftUI app this one installs over left its scene session saved,
  /// and UIKit restores a session as it was made: with SwiftUI's scene
  /// delegate and no storyboard, so no window and no Flutter, only black.
  /// An iPhone can't destroy its one session, so the saved state goes before
  /// UIKit reads it, which happens after the delegate is made. Until
  /// `DeviceBridge.freshStart` has run, any saved state is the SwiftUI app's.
  private static func discardSwiftScenes() {
    let files = FileManager.default
    let support = files.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    if files.fileExists(atPath: support.appendingPathComponent(DeviceBridge.freshStartMarker).path) { return }
    let library = files.urls(for: .libraryDirectory, in: .userDomainMask)[0]
    let bundle = Bundle.main.bundleIdentifier ?? "io.github.zekurio.matinee"
    try? files.removeItem(at: library.appendingPathComponent("Saved Application State/\(bundle).savedState"))
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    let messenger = engineBridge.applicationRegistrar.messenger()
    // A registrar of the app's own, for the view controller showing Flutter.
    registrar = engineBridge.pluginRegistry.registrar(forPlugin: "Matinee")
    let controller = { [weak self] in self?.registrar?.viewController as? MatineeViewController }
    let window = { controller()?.view.window }
    DeviceApiSetup.setUp(binaryMessenger: messenger, api: DeviceBridge())
    DisplayApiSetup.setUp(binaryMessenger: messenger, api: DisplayBridge())
    let system = SystemBridge(presenter: { controller().map(topmost) })
    self.system = system
    SystemApiSetup.setUp(binaryMessenger: messenger, api: system)
    let scanner = ScannerBridge(textures: engineBridge.applicationRegistrar.textures(), messenger: messenger)
    self.scanner = scanner
    ScannerApiSetup.setUp(binaryMessenger: messenger, api: scanner)
    let player = PlayerBridge(messenger: messenger, controller: controller)
    self.player = player
    PlayerApiSetup.setUp(binaryMessenger: messenger, api: player)
    let playerSystem = PlayerSystem(messenger: messenger, player: player, window: window)
    self.playerSystem = playerSystem
    player.system = playerSystem
    PlayerSystemApiSetup.setUp(binaryMessenger: messenger, api: playerSystem)
    let downloadsBridge = DownloadsBridge(downloads: downloads, messenger: messenger)
    self.downloadsBridge = downloadsBridge
    DownloadsHostApiSetup.setUp(binaryMessenger: messenger, api: downloadsBridge)
  }

  override func application(
    _ application: UIApplication, handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    if !downloads.handleEvents(identifier, completion: completionHandler) {
      super.application(
        application, handleEventsForBackgroundURLSession: identifier, completionHandler: completionHandler)
    }
  }
}

/// What a sheet opens over: the view controller on top of [root].
private func topmost(_ root: UIViewController) -> UIViewController {
  var top = root
  while let presented = top.presentedViewController { top = presented }
  return top
}
