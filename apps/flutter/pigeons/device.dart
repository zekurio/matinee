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
    required this.timeZone,
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

  /// The IANA time zone the device is set to, like "Europe/Berlin", which
  /// the server counts a person's watch days and hours in.
  final String timeZone;
}

@HostApi()
abstract class DeviceApi {
  DeviceFacts facts();

  /// Whether the app has to ask for local network access before it can reach
  /// a server or collect discovery replies on the LAN: Android 17 keeps apps
  /// off the LAN without ACCESS_LOCAL_NETWORK, and the user can take it back
  /// in Settings, so this is asked again before each use.
  bool localNetworkMissing();

  /// Asks for local network access, and answers with whether it was granted.
  /// Where nothing needs asking, it answers true at once.
  @async
  bool requestLocalNetwork();

  /// The IPv4 broadcast address of each active network interface, like
  /// `192.168.1.255`: `dart:io` knows addresses but not netmasks.
  List<String> broadcastAddresses();

  /// Deletes what the Kotlin app left behind, once: its preference files,
  /// folders, session key, and Watch Next programs. Answers whether it ran,
  /// which it does on the first launch only. Call it before anything reads
  /// storage.
  bool freshStart();
}
