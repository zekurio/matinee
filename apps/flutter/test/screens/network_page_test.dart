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
import 'package:matinee/l10n/app_localizations_de.dart';
import 'package:matinee/screens/settings/admin/network_page.dart';

void main() {
  testWidgets('network saves comma decimals and keeps edits made during save', (
    tester,
  ) async {
    final l = AppLocalizationsDe();
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final completeSave = Completer<void>();
    const address = '192.168.0.1';
    var settings = const NetworkSettings(
      localNetworks: ['192.168.0.0/16'],
      trustedProxies: [],
      uploadBitrate: null,
    );
    var saved = false;
    final client = MockClient((request) async {
      expect(request.url.path, '/api/v1/admin/network');
      if (request.method == 'PUT') {
        settings = NetworkSettings.fromJson(jsonDecode(request.body));
        await completeSave.future;
        saved = true;
      }
      return http.Response(
        jsonEncode(
          AdminNetworkSettings(
            settings: settings,
            connection: NetworkConnection(
              address: address,
              local: true,
              unheededProxy: !saved,
            ),
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
          locale: const Locale('de'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          theme: MatineeTheme.data(matineeDark),
          home: const NetworkPage(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    final warning = find.text(l.webNetworkUnheededProxy(address));
    expect(warning, findsOneWidget);

    final editors = find.byType(EditableText);
    await tester.enterText(editors.at(1), '192.168.0.1,\n::1');
    await tester.enterText(editors.at(2), '2,5');
    await tester.pumpAndSettle();
    await tester.tap(find.text(l.saveBarSave));
    await tester.pump();
    expect(settings.trustedProxies, ['192.168.0.1', '::1']);
    expect(settings.uploadBitrate, 2500000);

    await tester.enterText(editors.at(2), '');
    completeSave.complete();
    await tester.pumpAndSettle();
    expect(warning, findsNothing);
    expect(find.text(l.saveBarSave), findsOneWidget);

    await tester.tap(find.text(l.saveBarSave));
    await tester.pumpAndSettle();
    expect(settings.uploadBitrate, isNull);
    await tester.pump(const Duration(seconds: 2));
  });
}
