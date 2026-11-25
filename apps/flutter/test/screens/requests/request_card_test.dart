import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/permissions.dart';
import 'package:matinee/core/session.dart' show apiProvider;
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/screens/requests/request_cards.dart';

Map<String, Object?> _availability({double? progress}) => {
  'state': 'asked',
  'action': null,
  'progress': progress,
  'etaSeconds': null,
  'releaseDate': null,
  'stillLooking': false,
  'reason': null,
  'askedBySelf': false,
  'requestId': null,
  'others': {'count': 0, 'names': <String>[]},
  'limit': null,
  'libraryTitleId': null,
  'disabledReason': null,
};

Map<String, Object?> _follower(String name) => {
  'id': name,
  'name': name,
  'username': name,
  'avatarUrl': null,
  'createdAt': '2026-11-01T00:00:00.000Z',
};

AdminRequestItem _item(
  String state, {
  String? error,
  String? note,
  double? progress,
  Map<String, Object?>? backdrop,
  List<Map<String, Object?>> diagnostics = const [],
}) => AdminRequestItem.fromJson({
  'id': state,
  'title': {
    'ref': {'kind': 'show', 'provider': 'tmdb', 'providerId': state},
    'name': 'Severance',
    'year': 2022,
    'poster': null,
    'availability': _availability(),
  },
  'backdrop': backdrop,
  'library': {'id': 'shows', 'name': 'Shows'},
  'scope': {
    'seasons': [1, 2],
  },
  'createdAt': '2026-11-01T00:00:00.000Z',
  'arrivedAt': '2026-11-20T00:00:00.000Z',
  'availability': _availability(progress: progress),
  'season': null,
  'state': state,
  'status': 'approved',
  'fulfilmentState': null,
  'error': error,
  'gaveUp': false,
  'note': note,
  'declinedAt': null,
  'connection': null,
  'followers': [_follower('Ada'), _follower('Ben')],
  'destinations': <Object>[],
  'remoteUrl': null,
  'diagnostics': diagnostics,
});

RequestItem _own(
  String state, {
  bool declined = false,
  String? note,
  double? progress,
}) => RequestItem.fromJson({
  'id': 'own-$state',
  'title': {
    'ref': {'kind': 'movie', 'provider': 'tmdb', 'providerId': state},
    'name': 'Dune: Part Two',
    'year': 2024,
    'poster': null,
    'availability': _availability(),
  },
  'backdrop': null,
  'library': {'id': 'films', 'name': 'Films'},
  'scope': null,
  'createdAt': '2026-11-01T00:00:00.000Z',
  'arrivedAt': null,
  'availability': {
    ..._availability(progress: progress),
    'action': 'cancel',
    'reason': declined ? {'kind': 'declined', 'note': note} : null,
  },
  'season': null,
  'state': state,
});

/// [card], 380 wide, under the app's theme and a scope that
/// can answer the queue.
Future<void> _pump(WidgetTester tester, Widget card) async {
  tester.view.physicalSize = const Size(1600, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        // No server, so a backdrop or poster draws its placeholder only.
        apiProvider.overrideWithValue(null),
        canProvider.overrideWith((ref, permission) => true),
      ],
      child: MaterialApp(
        locale: const Locale('en'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: MatineeTheme.data(matineeDark),
        home: SingleChildScrollView(child: SizedBox(width: 380, child: card)),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  // The bug it pins: a failed request said nothing about why, or cut the
  // error to a line or two, so an admin had to guess.
  testWidgets('a failed badge opens the error and the connection report', (
    tester,
  ) async {
    const error =
        'Radarr answered 503 Service Unavailable at http://radarr.local:7878 '
        'after three tries over the last hour';
    final item = _item(
      RequestState.needsAttention,
      error: error,
      diagnostics: [
        {'label': 'Download', 'value': '1080p · H.264'},
        {'label': 'Queue', 'value': 'stuck since 14:02'},
      ],
    );
    await _pump(tester, QueueCard(item: item));
    expect(find.textContaining(error), findsNothing);

    await tester.tap(find.byType(RequestStateBadge));
    await tester.pumpAndSettle();

    expect(find.textContaining(error), findsOneWidget);
    expect(find.text('Download'), findsOneWidget);
    expect(find.text('1080p · H.264'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  // The bug it pins: a decline and the reason the admin typed were two
  // lines under the name, and a long reason was cut.
  testWidgets('a declined badge opens why and the whole note', (tester) async {
    const note =
        'We keep this one on the shelf at home, ask me for the disc whenever '
        'you want to watch it and I will bring it round.';
    final item = _own(RequestState.declined, declined: true, note: note);
    await _pump(tester, OwnRequestCard(item: item));
    expect(find.textContaining(note), findsNothing);

    await tester.tap(find.byType(RequestStateBadge));
    await tester.pumpAndSettle();

    expect(find.text('Declined.'), findsOneWidget);
    expect(find.textContaining(note), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
