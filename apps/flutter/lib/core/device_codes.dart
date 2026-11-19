import 'dart:async';

import '../api/matinee_api.dart';
import 'address.dart';

/// The code a TV or app shows to be signed in, as the contract's `UserCode`
/// has it: eight letters, shown as `BCDF-GHJK`. Case, spaces, and the dash
/// don't matter.
abstract final class UserCode {
  static const _letters = 'BCDFGHJKLMNPQRSTVWXZ';
  static final _pattern = RegExp(
    '^[$_letters]{4}[\\s-]?[$_letters]{4}\$',
    caseSensitive: false,
  );

  /// The code as the server stores it, or null when [text] isn't one.
  static String? parse(String text) {
    final trimmed = text.trim();
    if (!_pattern.hasMatch(trimmed)) return null;
    final letters = trimmed.toUpperCase().replaceAll(RegExp('[^A-Z]'), '');
    return '${letters.substring(0, 4)}-${letters.substring(4)}';
  }
}

/// A code read from a QR code, with the server it named, if it named one.
final class ScannedCode {
  const ScannedCode(this.userCode, this.server);

  final String userCode;
  final String? server;
}

/// What a QR code holds: the server's `/link` page with the code in its
/// query, as `verificationUriComplete`, or the bare code. Null for anything
/// else, like a QR code of another app.
ScannedCode? scannedCode(String text) {
  final url = Uri.tryParse(text.trim());
  if (url == null || parseOrigin(text.trim()) == null) {
    final code = UserCode.parse(text);
    return code == null ? null : ScannedCode(code, null);
  }
  final last = url.pathSegments.lastWhere(
    (segment) => segment.isNotEmpty,
    orElse: () => '',
  );
  if (last != 'link') return null;
  final code = UserCode.parse(url.queryParameters['code'] ?? '');
  return code == null ? null : ScannedCode(code, displayOf(url));
}

/// What happens while a device waits to be approved.
sealed class DeviceCodeEvent {
  const DeviceCodeEvent();
}

/// A code to show, with its QR code.
final class DeviceCodeShown extends DeviceCodeEvent {
  const DeviceCodeShown(this.code);

  final DeviceCode code;
}

/// Something failed: the start, if no code came, or a poll, which tries
/// again on its own.
final class DeviceCodeFailed extends DeviceCodeEvent {
  const DeviceCodeFailed(this.error, {required this.fatal});

  final Object error;

  /// No code came, so nothing is polling: ask for a new one.
  final bool fatal;
}

/// A poll is about to go out. Cancelling the stream stops it here, so a
/// poll never goes out after the listener left, which could use up an
/// approval nobody would see.
final class DeviceCodeAsking extends DeviceCodeEvent {
  const DeviceCodeAsking();
}

/// A poll got through, so an earlier failure no longer stands.
final class DeviceCodePolled extends DeviceCodeEvent {
  const DeviceCodePolled();
}

/// The code ran out and wasn't renewed: ask for a new one.
final class DeviceCodeExpired extends DeviceCodeEvent {
  const DeviceCodeExpired();
}

/// Someone signed in approved this device.
final class DeviceCodeApproved extends DeviceCodeEvent {
  const DeviceCodeApproved(this.session);

  final AppSession session;
}

/// The OAuth device grant (RFC 8628) under way: starts it, then polls until
/// someone signed in approves this device, which ends the stream with
/// [DeviceCodeApproved]. A code that expires is replaced at once, with a new
/// [DeviceCodeShown], when [renewExpired]; otherwise the stream ends with
/// [DeviceCodeExpired]. A poll that fails tries again on its own, after the
/// interval, since someone may have approved meanwhile. Cancel the
/// subscription to stop.
Stream<DeviceCodeEvent> deviceCodeSignIn(
  MatineeApi api,
  AppDevice device, {
  required bool renewExpired,
  Future<void> Function(Duration) delay = _wait,
}) async* {
  while (true) {
    final DeviceCode started;
    try {
      started = await api.auth.device.start(device);
    } on Object catch (error) {
      yield DeviceCodeFailed(error, fatal: true);
      return;
    }
    yield DeviceCodeShown(started);
    var expired = false;
    while (!expired) {
      await delay(Duration(seconds: started.interval));
      yield const DeviceCodeAsking();
      final DeviceSignIn answer;
      try {
        answer = await api.auth.device.poll(deviceCode: started.deviceCode);
      } on ApiException catch (error) {
        // The code expired: get a new one, and with it a new QR code.
        if (error.status == 404) {
          expired = true;
          continue;
        }
        yield DeviceCodeFailed(error, fatal: false);
        continue;
      } on Object catch (error) {
        // Wi-Fi dropping, or the system cutting off the network while the
        // browser has the screen: keep asking about the same code, which
        // someone may have approved meanwhile.
        yield DeviceCodeFailed(error, fatal: false);
        continue;
      }
      yield const DeviceCodePolled();
      if (answer is DeviceSignInApproved) {
        yield DeviceCodeApproved(
          AppSession(token: answer.token, user: answer.user),
        );
        return;
      }
    }
    if (!renewExpired) {
      yield const DeviceCodeExpired();
      return;
    }
  }
}

Future<void> _wait(Duration duration) => Future<void>.delayed(duration);
