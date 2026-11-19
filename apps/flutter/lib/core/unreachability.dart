import 'dart:async';
import 'dart:io';

import 'package:http/http.dart' as http;

/// Why the server didn't answer, as far as the app can tell.
enum Unreachability {
  /// The device has no network at all.
  noNetwork,
  refused,
  notFound,
  timeout,
  certificate,
  other,
}

// errno values by platform: Linux and Android, then Apple, then Windows.
const _refused = {111, 61, 10061};
const _networkUnreachable = {101, 51, 10051};
const _timedOut = {110, 60, 10060};

/// Why a request to a server failed, from what `dart:io` and `package:http`
/// threw. [hasNetwork] is whether the device has a network with internet
/// access; without one nothing else is worth saying.
Unreachability unreachabilityOf(Object error, {required bool hasNetwork}) {
  if (!hasNetwork) return Unreachability.noNetwork;
  if (error is TimeoutException) return Unreachability.timeout;
  if (error is TlsException) return Unreachability.certificate;
  if (error is SocketException) return _socket(error);
  if (error is http.ClientException) {
    final message = error.message.toLowerCase();
    if (message.contains('handshake') || message.contains('certificate')) {
      return Unreachability.certificate;
    }
  }
  return Unreachability.other;
}

Unreachability _socket(SocketException error) {
  final code = error.osError?.errorCode;
  final text = '${error.message} ${error.osError?.message ?? ''}'.toLowerCase();
  if (text.contains('failed host lookup') ||
      text.contains('no address associated')) {
    return Unreachability.notFound;
  }
  if (_timedOut.contains(code) || text.contains('timed out')) {
    return Unreachability.timeout;
  }
  // Java calls an unreachable network a refused connection too.
  if (_refused.contains(code) ||
      _networkUnreachable.contains(code) ||
      text.contains('refused')) {
    return Unreachability.refused;
  }
  return Unreachability.other;
}
