import 'package:flutter/material.dart' show MaterialApp, TextField;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/l10n/app_localizations_en.dart';
import 'package:matinee/screens/search/search_screen.dart';

import '../../core/fakes.dart';

final _l = AppLocalizationsEn();

JsonMap _profileUserJson(String username, String displayName) => {
  'id': 'id-$username',
  'username': username,
  'displayName': displayName,
  'role': 'user',
  'avatarId': null,
  'createdAt': '2024-05-01T00:00:00.000Z',
};

MockClient _client(List<JsonMap> users) => MockClient((request) async {
  final uri = request.url;
  return switch (uri.path) {
    '/api/v1/search' => jsonResponse({
      'users': users,
      'titles': <Object?>[],
      'people': <Object?>[],
      'genres': <Object?>[],
      'studios': <Object?>[],
    }),
    '/api/v1/libraries' => jsonResponse(<Object?>[]),
    '/api/v1/catalog/search' => jsonResponse({
      'items': <Object?>[],
      'nextPage': null,
      'stale': false,
    }),
    _ => throw StateError('Unexpected request: $uri'),
  };
});

Future<void> _pump(
  WidgetTester tester,
  MockClient client, {
  required String own,
}) async {
  tester.view.physicalSize = const Size(400, 900);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    initialLocation: '/search',
    routes: [
      GoRoute(
        path: '/search',
        builder: (context, state) => const SearchScreen(),
      ),
      GoRoute(
        path: '/profiles/:username',
        builder: (context, state) =>
            Text('user ${state.pathParameters['username']}'),
      ),
      GoRoute(
        path: '/profile',
        builder: (context, state) => const Text('own profile'),
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authStateProvider.overrideWithValue(
          SignedIn(
            'https://media.test',
            User.fromJson({
              ...userJson(own),
              'permissions': [Permission.profileRead],
            }),
          ),
        ),
        apiProvider.overrideWithValue(
          MatineeApi(base: Uri.parse('https://media.test'), client: client),
        ),
      ],
      child: MaterialApp.router(
        routerConfig: router,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: MatineeTheme.data(matineeDark),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _search(WidgetTester tester, String text) async {
  await tester.enterText(find.byType(TextField), text);
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('search lists people on the server and opens their profile', (
    tester,
  ) async {
    final client = _client([_profileUserJson('ada', 'Ada Lovelace')]);
    addTearDown(client.close);
    await _pump(tester, client, own: 'viewer');

    await _search(tester, 'ada');

    expect(find.text(_l.searchSectionProfiles), findsOneWidget);
    expect(find.text('Ada Lovelace'), findsOneWidget);
    await tester.tap(find.text('Ada Lovelace'));
    await tester.pumpAndSettle();
    expect(find.text('user ada'), findsOneWidget);
  });

  testWidgets('your own username opens your profile, not another one', (
    tester,
  ) async {
    final client = _client([_profileUserJson('viewer', 'Vera Viewer')]);
    addTearDown(client.close);
    await _pump(tester, client, own: 'viewer');

    await _search(tester, 'vera');

    expect(find.text('Vera Viewer'), findsOneWidget);
    await tester.tap(find.text('Vera Viewer'));
    await tester.pumpAndSettle();
    expect(find.text('own profile'), findsOneWidget);
    expect(find.text('user viewer'), findsNothing);
  });
}
