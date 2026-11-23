import AVFoundation
import Flutter
import UIKit

/// The Apple TV app. tvOS runs Flutter on an engine patched for it, which no
/// plugin has a side for, so there is no generated plugin registrant: the
/// channels here are the app's own, the same ones the iPhone app answers
/// (`ios/Runner`), with [AppleTvBridge] for what a plugin keeps elsewhere.
@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var registrar: FlutterPluginRegistrar?
  private var player: PlayerBridge?
  private var playerSystem: PlayerSystem?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Playback, so the video's sound isn't the system's to mute; the player
    // activates the session when it plays.
    try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
    // The remote's play and pause can come as remote control events.
    application.beginReceivingRemoteControlEvents()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    let messenger = engineBridge.applicationRegistrar.messenger()
    // A registrar of the app's own, for the view controller showing Flutter.
    registrar = engineBridge.pluginRegistry.registrar(forPlugin: "Matinee")
    let controller = { [weak self] in self?.registrar?.viewController as? MatineeViewController }
    AppleTvApiSetup.setUp(binaryMessenger: messenger, api: AppleTvBridge())
    DeviceApiSetup.setUp(binaryMessenger: messenger, api: DeviceBridge())
    DisplayApiSetup.setUp(binaryMessenger: messenger, api: DisplayBridge())
    SystemApiSetup.setUp(binaryMessenger: messenger, api: SystemBridge())
    let player = PlayerBridge(messenger: messenger, controller: controller)
    self.player = player
    PlayerApiSetup.setUp(binaryMessenger: messenger, api: player)
    let playerSystem = PlayerSystem(messenger: messenger, player: player)
    self.playerSystem = playerSystem
    player.system = playerSystem
    PlayerSystemApiSetup.setUp(binaryMessenger: messenger, api: playerSystem)
  }

  /// Play/Pause on the remote, from [MatineeViewController].
  func playPausePressed() {
    playerSystem?.playPausePressed()
  }
}
