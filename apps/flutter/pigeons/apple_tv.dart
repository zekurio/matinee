// What an Apple TV keeps for the app. The plugins the other platforms keep
// their settings and tokens with have no tvOS side, so the app asks the
// system itself: the defaults for settings, the Keychain for tokens.
// tvOS only, so there's no Kotlin side. `just flutter pigeon` writes the
// Dart and Swift sides; don't edit those.
import 'package:pigeon/pigeon.dart';

@ConfigurePigeon(
  PigeonOptions(
    dartOut: 'lib/platform/apple_tv.g.dart',
    swiftOut: 'tvos/Runner/Pigeon/AppleTv.g.swift',
    swiftOptions: SwiftOptions(includeErrorClass: false),
    copyrightHeader: 'pigeons/header.txt',
  ),
)
@HostApi()
abstract class AppleTvApi {
  /// Every setting the app keeps, by its key. A value is a string, a
  /// boolean, a whole number, a decimal number, or a list of strings.
  Map<String, Object> preferences();

  /// Keeps [value] under [key], or forgets the key when it's null.
  void setPreference(String key, Object? value);

  /// The secret kept under [key] in the Keychain, or null without one.
  /// Throws when the Keychain can't be read, which is not the same.
  String? secret(String key);

  /// Keeps [value] under [key] in the Keychain, or deletes it when null.
  void setSecret(String key, String? value);

  /// The folder for what the app can fetch again, like artwork. tvOS
  /// empties it when it needs the room.
  String cacheFolder();
}
