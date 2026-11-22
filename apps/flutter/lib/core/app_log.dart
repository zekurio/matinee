import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../platform/system.g.dart';
import 'session.dart';

// The app's own log, for sending along when something breaks. It's what this
// process wrote to logcat (the app's Dart side, the players, the system on its
// behalf), read only when the person asks, and never sent anywhere.
//
// Logcat holds free text, so this can't keep to known codes. Each message
// goes through [scrubLogMessage] instead, which takes out what could name
// the server, the account, or a file: the server's host and the account's
// names, URLs, host names, IP addresses, e-mail addresses, paths, file
// names, quoted text, ids, and tokens.

/// The most lines a log keeps, the latest ones.
const maxLogLines = 500;

/// The most characters a log keeps, so it fits on the clipboard and in a share.
const maxLogChars = 60000;

/// Writes a warning to logcat, where the app log reads it: [tag], [message],
/// and what went wrong, with the first lines of its stack.
void logWarning(
  String tag,
  String message, [
  Object? error,
  StackTrace? stack,
]) {
  final frames = stack?.toString().trimRight().split('\n').take(12);
  debugPrint(
    ['$tag: $message${error == null ? '' : ': $error'}', ...?frames].join('\n'),
  );
}

/// The server's host and the account's names and id, which a log line
/// must not show.
final class KnownValues {
  const KnownValues({this.server = const [], this.account = const []});

  /// From the server's address as the app shows it and the signed-in
  /// user, if any.
  factory KnownValues.of(String? server, List<String?> account) =>
      KnownValues(server: [?_hostOf(server)], account: [...account.nonNulls]);

  /// From whoever is signed in, or offline.
  factory KnownValues.ofAuth(AuthState auth) => switch (auth) {
    SignedIn(:final server, :final user) ||
    Offline(
      :final server,
      :final user,
    ) => KnownValues.of(server, [user.username, user.displayName, user.id]),
    _ => const KnownValues(),
  };

  final List<String> server;
  final List<String> account;

  /// `media.example.com` of `https://media.example.com:8443/matinee`.
  static String? _hostOf(String? address) {
    if (address == null) return null;
    final at = address.indexOf('://');
    var host = at < 0 ? address : address.substring(at + 3);
    host = host.split('/').first.split(':').first;
    return host.isEmpty ? null : host;
  }
}

/// Logcat's lines as text to paste, scrubbed, the latest [maxLogLines]
/// within [maxLogChars].
String formatLog(List<String> lines, KnownValues known) {
  final all = [for (final line in lines) ?formatLogLine(line, known)];
  final kept = all.length > maxLogLines
      ? all.sublist(all.length - maxLogLines)
      : all;
  const header =
      'Matinee app log v1\n'
      'privacy: server, account, addresses, paths, file names, quoted text, '
      'ids, and tokens replaced\n';
  final body = <String>[];
  var size = 0;
  for (final line in kept.reversed) {
    if (size + line.length + 1 > maxLogChars) break;
    body.add(line);
    size += line.length + 1;
  }
  if (body.isEmpty) return '${header}nothing logged\n';
  final dropped = kept.length - body.length;
  return '$header'
      '${dropped > 0 ? '($dropped earlier lines left out)\n' : ''}'
      '${body.reversed.join('\n')}\n';
}

// `11-12 01:41:46.123  1234  1250 W Tag: message`, logcat's threadtime format.
final _threadtime = RegExp(
  r'^(\d\d-\d\d \d\d:\d\d:\d\d\.\d+)\s+\d+\s+\d+\s+([VDIWEFA])\s+(.*?)\s*:(?: (.*))?$',
);

/// One logcat line without its process and thread ids, its message
/// scrubbed. Null for logcat's own lines.
String? formatLogLine(String line, KnownValues known) {
  final match = _threadtime.firstMatch(line.trimRight());
  if (match == null) return null;
  final tag = scrubLogMessage(match[3]!, known);
  final shortTag = tag.length > 32 ? tag.substring(0, 32) : tag;
  return '${match[1]} ${match[2]} $shortTag: '
      '${scrubLogMessage(match[4] ?? '', known)}';
}

RegExp _anyCase(String pattern) => RegExp(pattern, caseSensitive: false);

