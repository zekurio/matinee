import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/l10n/app_localizations_en.dart';
import 'package:matinee/screens/settings/admin/admin_parts.dart';
import 'package:matinee/screens/settings/admin/trickplay_page.dart';

void main() {
  final l = AppLocalizationsEn();

  // The bug it pins: the page built its form again from the server's answer
  // after a save, which threw the save bar away before it could say "Saved",
  // and showed Save again while that answer was on its way.
  testWidgets('a saved page says so before its bar goes', (tester) async {
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    var kept = const TrickplaySettings(
      enabled: true,
      intervalSeconds: 10,
      width: 320,
      keyframesOnly: false,
      hardwareDecoding: false,
    );
    // The read after the save waits here, as on a slow connection.
    Completer<void>? reread;
    final client = MockClient((request) async {
      if (request.url.path != '/api/v1/admin/trickplay') {
        return http.Response('', 404);
      }
      if (request.method == 'PUT') {
        kept = TrickplaySettings.fromJson(jsonDecode(request.body));
      } else {
        await reread?.future;
      }
      return http.Response(
        jsonEncode(
          AdminTrickplaySettings(
            settings: kept,
            hardwareAcceleration: null,
            videos: 3,
            ready: 1,
          ).toJson(),
        ),
        200,
      );
    });
    addTearDown(client.close);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiProvider.overrideWithValue(
            MatineeApi(base: Uri.parse('https://media.test'), client: client),
          ),
        ],
        child: MaterialApp(
          locale: const Locale('en'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          theme: MatineeTheme.data(matineeDark),
          home: const TrickplayPage(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(SaveBar), findsNothing);

    await tester.tap(find.text(l.webTrickplayKeyframesOnly));
    await tester.pumpAndSettle();
    reread = Completer();
    await tester.tap(find.text(l.saveBarSave));
    await tester.pump();
    await tester.pump();
    expect(kept.keyframesOnly, isTrue);
    // Still saving until the page is on what the server kept.
    expect(find.byType(Spinner), findsOneWidget);
    expect(find.text(l.saveBarSave), findsNothing);

    reread.complete();
    await tester.pump();
    await tester.pump();
    expect(find.text(l.webCommonSaveBarDone), findsOneWidget);

    await tester.pump(savedFor);
    await tester.pumpAndSettle();
    expect(find.byType(SaveBar), findsNothing);
  });
}
