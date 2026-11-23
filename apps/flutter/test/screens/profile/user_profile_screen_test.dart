import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/device.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/l10n/app_localizations_en.dart';
import 'package:matinee/screens/profile/lists_screens.dart';
import 'package:matinee/screens/profile/user_profile_screen.dart';

import '../../core/fakes.dart';
import '../../media/fixtures.dart';

final _l = AppLocalizationsEn();

JsonMap _profileUserJson(String username, {String? displayName}) => {
  'id': 'id-$username',
  'username': username,
  'displayName': displayName,
  'role': 'user',
  'avatarId': null,
  'createdAt': '2024-05-01T00:00:00.000Z',
};

JsonMap _profileJson({
  required bool favoritesShared,
  required bool statsShared,
  Object? favorites,
  Object? recent,
}) => {
  'user': _profileUserJson('ada', displayName: 'Ada Lovelace'),
  'self': false,
  'sharing': {'favorites': favoritesShared, 'stats': statsShared},
  'favorites': favorites,
  'recent': recent,
};

final _movieFavorite = <String, Object?>{
  'kind': 'movie',
  'title': titleJson('m1', name: 'Arrival'),
};

final _recentEntry = <String, Object?>{
  'item': itemJson(
    'e1',
    title: titleJson('s1', kind: 'show', name: 'The Expanse'),
    season: 1,
    episode: 1,
    episodeTitle: 'Dulcinea',
  ),
  'watchedAt': '2026-01-01T00:00:00.000Z',
  'completed': false,
};

final _emptyStats = <String, Object?>{
  'range': 'all',
  'unit': 'month',
  'totals': {
    'watchSeconds': 0.0,
    'plays': 0,
    'movies': 0,
    'episodes': 0,
    'shows': 0,
  },
  'buckets': <Object?>[],
  'activity': <Object?>[],
  'genres': <Object?>[],
  'titles': <Object?>[],
};

void main() {
  testWidgets(
    'another person’s profile shows what they share, not the account',
    (tester) async {
      final client = MockClient((request) async {
        final uri = request.url;
        return switch (uri.path) {
          '/api/v1/profiles/ada' => jsonResponse(
            _profileJson(
              favoritesShared: true,
              statsShared: true,
              favorites: [_movieFavorite],
              recent: [_recentEntry],
            ),
          ),
          '/api/v1/profiles/ada/stats' => jsonResponse(_emptyStats),
          _ => throw StateError('Unexpected request: $uri'),
        };
      });
      addTearDown(client.close);

      await _pump(tester, client, const UserProfileScreen(username: 'ada'));

      expect(find.text('Ada Lovelace'), findsOneWidget);
      expect(find.text(_l.favoritesTitle), findsOneWidget);
      expect(find.text(_l.profileRecent), findsOneWidget);
      expect(find.text(_l.profileStatistics), findsOneWidget);
      expect(find.text(_l.profileOtherEmpty('Ada Lovelace')), findsOneWidget);
      // The account rows and the settings button are the owner's alone.
      expect(find.text(_l.profileSwitch), findsNothing);
      expect(find.text(_l.shellSettings), findsNothing);
    },
  );

  testWidgets('a profile they keep private says so and reads nothing else', (
    tester,
  ) async {
    final calls = <Uri>[];
    final client = MockClient((request) async {
      calls.add(request.url);
      if (request.url.path == '/api/v1/profiles/ada') {
        return jsonResponse(
          _profileJson(favoritesShared: false, statsShared: false),
        );
      }
      throw StateError('Unexpected request: ${request.url}');
    });
    addTearDown(client.close);

    await _pump(tester, client, const UserProfileScreen(username: 'ada'));

    expect(find.text(_l.profilePrivate('Ada Lovelace')), findsOneWidget);
    expect(find.text(_l.favoritesTitle), findsNothing);
    expect(find.text(_l.profileStatistics), findsNothing);
    expect(calls.map((uri) => uri.path), ['/api/v1/profiles/ada']);
  });

  testWidgets('statistics they stopped sharing say so', (tester) async {
    final client = MockClient((request) async {
      final uri = request.url;
      return switch (uri.path) {
        '/api/v1/profiles/ada' => jsonResponse(
          _profileJson(
            favoritesShared: true,
            statsShared: true,
            favorites: <Object?>[],
          ),
        ),
        '/api/v1/profiles/ada/stats' => jsonResponse(null),
        _ => throw StateError('Unexpected request: $uri'),
      };
    });
    addTearDown(client.close);

    await _pump(tester, client, const UserProfileScreen(username: 'ada'));

    expect(find.text(_l.profileStoppedSharing('Ada Lovelace')), findsOneWidget);
  });

  testWidgets('their favorites page works and says they do not share them', (
    tester,
  ) async {
    final client = MockClient((request) async {
      final uri = request.url;
      return switch (uri.path) {
        '/api/v1/profiles/ada/favorites' => jsonResponse(null),
        '/api/v1/profiles/ada' => jsonResponse(
          _profileJson(favoritesShared: false, statsShared: false),
        ),
        _ => throw StateError('Unexpected request: $uri'),
      };
    });
    addTearDown(client.close);

    await _pump(tester, client, const FavoritesScreen(username: 'ada'));

    expect(
      find.text(_l.profileFavoritesHidden('Ada Lovelace')),
      findsOneWidget,
    );
  });

  testWidgets('reading another profile needs profile.read before any request', (
    tester,
  ) async {
    final calls = <Uri>[];
    final client = MockClient((request) async {
      calls.add(request.url);
      throw StateError('Unexpected request');
    });
    addTearDown(client.close);

    await _pump(
      tester,
      client,
      const UserProfileScreen(username: 'ada'),
      permissions: const [],
    );

    expect(find.text(_l.adminAccessNotAllowed), findsOneWidget);
    expect(calls, isEmpty);
  });
}

Future<void> _pump(
  WidgetTester tester,
  MockClient client,
  Widget screen, {
  List<String> permissions = const [Permission.profileRead],
}) async {
  tester.view.physicalSize = const Size(400, 900);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final user = User.fromJson({
    ...userJson('viewer'),
    'permissions': permissions,
  });
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authStateProvider.overrideWithValue(
          SignedIn('https://media.test', user),
        ),
        apiProvider.overrideWithValue(
          MatineeApi(base: Uri.parse('https://media.test'), client: client),
        ),
        artworkHttpProvider.overrideWithValue(client),
        deviceProvider.overrideWithValue(
          const Device(
            formFactor: FormFactor.handset,
            name: 'Matinee',
            model: '',
            osVersion: '',
            appVersion: '',
            platform: DevicePlatform.android,
            timeZone: 'Europe/Vienna',
          ),
        ),
      ],
      child: MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: MatineeTheme.data(matineeDark),
        home: screen,
      ),
    ),
  );
  await tester.pumpAndSettle();
}
