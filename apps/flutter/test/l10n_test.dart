import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

Map<String, Object?> readArb(String locale) =>
    jsonDecode(File('lib/l10n/app_$locale.arb').readAsStringSync())
        as Map<String, Object?>;

final _argument = RegExp(r'\{([a-zA-Z_]\w*)\}');
final _plural = RegExp(
  r'^\{([a-zA-Z_]\w*)\s*,\s*plural\s*,(.*)\}$',
  dotAll: true,
);
final _pluralArm = RegExp(r'(?:=\d+|\w+)\s*\{((?:[^{}]|\{\w+\})*)\}');

Iterable<String> messageArguments(String message) sync* {
  final plural = _plural.firstMatch(message);
  if (plural == null) {
    yield* _argument.allMatches(message).map((match) => match[1]!);
    return;
  }

  yield plural[1]!;
  // Each plural arm has its own braces, which can enclose a single word.
  for (final arm in _pluralArm.allMatches(plural[2]!)) {
    yield* _argument.allMatches(arm[1]!).map((match) => match[1]!);
  }
}

void main() {
  test('German ARB messages use English keys and declared placeholders', () {
    final english = readArb('en');
    final german = readArb('de');
    for (final entry in german.entries) {
      final key = entry.key;
      if (key.startsWith('@')) continue;
      expect(
        english.containsKey(key),
        isTrue,
        reason: 'Missing English key $key',
      );

      final metadata = english['@$key'] as Map<String, Object?>?;
      final declared = metadata?['placeholders'] as Map<String, Object?>?;
      for (final argument in messageArguments(entry.value as String)) {
        expect(
          declared?.containsKey(argument),
          isTrue,
          reason: 'German message $key uses undeclared placeholder $argument',
        );
      }
    }
  });
}
