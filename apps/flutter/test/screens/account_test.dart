import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/toasts.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/screens/settings/account_page.dart';

import '../media/harness.dart';
import 'home_backend.dart';
import 'metadata_test.dart' show RecordedToasts;

const _sessions = '/api/v1/account/sessions';

JsonMap _session(
  String id, {
  bool current = false,
  String? deviceName,
  String? platform,
  String? browser,
}) => {
  'id': id,
  'current': current,
  'client': platform == null ? 'web' : 'app',
  'deviceName': deviceName,
  'platform': platform,
  'browser': browser,
  'createdAt': '2026-03-14T09:00:00.000Z',
  'lastSeenAt': '2026-11-20T09:00:00.000Z',
  'expiresAt': '2027-03-14T09:00:00.000Z',
};

HomeBackend _backend() => HomeBackend()
  ..answers[_sessions] = [
    _session('s1', current: true, deviceName: 'Pixel 9', platform: 'android'),
    _session('s2', platform: 'androidtv'),
    _session('s3', browser: 'Firefox on Linux'),
  ];

void main() {
  setUpAll(() async {
    await loadFont();
    await initializeDateFormatting();
  });

  testWidgets('lists the sessions, this device first marked', (tester) async {
    await pumpScreen(tester, const AccountPage(), client: _backend().client);
    expect(find.text('Sign in a device'), findsOneWidget);
    expect(find.text('Scan the QR code on a TV'), findsOneWidget);
    expect(find.text('Sessions'), findsOneWidget);
    expect(find.text('Pixel 9'), findsOneWidget);
    expect(find.text('This device'), findsOneWidget);
    expect(find.text('Android app · Signed in Mar 14, 2026'), findsOneWidget);
    expect(find.text('Android TV app'), findsOneWidget);
    expect(find.text('Firefox on Linux'), findsOneWidget);
    expect(find.text('Signed in Mar 14, 2026'), findsOneWidget);
    // This one can't sign itself out here; the profile does that.
    expect(find.bySemanticsLabel('Sign out Pixel 9'), findsNothing);
    expect(find.bySemanticsLabel('Sign out Android TV app'), findsOneWidget);
  });

  testWidgets('signs another session out', (tester) async {
    final backend = _backend()..answers['$_sessions/s2'] = null;
    await pumpScreen(tester, const AccountPage(), client: backend.client);
    backend.answers[_sessions] = [
      _session('s1', current: true, deviceName: 'Pixel 9', platform: 'android'),
    ];
    await tester.tap(find.bySemanticsLabel('Sign out Android TV app'));
    await tester.pumpAndSettle();
    expect(backend.asked, contains('$_sessions/s2'));
    expect(find.text('Android TV app'), findsNothing);
  });

  testWidgets('a refused sign-out says so', (tester) async {
    final backend = _backend()..failing['$_sessions/s3'] = 'Not yours';
    final toasts = RecordedToasts();
    await pumpScreen(
      tester,
      const AccountPage(),
      client: backend.client,
      overrides: [toastProvider.overrideWithValue(toasts)],
    );
    await tester.tap(find.bySemanticsLabel('Sign out Firefox on Linux'));
    await tester.pumpAndSettle();
    expect(toasts.shown.single, (
      "Couldn't sign out that session",
      'Not yours',
    ));
  });

  testWidgets('the sessions failing offers to try again', (tester) async {
    final backend = HomeBackend()..failing[_sessions] = 'Down for upkeep';
    await pumpScreen(tester, const AccountPage(), client: backend.client);
    expect(find.text("Couldn't load your sessions"), findsOneWidget);
    expect(find.text('Sign in a device'), findsOneWidget);
  });

  testWidgets('the link row opens linking a device', (tester) async {
    await pumpScreen(tester, const AccountPage(), client: _backend().client);
    await tester.tap(find.text('Sign in a device'));
    await tester.pumpAndSettle();
    expect(find.text('/link-device'), findsOneWidget);
  });

  for (final (name, size, colors) in [
    ('phone_dark', const Size(412, 915), matineeDark),
    ('tablet_light', const Size(1280, 800), matineeLight),
  ]) {
    testWidgets('the account page on a $name', (tester) async {
      const screen = AccountPage();
      await pumpScreen(
        tester,
        screen,
        client: _backend().client,
        size: size,
        colors: colors,
      );
      await expectLater(
        find.byWidget(screen),
        matchesGoldenFile('goldens/account_$name.png'),
      );
    });
  }
}
