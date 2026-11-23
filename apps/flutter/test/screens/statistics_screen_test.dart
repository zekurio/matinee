import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/device.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/l10n/app_localizations_en.dart';
import 'package:matinee/screens/statistics/statistics_screen.dart';

import '../core/fakes.dart';

void main() {
  final l = AppLocalizationsEn();

  testWidgets(
    'a reader sees the public views and uses the same range for both',
    (tester) async {
      final calls = <Uri>[];
      final client = MockClient((request) async {
        final uri = request.url;
        calls.add(uri);
        final range = uri.queryParameters['range']!;
        return switch (uri.path) {
          '/api/v1/stats/leaderboard' => jsonResponse(
            Leaderboard(range: range, boards: [], sharing: false).toJson(),
          ),
          '/api/v1/stats/library' => jsonResponse(
            LibraryStats(
              range: range,
              unit: StatsUnit.day,
              totals: const LibraryTotals(
                movies: 0,
                shows: 0,
                episodes: 0,
                files: 0,
                sizeBytes: 0,
                durationSeconds: 0,
              ),
              growth: [],
              resolutions: [],
              videoCodecs: [],
              dynamicRange: [],
              audioCodecs: [],
              libraries: [],
            ).toJson(),
          ),
          _ => throw StateError('Unexpected request: $uri'),
        };
      });
      addTearDown(client.close);

      await _pump(tester, client, [Permission.statsRead]);
      expect(find.text(l.webStatsViewActivity), findsNothing);
      expect(find.text(l.webStatsViewPlayback), findsNothing);
      expect(find.text(l.webStatsShowAllTime), findsOneWidget);

      await tester.tap(find.text(l.webStatsShowAllTime));
      await tester.pumpAndSettle();
      expect(find.text(l.webStatsLeaderboardEmpty), findsOneWidget);

      await tester.tap(find.text(l.webStatsViewLibrary));
      await tester.pumpAndSettle();
      expect(find.text(l.webStatsLibraryEmpty), findsOneWidget);
      expect(find.text(l.webStatsLibraryAdd), findsNothing);
      expect(calls.map((uri) => uri.path), [
        '/api/v1/stats/leaderboard',
        '/api/v1/stats/leaderboard',
        '/api/v1/stats/library',
      ]);
      expect(calls.map((uri) => uri.queryParameters['range']), [
        '30d',
        'all',
        'all',
      ]);
      expect(calls.map((uri) => uri.queryParameters['timeZone']).toSet(), {
        'Europe/Vienna',
      });
    },
  );

  testWidgets('a direct link requires statistics permission before any read', (
    tester,
  ) async {
    final calls = <Uri>[];
    final client = MockClient((request) async {
      calls.add(request.url);
      throw StateError('Unexpected request');
    });
    addTearDown(client.close);

    await _pump(tester, client, []);
    expect(find.text(l.adminAccessNotAllowed), findsOneWidget);
    expect(calls, isEmpty);
  });
}

Future<void> _pump(
  WidgetTester tester,
  MockClient client,
  List<String> permissions,
) async {
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
        home: const StatisticsScreen(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}
