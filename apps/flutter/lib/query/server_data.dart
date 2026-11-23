import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart'
    show FutureProviderFamily, StreamProviderFamily;

import '../api/matinee_api.dart';
import '../core/app_log.dart';
import '../core/session.dart';
import 'reconnecting.dart';

/// How screens read the server. Each read is a provider made by one of the
/// four functions here, declared once next to the screen that shows it:
///
/// ```dart
/// final featuredProvider = serverQuery((api) => api.home.featured());
/// final shelfProvider = serverQueryFamily(
///   (api, String library) => api.media.shelf(library, limit: 12),
/// );
/// ```
///
/// A screen watches it and gets an `AsyncValue`: loading, the answer, or
/// the error, which [describeFailure] words. `ref.invalidate(provider)`
/// fetches again, keeping the last answer on screen (`.value`) while the
/// new one comes. Every one of them:
///
/// - asks the session's [apiProvider], so a sign-in or a switch to another
///   server fetches again on its own, and nothing is asked while no server
///   is in use (the read fails with [NotConnected]);
/// - goes away once no screen watches it (auto-dispose), so a page opened
///   again fetches fresh;
/// - never retries by itself, unlike Riverpod's default: a failure stays on
///   screen with Try again.
///
/// A live stream ([serverStream], [serverStreamFamily]) is followed through
/// [reconnecting]: it opens again when it ends or drops, and its last value
/// stays while it's down.
final class NotConnected implements Exception {
  const NotConnected();

  @override
  String toString() => 'NotConnected';
}

/// The API of the server in use, which the provider reading it now follows.
MatineeApi serverApi(Ref ref) =>
    ref.watch(apiProvider) ?? (throw const NotConnected());

/// Riverpod 3 retries a failed provider by default; these show the failure.
Duration? _noRetry(int count, Object error) => null;

/// [read], with an answer that didn't parse logged, for the app log.
Future<T> _logged<T>(Future<T> read) async {
  try {
    return await read;
  } on Object catch (error, stack) {
    if (error is FormatException || error is TypeError) {
      logWarning(
        'ServerData',
        "The server's answer didn't parse",
        error,
        stack,
      );
    }
    rethrow;
  }
}

/// One read from the server.
FutureProvider<T> serverQuery<T>(Future<T> Function(MatineeApi api) read) =>
    FutureProvider.autoDispose<T>(
      (ref) => _logged(read(serverApi(ref))),
      retry: _noRetry,
    );

/// A read for each [A], as a library's shelf for each library.
FutureProviderFamily<T, A> serverQueryFamily<T, A>(
  Future<T> Function(MatineeApi api, A arg) read,
) => FutureProvider.autoDispose.family<T, A>(
  (ref, arg) => _logged(read(serverApi(ref), arg)),
  retry: _noRetry,
);

/// A live stream from the server, opened again whenever it ends or drops.
StreamProvider<T> serverStream<T>(Stream<T> Function(MatineeApi api) open) =>
    StreamProvider.autoDispose<T>((ref) {
      final api = serverApi(ref);
      return reconnecting(() => open(api));
    }, retry: _noRetry);

/// A live stream for each [A].
StreamProviderFamily<T, A> serverStreamFamily<T, A>(
  Stream<T> Function(MatineeApi api, A arg) open,
) => StreamProvider.autoDispose.family<T, A>((ref, arg) {
  final api = serverApi(ref);
  return reconnecting(() => open(api, arg));
}, retry: _noRetry);
