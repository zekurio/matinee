// What Dart asks of the system around the app: picking a file, the app's
// own log, and handing text to other apps. `just flutter pigeon` writes the
// Dart and Kotlin sides; don't edit those.
import 'package:pigeon/pigeon.dart';

@ConfigurePigeon(
  PigeonOptions(
    dartOut: 'lib/platform/system.g.dart',
    kotlinOut:
        'android/app/src/main/kotlin/io/github/zekurio/matinee/system/System.g.kt',
    kotlinOptions: KotlinOptions(package: 'io.github.zekurio.matinee.system'),
    copyrightHeader: 'pigeons/header.txt',
  ),
)
/// An image the person picked: its media type as the system says it, and
/// its first bytes, up to the limit asked plus one, so Dart can tell a file
/// over the limit without the whole of it crossing the bridge.
class PickedImage {
  PickedImage({required this.type, required this.bytes});

  /// Like `image/png`; null when the system doesn't say.
  final String? type;

  /// Null when the file couldn't be read.
  final Uint8List? bytes;
}

@HostApi()
abstract class SystemApi {
  /// Opens the system's photo picker for one image, as the Kotlin app's
  /// `PickVisualMedia`, and answers with it, or null when the person backs
  /// out. Reads at most [maxBytes] plus one.
  @async
  PickedImage? pickImage(int maxBytes);
}
