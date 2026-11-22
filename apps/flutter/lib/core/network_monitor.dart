import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

/// Which networks the device is on, as the system says: `wifi`, `mobile`,
/// `ethernet`, and so on. Empty without a network.
@immutable
final class NetworkStatus {
  const NetworkStatus(this.transports);

  const NetworkStatus.none() : transports = const {};

  final Set<String> transports;

  /// Whether there's a network to try at all.
  bool get online => transports.isNotEmpty;

  @override
  bool operator ==(Object other) =>
      other is NetworkStatus && setEquals(transports, other.transports);

  @override
  int get hashCode => Object.hashAllUnordered(transports);
}

/// What the app asks of the network: to tell no network from a server that's
/// down, and to try again when a network comes back.
abstract interface class NetworkMonitor {
  Future<NetworkStatus> status();

  /// Each time the networks change.
  Stream<NetworkStatus> get changes;
}

/// [NetworkMonitor] over connectivity_plus.
final class PlatformNetworkMonitor implements NetworkMonitor {
  const PlatformNetworkMonitor();

  static NetworkStatus _status(List<ConnectivityResult> results) =>
      NetworkStatus({
        for (final result in results)
          if (result != ConnectivityResult.none) result.name,
      });

  @override
  Future<NetworkStatus> status() async =>
      _status(await Connectivity().checkConnectivity());

  @override
  Stream<NetworkStatus> get changes =>
      Connectivity().onConnectivityChanged.map(_status);
}
