// What the player asks of the device around the video: the levels a swipe
// sets, and picture in picture. `just flutter pigeon` writes the Dart and Kotlin sides.
import 'package:pigeon/pigeon.dart';

@ConfigurePigeon(
  PigeonOptions(
    dartOut: 'lib/platform/player_system.g.dart',
    kotlinOut:
        'android/app/src/main/kotlin/io/github/zekurio/matinee/player/system/PlayerSystem.g.kt',
    kotlinOptions: KotlinOptions(
      package: 'io.github.zekurio.matinee.player.system',
    ),
    copyrightHeader: 'pigeons/header.txt',
  ),
)
/// The window's brightness and the media volume. Both are from 0 to 1.
class LevelsMessage {
  LevelsMessage({required this.brightness, this.volume});

  /// The window's own brightness, or the system's until one is set.
  final double brightness;

  /// Null when the device sends audio out at a fixed level.
  final double? volume;
}

@HostApi()
abstract class PlayerSystemApi {
  LevelsMessage levels();

  /// Sets the media volume to the step nearest [level] and answers where it
  /// is now; Do Not Disturb can refuse a change.
  double setVolume(double level);

  /// The window's own brightness, which goes back to the system's when null.
  void setBrightness(double? brightness);

  /// Whether the device has picture in picture; low-memory ones don't.
  bool hasPictureInPicture();

  /// Whether the app shows in the small window now.
  bool inPictureInPicture();

  /// Shrinks the app into the small window now, and answers whether it did.
  /// The system can refuse, as when picture in picture is off for the app
  /// in its settings.
  bool enterPictureInPicture();

  /// Whether leaving the app shrinks it into the small window, as it does
  /// while a video plays.
  void setAutoPictureInPicture(bool enabled);
}

@FlutterApi()
abstract class PlayerSystemEventsApi {
  /// The app went into the small window or came back out of it.
  void pictureInPictureChanged(bool active);
}
