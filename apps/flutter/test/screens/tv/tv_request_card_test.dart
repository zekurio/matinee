import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/permissions.dart';
import 'package:matinee/core/session.dart' show apiProvider;
import 'package:matinee/kit/kit.dart';
import 'package:matinee/kit/tv/tv.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/screens/tv/tv_requests.dart';

const _longError =
    'Radarr answered 503 Service Unavailable at http://radarr.local:7878 '
    'after three tries over the last hour, and the connection is still down';
const _longNote =
    'We keep this one on the shelf at home, ask me for the disc whenever you '
    'want to watch it and I will bring it round on the next visit.';
const _longTitle =
    'The Extraordinarily Long Title of a Film Nobody Can Fit on One Line';

Map<String, Object?> _availability(String state) => {
  'state': state,
  'action': null,
  'progress': null,
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
  'avatarId': null,
  'createdAt': '2026-11-01T00:00:00.000Z',
};

AdminRequestItem _item(
  String state, {
  String? error,
  String? reason,
  String? note,
}) => AdminRequestItem.fromJson({
  'id': state,
  'title': {
    'ref': {'kind': 'show', 'provider': 'tmdb', 'providerId': state},
    'name': _longTitle,
    'year': 2022,
    'poster': null,
    'availability': _availability('asked'),
  },
  'library': {'id': 'shows', 'name': 'Shows'},
  'scope': {
    'seasons': [1, 2, 3, 5, 7, 8, 9, 11, 12, 14],
    'future': true,
  },
  'createdAt': '2026-11-01T00:00:00.000Z',
  'arrivedAt': '2026-11-20T00:00:00.000Z',
  'availability': _availability('asked'),
  'season': null,
  'state': state,
  'status': 'approved',
  'fulfilmentState': null,
  'error': error,
  'reason': reason,
  'note': note,
  'declinedAt': null,
  'connection': null,
  'followers': [
    _follower('Bartholomew Fitzgerald'),
    _follower('Cara'),
    _follower('Dan'),
  ],
  'destinations': <Object>[],
  'remoteUrl': null,
  'diagnostics': <Object>[],
});

RequestItem _own(String state, {Map<String, Object?>? reason}) =>
    RequestItem.fromJson({
      'id': 'own-$state',
      'title': {
        'ref': {'kind': 'movie', 'provider': 'tmdb', 'providerId': state},
        'name': _longTitle,
        'year': 2024,
        'poster': null,
        'availability': _availability('asked'),
      },
      'library': {'id': 'films', 'name': 'Films'},
      'scope': null,
      'createdAt': '2026-11-01T00:00:00.000Z',
      'arrivedAt': '2026-11-20T00:00:00.000Z',
      'availability': {
        ..._availability('asked'),
        'state': reason == null ? 'asked' : 'unavailable',
        'reason': reason,
      },
      'season': null,
      'state': state,
    });

/// The cards in a column under the app's theme.
Future<void> _pumpCards(WidgetTester tester, List<Widget> cards) async {
  tester.view.physicalSize = const Size(1600, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiProvider.overrideWithValue(
          MatineeApi(
            base: Uri.parse('https://media.example.com'),
            client: MockClient((_) async => http.Response('{}', 500)),
          ),
        ),
        // Every answer's button shows, and the hub reads no queue to keep
        // the test off the network.
        canProvider.overrideWith(
          (ref, permission) => permission != Permission.adminRequestRead,
        ),
      ],
      child: MaterialApp(
        locale: const Locale('en'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: MatineeTheme.data(matineeDark),
        home: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final (index, card) in cards.indexed)
                SizedBox(
                  key: ValueKey(index),
                  width: TvInfoCards.rowWidth,
                  child: card,
                ),
            ],
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

/// Where each card's badge sits from the card's top: one place for all.
Set<double> _badgeTops(WidgetTester tester, Iterable<int> cards) => {
  for (final index in cards)
    tester
            .getTopLeft(
              find.descendant(
                of: find.byKey(ValueKey(index)),
                matching: find.byType(TvBadge),
              ),
            )
            .dy -
        tester.getTopLeft(find.byKey(ValueKey(index))).dy,
};

void main() {
  testWidgets('a long error and a long decline note take three lines', (
    tester,
  ) async {
    final failed = _item('needsAttention', error: _longError);
    final declined = _own(
      'declined',
      reason: {'kind': 'declined', 'code': 'notForServer', 'note': _longNote},
    );
    await _pumpCards(tester, [
      TvRequestCard.queued(_item('waiting')),
      TvRequestCard.queued(failed),
      TvRequestCard.queued(
        _item('declined', reason: 'notForServer', note: _longNote),
      ),
      TvRequestCard.mine(declined),
    ]);
    final heights = {
      for (var index = 0; index < 4; index++)
        tester.getSize(find.byKey(ValueKey(index))).height,
    };
    expect(heights, {TvInfoCards.height});
    expect(_badgeTops(tester, const [0, 1, 2, 3]), hasLength(1));
    for (final text in [_longError, _longNote]) {
      final lines = find.textContaining(text);
      expect(lines, findsWidgets);
      for (var index = 0; index < lines.evaluate().length; index++) {
        expect(
          tester.getSize(lines.at(index)).height,
          closeTo(TvInfoCards.problemLines * TvType.caption.lineHeight, .01),
        );
      }
    }
    expect(tester.takeException(), isNull);
  });
}
