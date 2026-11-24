import 'dart:convert';

import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/services.dart' show SystemChannels;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/core/session_store.dart';
import 'package:matinee/core/toasts.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/l10n/app_localizations_en.dart';
import 'package:matinee/screens/settings/account_page.dart';

import '../../core/fakes.dart';

void main() {
  final l = AppLocalizationsEn();

  testWidgets('a display name saves and the field keeps the server name', (
    tester,
  ) async {
    String? sent;
    final client = MockClient((request) async {
      if (request.url.path == '/api/v1/account/sessions') {
        return jsonResponse([]);
      }
      if (request.url.path == '/api/v1/account/profile' &&
          request.method == 'PATCH') {
        sent = request.body;
        return jsonResponse({
          ...userJson('viewer'),
          'displayName': 'Ada Lovelace',
        });
      }
      throw StateError('Unexpected request: ${request.method} ${request.url}');
    });
    addTearDown(client.close);

    await _pump(tester, client, [Permission.accountUpdate]);
    expect(find.text(l.accountDisplayNameLabel), findsOneWidget);

    await tester.enterText(find.byType(MatineeTextField), 'Ada Lovelace');
    await tester.pump();
    await tester.tap(
      find.widgetWithText(MatineeButton, l.accountDisplayNameSave),
    );
    await tester.pumpAndSettle();

    expect(jsonDecode(sent!), {'displayName': 'Ada Lovelace'});
    // The server trims, and the field shows what it kept.
    final field = tester.widget<EditableText>(find.byType(EditableText));
    expect(field.controller.text, 'Ada Lovelace');
    final save = tester.widget<MatineeButton>(
      find.widgetWithText(MatineeButton, l.accountDisplayNameSave),
    );
    expect(save.onPressed, isNull);
  });

  testWidgets('signing out other sessions asks first and says how many', (
    tester,
  ) async {
    var revoked = 0;
    final requests = <String>[];
    final client = MockClient((request) async {
      requests.add('${request.method} ${request.url.path}');
      if (request.url.path == '/api/v1/account/sessions') {
        return jsonResponse([
          _session('here', current: true, name: 'Pixel 9'),
          _session('elsewhere', current: false, name: 'Firefox'),
        ]);
      }
      if (request.url.path == '/api/v1/account/sessions/revoke-others') {
        revoked++;
        return jsonResponse({'revoked': 1});
      }
      throw StateError('Unexpected request: ${request.method} ${request.url}');
    });
    addTearDown(client.close);

    await _pump(tester, client, [Permission.sessionDelete]);
    // The section's action, then the dialog's answer, which says the same.
    await tester.tap(find.text(l.accountSessionsSignOutOthersConfirm));
    await tester.pumpAndSettle();
    expect(find.text(l.accountSessionsSignOutOthersTitle), findsOneWidget);

    await tester.tap(find.text(l.accountSessionsSignOutOthersConfirm).last);
    await tester.pumpAndSettle();

    expect(revoked, 1);
    expect(requests, contains('POST /api/v1/account/sessions/revoke-others'));
    expect(find.text(l.accountSessionsSignedOutCount(1)), findsOneWidget);
  });

  testWidgets('a new token shows its secret once, with a copy button', (
    tester,
  ) async {
    String? sent;
    var created = false;
    final copied = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData') {
          copied.add(
            (call.arguments as Map<Object?, Object?>)['text'] as String,
          );
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );
    final token = {
      'id': '1f6d9dc8-5d4b-4d1a-8b9e-6b8f3c2a1d0e',
      'name': 'Home automation',
      'permissions': ['all'],
      'createdAt': '2026-11-01T10:00:00.000Z',
      'lastUsedAt': null,
    };
    final client = MockClient((request) async {
      if (request.url.path == '/api/v1/account/sessions') {
        return jsonResponse([]);
      }
      if (request.url.path == '/api/v1/account/api-tokens') {
        if (request.method == 'POST') {
          sent = request.body;
          created = true;
          return jsonResponse({'token': 'matinee_secret', 'apiToken': token});
        }
        return jsonResponse(created ? [token] : []);
      }
      throw StateError('Unexpected request: ${request.method} ${request.url}');
    });
    addTearDown(client.close);

    await _pump(tester, client, [
      Permission.apiTokenRead,
      Permission.apiTokenCreate,
    ]);
    await tester.tap(find.text(l.accountApiTokensCreate));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byType(MatineeTextField).first,
      'Home automation',
    );
    await tester.tap(find.text(l.accountApiTokensAllPermissions));
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(
        of: find.byType(Dialog),
        matching: find.text(l.accountApiTokensCreate),
      ),
    );
    await tester.pumpAndSettle();

    expect(jsonDecode(sent!), {
      'name': 'Home automation',
      'permissions': ['all'],
    });
    expect(find.text('matinee_secret'), findsOneWidget);

    await tester.tap(find.text(l.accountApiTokensCopy));
    await tester.pump();
    expect(copied, ['matinee_secret']);
    expect(find.text(l.accountApiTokensCopied), findsOneWidget);

    await tester.tap(find.text(l.accountApiTokensDone));
    await tester.pumpAndSettle();
    expect(find.text('matinee_secret'), findsNothing);
    expect(find.text('Home automation'), findsOneWidget);
  });
}

Map<String, Object?> _session(
  String id, {
  required bool current,
  required String name,
}) => {
  'id': id,
  'current': current,
  'client': 'Matinee',
  'deviceName': name,
  'platform': null,
  'browser': null,
  'createdAt': '2026-11-01T10:00:00.000Z',
  'lastSeenAt': '2026-11-20T10:00:00.000Z',
  'expiresAt': '2027-02-01T10:00:00.000Z',
};

Future<void> _pump(
  WidgetTester tester,
  MockClient client,
  List<String> permissions,
) async {
  tester.view.physicalSize = const Size(420, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final user = User.fromJson({
    ...userJson('viewer'),
    'permissions': permissions,
  });
  final store = await SessionStore.open(MemoryPreferences(), MemorySecrets());
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        sessionStoreProvider.overrideWithValue(store),
        authStateProvider.overrideWithValue(
          SignedIn('https://media.test', user),
        ),
        apiProvider.overrideWithValue(
          MatineeApi(base: Uri.parse('https://media.test'), client: client),
        ),
      ],
      child: MaterialApp(
        locale: const Locale('en'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: MatineeTheme.data(matineeDark),
        home: Consumer(
          builder: (context, ref, _) => Stack(
            children: [
              const AccountPage(),
              Positioned(
                left: 0,
                right: 0,
                bottom: 64,
                child: Center(
                  child: ToastHost(state: ref.watch(toastProvider)),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}
