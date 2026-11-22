import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../platform/device.g.dart';

export '../platform/device.g.dart' show DisplayNameKind;

/// The names of languages and countries in the app's language, which Dart
/// doesn't have and the server leaves to the client, sending only codes: the
/// library's language filter, the image editor's languages, and the age
/// ratings' countries. They come from the platform's own lists.

/// Where the names come from: the platform, or a test's own.
abstract interface class DisplayNameSource {
  /// The names of [codes] in [language] that the source knows.
  Future<Map<String, String>> names(
    List<String> codes,
    DisplayNameKind kind,
    String language,
  );
}

/// Asks the platform through [DeviceApi.displayNames]. Where the bridge
/// isn't there, nothing has a name, and the codes show.
final class PlatformDisplayNames implements DisplayNameSource {
  const PlatformDisplayNames();

  @override
  Future<Map<String, String>> names(
    List<String> codes,
    DisplayNameKind kind,
    String language,
  ) async {
    try {
      return await DeviceApi().displayNames(codes, kind, language);
    } on MissingPluginException {
      return const {};
    } on PlatformException {
      return const {};
    }
  }
}

final displayNameSourceProvider = Provider<DisplayNameSource>(
  (ref) => const PlatformDisplayNames(),
);

/// Which names to ask for: [codes] of a [kind] in [language], equal to
/// another for the same codes in any order, so one answer serves them.
@immutable
final class NamesRequest {
  NamesRequest(this.kind, Iterable<String> codes, this.language)
    : codes = codes.toSet().toList()..sort();

  final DisplayNameKind kind;
  final List<String> codes;
  final String language;

  @override
  bool operator ==(Object other) =>
      other is NamesRequest &&
      other.kind == kind &&
      other.language == language &&
      listEquals(other.codes, codes);

  @override
  int get hashCode => Object.hash(kind, language, Object.hashAll(codes));
}

final displayNamesProvider = FutureProvider.autoDispose
    .family<Map<String, String>, NamesRequest>(
      (ref, request) => request.codes.isEmpty
          ? Future.value(const <String, String>{})
          : ref
                .watch(displayNameSourceProvider)
                .names(request.codes, request.kind, request.language),
      retry: (count, error) => null,
    );

/// The names a screen shows, read in its build. Until the platform answers, and
/// for a code it doesn't know, [nameOf] gives the code itself.
final class DisplayNames {
  const DisplayNames(this._names);

  static const none = DisplayNames({});

  final Map<String, String> _names;

  String nameOf(String code) => _names[code] ?? code;

  /// The names of [codes] of [kind] in [language], watched by [ref].
  static DisplayNames watch(
    WidgetRef ref,
    DisplayNameKind kind,
    Iterable<String> codes,
    String language,
  ) => DisplayNames(
    ref
            .watch(displayNamesProvider(NamesRequest(kind, codes, language)))
            .value ??
        const {},
  );
}