final _jsonInput = _anyCase(r'(JSON input:).*');
final _url = _anyCase(r'''\b[a-z][a-z0-9+.\-]*://[^\s"'<>]+''');
final _credential = _anyCase(r'\b(bearer|basic)\s+[^\s,;]+');
final _assignedSecret = _anyCase(
  r'''\b(token|access_token|refresh_token|password|secret|cookie|authorization|verifier)(["']?\s*[=:]\s*)(?!(?:bearer|basic)\b)[^\s,;&"']+''',
);
final _email = RegExp(r'[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+');
final _doubleQuoted = RegExp(r'"[^"\n]*"');
final _singleQuoted = RegExp(r"(?<!\w)'[^'\n]+'(?!\w)");
final _path = RegExp(
  r'''(?<![\w.:/<>\-])/(?:[^\s/"',;()\[\]]+/)+[^\s"',;()\[\]]*''',
);
final _mediaFile = _anyCase(
  r'''[^\s/"',;()\[\]]*\.(?:mkv|mp4|m4v|mov|webm|avi|ts|m2ts|mts|mpg|mpeg|ogv|wmv|flv|srt|ass|ssa|vtt|sup|sub|idx)(?!\w|\.\w)''',
);
final _ipv4 = RegExp(r'\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b');
final _ipv6 = RegExp(r'(?<![\w:])[0-9a-fA-F]*(?::[0-9a-fA-F]*){2,}(?![\w:])');
// Not a stack frame's `MainActivity.kt:42`.
final _hostWithPort = _anyCase(
  r'\b(?:[a-z0-9\-]+\.)+(?!(?:kt|java|dart)\b)[a-z]{2,}:\d{2,5}\b',
);
final _hostBeforeIp = _anyCase(r'\b(?:[a-z0-9\-]+\.)+[a-z0-9\-]+(?=/<ip>)');
final _domain = _anyCase(
  r'\b(?:[a-z0-9\-]+\.)+(?:com|net|org|de|io|dev|app|me|xyz|cloud|eu|uk|nl|fr|at|ch|info|tv|lan|local|home|internal|arpa|duckdns|ts\.net)(?![\w.\-])',
);
final _uuid = _anyCase(
  r'\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b',
);
// Letters and digits together, so Media3's
// `ERROR_CODE_IO_NETWORK_CONNECTION_FAILED` stays.
final _id = RegExp(
  r'(?<![\w+=\-])(?=[\w+=\-]*\d)(?=[\w+=\-]*[A-Za-z])[\w+=\-]{20,}',
);
final _hexDigit = RegExp('[0-9a-fA-F]');

/// [message] with what could name the server, the account, or a file
/// replaced by a placeholder: URLs, which hold a host and a path, then
/// [known] values, then the other patterns, from the widest to the narrowest.
String scrubLogMessage(String message, KnownValues known) {
  // A parse error quotes the server's answer, which can hold any title.
  var text = message.replaceAllMapped(_jsonInput, (m) => '${m[1]} <removed>');
  text = text.replaceAll(_url, '<url>');
  // The longest first, so a name that holds another goes whole.
  for (final (values, placeholder) in [
    (known.server, '<server>'),
    (known.account, '<account>'),
  ]) {
    final long = values.where((value) => value.length >= 3).toList()
      ..sort((a, b) => b.length.compareTo(a.length));
    for (final value in long) {
      text = text.replaceAll(_anyCase(RegExp.escape(value)), placeholder);
    }
  }
  text = text
      .replaceAllMapped(_credential, (m) => '${m[1]} <token>')
      .replaceAllMapped(_assignedSecret, (m) => '${m[1]}${m[2]}<token>')
      .replaceAll(_email, '<email>')
      .replaceAll(_doubleQuoted, '"…"')
      .replaceAll(_singleQuoted, "'…'")
      .replaceAll(_path, '<path>')
      .replaceAll(_mediaFile, '<file>')
      .replaceAll(_ipv4, '<ip>')
      .replaceAllMapped(_ipv6, (m) {
        final value = m[0]!;
        final address =
            value.contains(_hexDigit) &&
            (value.contains('::') || ':'.allMatches(value).length >= 5);
        return address ? '<ip>' : value;
      })
      .replaceAll(_hostWithPort, '<host>')
      .replaceAll(_hostBeforeIp, '<host>')
      .replaceAll(_domain, '<host>')
      .replaceAll(_uuid, '<id>')
      .replaceAll(_id, '<id>');
  return text;
}

/// Reads the raw lines of this process's log, so tests can stand in.
typedef LogReader = Future<List<String>> Function(int maxLines);

final logReaderProvider = Provider<LogReader>((ref) {
  final api = SystemApi();
  return (maxLines) async {
    try {
      return await api.readLog(maxLines);
    } on MissingPluginException {
      return const [];
    }
  };
});

/// Offers text to other apps, so tests can stand in.
typedef TextSharer = Future<void> Function(String subject, String text);

final textSharerProvider = Provider<TextSharer>((ref) {
  final api = SystemApi();
  return (subject, text) async {
    try {
      await api.shareText(subject, text);
    } on MissingPluginException {
      // Nowhere to share to.
    }
  };
});

/// This process's recent log through [read], scrubbed of whoever [auth]
/// has signed in and where.
Future<String> readAppLog(LogReader read, AuthState auth) async {
  // Twice the lines kept, since logcat's own lines go.
  final lines = await read(maxLogLines * 2);
  return formatLog(lines, KnownValues.ofAuth(auth));
}
