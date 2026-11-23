import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/l10n/app_localizations_en.dart';
import 'package:matinee/screens/settings/admin/users_page.dart';

/// The picker alone, in English, as the invite dialog holds it.
Future<void> _pump(
  WidgetTester tester, {
  required InviteOptions options,
  required int current,
  ValueChanged<int>? onPicked,
  String? error,
}) => tester.pumpWidget(
  MaterialApp(
    locale: const Locale('en'),
    supportedLocales: AppLocalizations.supportedLocales,
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    theme: MatineeTheme.data(matineeDark),
    home: Align(
      alignment: Alignment.topLeft,
      child: SizedBox(
        width: 360,
        child: InviteExpiryPicker(
          options: options,
          current: current,
          error: error,
          onPicked: onPicked ?? (_) {},
        ),
      ),
    ),
  ),
);

void main() {
  final l = AppLocalizationsEn();
  const options = InviteOptions(expiryDays: [1, 7, 30], defaultExpiryDays: 7);

  testWidgets('the picker offers the lengths the server offers', (
    tester,
  ) async {
    await _pump(tester, options: options, current: 7);
    expect(find.text(l.adminInviteExpiryDays(1)), findsOneWidget);
    expect(find.text(l.adminInviteExpiryDays(7)), findsOneWidget);
    expect(find.text(l.adminInviteExpiryDays(30)), findsOneWidget);
    // Nothing else: the days are not typed in anymore.
    expect(find.byType(EditableText), findsNothing);
  });

  testWidgets('the default is the one picked', (tester) async {
    await _pump(tester, options: options, current: 7);
    final selected = tester
        .widgetList<ChoiceChip>(find.byType(ChoiceChip))
        .map((chip) => (chip.label, chip.selected));
    expect(selected, [
      (l.adminInviteExpiryDays(1), false),
      (l.adminInviteExpiryDays(7), true),
      (l.adminInviteExpiryDays(30), false),
    ]);
  });

  testWidgets('picking another length hands it back', (tester) async {
    int? picked;
    await _pump(
      tester,
      options: options,
      current: 7,
      onPicked: (days) => picked = days,
    );
    await tester.tap(find.text(l.adminInviteExpiryDays(30)));
    expect(picked, 30);
  });

  testWidgets('a server refusal shows under the chips', (tester) async {
    await _pump(tester, options: options, current: 7, error: 'Not that long.');
    expect(find.text('Not that long.'), findsOneWidget);
  });
}
