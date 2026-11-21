import 'app_localizations.dart';
import 'server_messages.g.dart';

final _catalog = ServerMessageMatcher(serverMessages);

String? translateServerMessage(AppLocalizations l, String text) =>
    _catalog.translate(l, text);

extension ServerText on String {
  String serverWords(AppLocalizations l) =>
      translateServerMessage(l, this) ?? this;
}

class ServerMessageMatcher {
  ServerMessageMatcher(Iterable<ServerMessage> entries) {
    for (final entry in entries) {
      if (entry.names.isEmpty) {
        _exact[entry.text] = entry;
      } else {
        final pattern = entry.text.splitMapJoin(
          RegExp(r'\{\w+\}'),
          onMatch: (_) => '(.+?)',
          onNonMatch: RegExp.escape,
        );
        _patterns.add((entry, RegExp('^$pattern\$')));
      }
    }
  }

  final _exact = <String, ServerMessage>{};
  final _patterns = <(ServerMessage, RegExp)>[];

  String? translate(AppLocalizations l, String text) {
    final exact = _exact[text];
    if (exact != null) return exact.localize(l, const {}, 1);
    for (final (entry, pattern) in _patterns) {
      final match = pattern.firstMatch(text);
      if (match == null) continue;
      final values = {
        for (var i = 0; i < entry.names.length; i++)
          entry.names[i]: match.group(i + 1)!,
      };
      final count = entry.plural
          ? int.tryParse(values['count'] ?? '1', radix: 10)
          : 1;
      if (count != null) return entry.localize(l, values, count);
    }
    return null;
  }
}
