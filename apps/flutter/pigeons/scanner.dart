// The camera reading QR codes, for signing in another device from
// Settings, Account. `just flutter pigeon` writes the Dart and Kotlin
// sides; don't edit those.
import 'package:pigeon/pigeon.dart';

@ConfigurePigeon(
  PigeonOptions(
    dartOut: 'lib/platform/scanner.g.dart',
    kotlinOut:
        'android/app/src/main/kotlin/io/github/zekurio/matinee/scanner/Scanner.g.kt',
    kotlinOptions: KotlinOptions(package: 'io.github.zekurio.matinee.scanner'),
    copyrightHeader: 'pigeons/header.txt',
  ),
)
/// The camera's picture, as a texture Flutter draws.
class ScannerView {
  ScannerView({
    required this.textureId,
    required this.width,
    required this.height,
    required this.quarterTurns,
    required this.mirrored,
  });

  final int textureId;

  /// The picture's size as the camera sends it, before [quarterTurns].
  final int width;
  final int height;

  /// Clockwise quarter turns that stand the picture upright on the screen.
  final int quarterTurns;

  /// True for a front camera, whose picture shows as a mirror would.
  final bool mirrored;
}

@HostApi()
abstract class ScannerApi {
  /// Whether the device has a camera at all, which a TV mostly doesn't.
  bool hasCamera();

  /// Whether the app may use the camera.
  bool cameraAllowed();

  /// Asks for the camera, and answers whether it's allowed now. Android
  /// stops showing the prompt after the second no, and answers no at once.
  @async
  bool requestCamera();

  /// The app's page in the system settings, where the camera can be
  /// allowed after Android stopped asking.
  void openAppSettings();

  /// Starts the back camera, or the front one when there's no back one,
  /// with every frame read for a QR code, which [ScannerEvents.scanned]
  /// gets. Fails when the camera can't start.
  @async
  ScannerView start();

  /// Stops the camera and lets its texture go.
  void stop();
}

@FlutterApi()
abstract class ScannerEvents {
  /// What a QR code in the picture holds. The same text comes again at
  /// most twice a second while it stays in view.
  void scanned(String text);
}
