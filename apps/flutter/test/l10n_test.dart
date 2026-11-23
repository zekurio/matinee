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

  // Android 13 and later and iOS list an app's languages in their settings,
  // the only place to pick one, from lists of their own.
  test('the platforms list the languages the ARB files have', () {
    final arbs = {
      for (final file in Directory('lib/l10n').listSync())
        if (RegExp(r'app_(\w+)\.arb$').firstMatch(file.path) case final m?)
          m[1]!,
    };
    final android = {
      for (final m in RegExp(r'<locale android:name="([^"]+)"').allMatches(
        File('android/app/src/main/res/xml/locales_config.xml')
            .readAsStringSync(),
      ))
        m[1]!,
    };
    final plist = File('ios/Runner/Info.plist').readAsStringSync();
    final ios = {
      for (final m
          in RegExp(r'<string>([a-z]{2}(?:-\w+)?)</string>').allMatches(
            RegExp(
              r'<key>CFBundleLocalizations</key>\s*<array>(.*?)</array>',
              dotAll: true,
            ).firstMatch(plist)![1]!,
          ))
        m[1]!,
    };
    expect(arbs, isNotEmpty);
    expect(android, arbs);
    expect(ios, arbs);
  });
}
