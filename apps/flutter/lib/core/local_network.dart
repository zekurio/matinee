import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../platform/device.g.dart';

/// Android 17 keeps apps off the local network without ACCESS_LOCAL_NETWORK,
/// even at target SDK 36, so every Android 17 device is asked. Check again
/// before each use, since the user can revoke it in Settings.
abstract interface class LocalNetworkAccess {
  /// Whether it has to be asked for before reaching a server or collecting
  /// discovery replies on the LAN.
  Future<bool> missing();

  /// Asks, and answers with whether it was granted.
  Future<bool> request();
}

/// [LocalNetworkAccess] over the platform bridge; where it isn't there,
/// nothing needs asking.
final class PlatformLocalNetworkAccess implements LocalNetworkAccess {
  const PlatformLocalNetworkAccess();

  @override
  Future<bool> missing() async {
    try {
      return await DeviceApi().localNetworkMissing();
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    }
  }

  @override
  Future<bool> request() async {
    try {
      return await DeviceApi().requestLocalNetwork();
    } on MissingPluginException {
      return true;
    } on PlatformException {
      return false;
    }
  }
}

/// Runs [action] once Android has been asked for local network access, or at
/// once when it needn't be. The action runs whatever the answer: a server on
/// the internet works without it, and one on the LAN fails with its own
/// error. Asks again each time it's still missing, since Settings can take it
/// back.
Future<T> withLocalNetwork<T>(
  LocalNetworkAccess access,
  FutureOr<T> Function() action,
) async {
  if (await access.missing()) await access.request();
  return action();
}

/// Asks before a search of the local network, and answers whether it may
/// run: without the access it would only find nothing.
Future<bool> mayDiscover(LocalNetworkAccess access) async {
  if (!await access.missing()) return true;
  return await access.request() && !await access.missing();
}

final localNetworkProvider = Provider<LocalNetworkAccess>(
  (ref) => const PlatformLocalNetworkAccess(),
);
