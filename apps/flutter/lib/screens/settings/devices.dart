import '../../kit/kit.dart';

/// How the account page and linking a device name what a session or a code
/// belongs to.

/// The contract's `DevicePlatform` by name, the same in every language, as
/// the web's `platformLabel`.
String platformLabel(String platform) => switch (platform) {
  'android' => 'Android',
  'androidtv' => 'Android TV',
  'ios' => 'iOS',
  'linux' => 'Linux',
  'macos' => 'macOS',
  'tizen' => 'Samsung TV',
  'tvos' => 'Apple TV',
  'windows' => 'Windows',
  '' => platform,
  _ => platform[0].toUpperCase() + platform.substring(1),
};

/// What a device is, at a glance. Null is a browser.
String platformIcon(String? platform) => switch (platform) {
  'androidtv' || 'tizen' || 'tvos' => Lucide.tv,
  'android' || 'ios' => Lucide.smartphone,
  _ => Lucide.monitor,
};
