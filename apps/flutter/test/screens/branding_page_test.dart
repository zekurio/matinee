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
import 'package:matinee/screens/settings/admin/branding_page.dart';

void main() {
  final l = AppLocalizationsEn();

  // The bug it pins: a screen reader heard each mode twice, once for the
  // row's words and again for the field they name, and never which swatch
  // was the one picked.
  testWidgets('the fields are named once and the picked swatch says so', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    tester.view.physicalSize = const Size(400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final branding = const Branding(
      themeAccents: ThemeAccents(light: null, dark: null),
      loginBackdrop: LoginBackdrop(
        enabled: false,
        artwork: 'backdrop',
        blur: 0,
        fade: 0,
      ),
    ).toJson();
    final client = MockClient(
      (request) async => request.url.path == '/api/v1/admin/branding'
          ? http.Response(jsonEncode(branding), 200)
          : http.Response('', 404),
    );
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
          home: const BrandingPage(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    for (final mode in [l.webBrandingModeLight, l.webBrandingModeDark]) {
      expect(find.text(mode), findsOneWidget);
      expect(
        tester.getSemantics(find.bySemanticsLabel(RegExp(mode))),
        isSemantics(label: mode, isTextField: true),
      );
    }
    expect(
      tester.getSemantics(find.bySemanticsLabel(l.webBrandingDefault)),
      isSemantics(
        label: l.webBrandingDefault,
        isButton: true,
        hasSelectedState: true,
        isSelected: true,
      ),
    );
    semantics.dispose();
  });
}
