import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../platform/device.g.dart';

/// Which set of screens the app shows. Decided once, at launch: a TV gets
/// the remote's screens, everything else the touch screens, which then
/// lay out by width (see [WidthClass]).
enum FormFactor { handset, tv }

/// What the platform says about this device, read once before the first
/// frame.
class Device {
  const Device({
    required this.formFactor,
    required this.name,
    required this.model,
    required this.osVersion,
    required this.appVersion,
    required this.platform,
    this.timeZone = '',
  });

  /// For tests and platforms without the bridge yet: a handset.
  const Device.fallback()
    : formFactor = FormFactor.handset,
      name = 'Matinee',
      model = 'unknown',
      osVersion = '',
      appVersion = '',
      platform = 'android',
      timeZone = '';

  final FormFactor formFactor;

  /// What the server's sessions list calls this device.
  final String name;
  final String model;
  final String osVersion;
  final String appVersion;

  /// The contract's `DevicePlatform`, so the person approving a TV's code
  /// sees a TV.
  final String platform;

  /// The IANA time zone it's set to, like `Europe/Berlin`, or empty where
  /// the platform didn't say: the server then counts days in its own.
  final String timeZone;

  bool get isTv => formFactor == FormFactor.tv;

  /// How the app names itself to the server.
  String get userAgent => 'Matinee/$appVersion ($platform $osVersion; $model)';

  /// Asks the platform, falling back to [Device.fallback] where the bridge
  /// isn't there.
  static Future<Device> load() async {
    try {
      final facts = await DeviceApi().facts();
      return Device(
        formFactor: facts.television ? FormFactor.tv : FormFactor.handset,
        name: facts.name,
        model: facts.model,
        osVersion: facts.osVersion,
        appVersion: facts.appVersion,
        platform: facts.television ? 'androidtv' : 'android',
        timeZone: facts.timeZone,
      );
    } on MissingPluginException {
      return const Device.fallback();
    } on PlatformException {
      return const Device.fallback();
    }
  }
}

/// The device, overridden in `main` with what [Device.load] read.
final deviceProvider = Provider<Device>((ref) => const Device.fallback());
