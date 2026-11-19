// The device facts only the platform knows. `dart run pigeon --input
// pigeons/device.dart` writes the Dart and Kotlin sides; don't edit those.
import 'package:pigeon/pigeon.dart';

@ConfigurePigeon(
  PigeonOptions(
    dartOut: 'lib/platform/device.g.dart',
    kotlinOut:
        'android/app/src/main/kotlin/io/github/zekurio/matinee/platform/Device.g.kt',
    kotlinOptions: KotlinOptions(package: 'io.github.zekurio.matinee.platform'),
    copyrightHeader: 'pigeons/header.txt',
  ),
)
class DeviceFacts {
  DeviceFacts({
    required this.television,
    required this.name,
    required this.model,
    required this.osVersion,
    required this.appVersion,
  });

  /// Android TV or Apple TV: the remote's screens, code sign-in, no downloads.
  final bool television;

  /// What the server's sessions list calls this device.
  final String name;

  /// The hardware model, for the user agent.
  final String model;

  /// The system's version, like "16" or "18.4".
  final String osVersion;

  /// The app's version, from the root package.json.
  final String appVersion;
}

@HostApi()
abstract class DeviceApi {
  DeviceFacts facts();
}
