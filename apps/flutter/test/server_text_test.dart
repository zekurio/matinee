import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/l10n/app_localizations_de.dart';
import 'package:matinee/l10n/app_localizations_en.dart';
import 'package:matinee/l10n/server_messages.g.dart';
import 'package:matinee/l10n/server_text.dart';
import 'package:matinee/query/failure_view.dart';

void main() {
  final en = AppLocalizationsEn();
  final de = AppLocalizationsDe();

  test('exact server text and a validation placeholder', () {
    expect(
      translateServerMessage(de, 'Sign in first.'),
      'Melde dich zuerst an.',
    );
    expect(
      translateServerMessage(de, 'Use at least 8 characters.'),
      'Verwende mindestens 8 Zeichen.',
    );
  });

  test('overlapping patterns use catalog order and match the whole text', () {
    expect(
      translateServerMessage(de, 'TMDB answered 404 for /movie/42'),
      'TMDB hat mit 404 für /movie/42 geantwortet',
    );
    for (final invalid in [
      'Use at least  characters.',
      'Use at least 2 characters!',
      'Use at least 2 characters. Extra',
    ]) {
      expect(translateServerMessage(de, invalid), isNull);
    }
  });

  test('unknown messages fall back to the original words', () {
    const unknown = 'An error from a newer server.';
    expect(translateServerMessage(de, unknown), isNull);
    expect(unknown.serverWords(de), unknown);
  });

  test('the later duplicate exact message wins over both earlier entries and patterns', () {
    final matcher = ServerMessageMatcher([
      ServerMessage('{value}', ['value'], (_, _, _) => 'pattern'),
      ServerMessage('duplicate', [], (_, _, _) => 'first'),
      ServerMessage('duplicate', [], (_, _, _) => 'last'),
    ]);
    expect(matcher.translate(de, 'duplicate'), 'last');
  });

  test('plural quantities use the captured whole number in both locales', () {
    // No current server or validation entry is plural. Exercise the same
    // localization callback with a plural that ships in both ARBs.
    final matcher = ServerMessageMatcher([
      ServerMessage(
        '{count} file',
        ['count'],
        (l, _, count) => l.downloadsAllFiles(count),
        plural: true,
      ),
    ]);
    expect(matcher.translate(en, '1 file'), '1 file');
    expect(matcher.translate(en, '5 file'), '5 files');
    expect(matcher.translate(de, '1 file'), '1 Datei');
    expect(matcher.translate(de, '5 file'), '5 Dateien');
    for (final invalid in ['several', '1.5', '0xff']) {
      expect(matcher.translate(de, '$invalid file'), isNull);
    }
  });

  test('every catalog entry resolves in English and German', () {
    for (final entry in serverMessages) {
      final values = {
        for (final name in entry.names) name: name == 'count' ? '1' : '<$name>',
      };
      final input = entry.text.replaceAllMapped(
        RegExp(r'\{(\w+)\}'),
        (m) => values[m[1]]!,
      );
      for (final l in [en, de]) {
        final translated = entry.localize(l, values, 1);
        expect(translated, isNotEmpty, reason: entry.text);
        expect(
          translateServerMessage(l, input),
          translated,
          reason: entry.text,
        );
      }
    }
  });

  testWidgets('a failed API read displays the server message in German', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('de'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: MatineeTheme.data(matineeDark),
        home: const FailureState(
          title: 'Bibliotheken',
          error: ApiException(status: 403, message: 'Sign in first.'),
          onRetry: null,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Melde dich zuerst an.'), findsOneWidget);
    expect(find.text('Sign in first.'), findsNothing);
  });
}
