import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../platform/device.g.dart';

/// A discovery hint, not a verified server. Connect through the session
/// before signing in: it checks the server answers like Matinee.
@immutable
final class DiscoveredServer {
  const DiscoveredServer(this.name, this.url);

  final String name;
  final String url;

  @override
  bool operator ==(Object other) =>
      other is DiscoveredServer && other.name == name && other.url == url;

  @override
  int get hashCode => Object.hash(name, url);
}

const discoveryPort = 8421;
const _maxBytes = 512;
const _maxName = 64;
const _maxUrl = 400;

/// `Matinee discovery v1`, padded with spaces to exactly 512 bytes, so the
/// server's answer can't amplify it.
final Uint8List discoveryProbe = Uint8List.fromList(
  ascii.encode('Matinee discovery v1'.padRight(_maxBytes)),
);

/// One reply, or null when it's malformed, another version, or not a server
/// worth offering: unknown fields are ignored, as the protocol asks. A
/// version that isn't the number 1 (like the text "1") is another version.
DiscoveredServer? readDiscoveryReply(List<int> bytes) {
  if (bytes.length > _maxBytes) return null;
  final Object? reply;
  try {
    reply = jsonDecode(utf8.decode(bytes));
  } on FormatException {
    return null;
  }
  if (reply is! Map<String, Object?>) return null;
  final version = reply['version'];
  final name = reply['name'];
  final url = reply['url'];
  if (version is! int || version != 1) return null;
  if (name is! String || url is! String) return null;
  final trimmed = name.trim();
  if (trimmed.isEmpty || trimmed.runes.length > _maxName) return null;
  if (url.runes.length > _maxUrl) return null;
  final parsed = Uri.tryParse(url);
  if (parsed == null ||
      !(parsed.scheme == 'http' || parsed.scheme == 'https') ||
      !parsed.hasAuthority ||
      parsed.host.isEmpty ||
      parsed.userInfo.isNotEmpty) {
    return null;
  }
  return DiscoveredServer(trimmed, url);
}

/// Where a probe goes: an address and a port.
typedef Destination = (InternetAddress, int);

/// Each active interface's broadcast address, then `255.255.255.255`.
Future<List<Destination>> broadcastDestinations() async {
  final found = <InternetAddress>{};
  try {
    for (final text in await DeviceApi().broadcastAddresses()) {
      final address = InternetAddress.tryParse(text);
      if (address != null && address.type == InternetAddressType.IPv4) {
        found.add(address);
      }
    }
  } on MissingPluginException {
    found.addAll(await _guessedBroadcasts());
  } on PlatformException {
    found.addAll(await _guessedBroadcasts());
  }
  found.add(InternetAddress('255.255.255.255'));
  return [for (final address in found) (address, discoveryPort)];
}

/// Without the platform's answer, the last address of each /24, which is
/// what most home networks are.
Future<List<InternetAddress>> _guessedBroadcasts() async {
  try {
    final interfaces = await NetworkInterface.list(
      type: InternetAddressType.IPv4,
    );
    return [
      for (final network in interfaces)
        for (final address in network.addresses)
          InternetAddress(
            '${address.address.substring(0, address.address.lastIndexOf('.'))}.255',
          ),
    ];
  } on SocketException {
    return const [];
  }
}

/// A cold IPv4 LAN scan: each listener owns a socket, sends the probe to
/// [destinations], and gets the unicast replies until [timeout] passes or it
/// cancels. Network errors and denied access give no results, not an
/// exception. Ask for local network access before listening.
///
/// Results are untrusted hints, dropped when their URL repeats. Pass a
/// selected URL to the session's connect, which checks health. A scan never
/// connects or signs in.
Stream<DiscoveredServer> discoverServers({
  Duration timeout = const Duration(seconds: 3),
  Future<List<Destination>> Function() destinations = broadcastDestinations,
}) => Stream.multi((controller) async {
  if (timeout <= Duration.zero) {
    await controller.close();
    return;
  }
  RawDatagramSocket? socket;
  StreamSubscription<RawSocketEvent>? replies;
  Timer? stop;
  var closed = false;
  Future<void> finish() async {
    if (closed) return;
    closed = true;
    stop?.cancel();
    await replies?.cancel();
    socket?.close();
    if (!controller.isClosed) await controller.close();
  }

  controller.onCancel = finish;
  final RawDatagramSocket bound;
  try {
    bound = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
    bound.broadcastEnabled = true;
  } on Object {
    await finish();
    return;
  }
  socket = bound;
  if (closed) {
    bound.close();
    return;
  }
  stop = Timer(timeout, finish);
  final seen = <String>{};
  replies = bound.listen((event) {
    if (event != RawSocketEvent.read) return;
    final datagram = bound.receive();
    if (datagram == null) return;
    final server = readDiscoveryReply(datagram.data);
    if (server == null) return;
    final url = Uri.parse(server.url);
    final key = url.replace(path: url.path.isEmpty ? '/' : url.path).toString();
    if (seen.add(key) && !controller.isClosed) controller.add(server);
  });
  try {
    for (final (address, port) in await destinations()) {
      if (closed) return;
      try {
        bound.send(discoveryProbe, address, port);
      } on Object {
        // One disconnected interface must not hide the others.
      }
    }
  } on Object {
    // The scan still listens for replies to what went out.
  }
});

/// Scans the local network, apart from how: the search screens read it from
/// here, so a test or a platform without UDP can stand in.
typedef ServerDiscovery = Stream<DiscoveredServer> Function();

final serverDiscoveryProvider = Provider<ServerDiscovery>(
  (ref) => discoverServers,
);
