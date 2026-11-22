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

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Playback, so the sound plays on with the screen locked and picture in
    // picture can open; the player activates the session when it plays.
    try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback, policy: .longFormVideo)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
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
