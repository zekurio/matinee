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
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/screens/requests/request_cards.dart';

const _long =
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

Map<String, Object?> _follower(String name, int hours) => {
  'id': name,
  'name': name,
  'username': name,
  'avatarId': null,
  'createdAt': DateTime.now()
      .subtract(Duration(hours: hours))
      .toUtc()
      .toIso8601String(),
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
    'name': _long,
    'year': 2022,
    'poster': null,
    'availability': _availability('asked'),
  },
  'backdrop': null,
  'library': {
    'id': 'shows',
    'name': 'Spielfilme in Ultra HD für das Wohnzimmer',
  },
  'scope': {
    'seasons': [1, 2, 3, 5, 7, 8, 9, 11, 12, 14],
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
    _follower('Bartholomew Fitzgerald', 3),
    _follower('Cara', 2),
    _follower('Dan', 1),
  ],
  'destinations': <Object>[],
  'remoteUrl': null,
  'diagnostics': <Object>[],
});

final _cards = [
  _item('waiting'),
  _item(
    'needsAttention',
    error:
        'Radarr answered 503 Service Unavailable at http://radarr.local:7878 '
        'after three tries over the last hour',
  ),
  _item('onTheWay'),
  _item('here'),
  _item(
    'declined',
    reason: 'notForServer',
    note:
        'We keep this one on the shelf at home, ask me for the disc whenever '
        'you want to watch it and I will bring it round.',
  ),
];

RequestItem _own(
  String state, {
  String? action,
  Map<String, Object?>? reason,
  bool show = false,
}) => RequestItem.fromJson({
  'id': 'own-$state${show ? '-show' : ''}',
  'title': {
    'ref': {
      'kind': show ? 'show' : 'movie',
      'provider': 'tmdb',
      'providerId': state,
    },
    'name': _long,
    'year': 2024,
    'poster': null,
    'availability': _availability('asked'),
  },
  'backdrop': null,
  'library': {'id': 'films', 'name': 'Films'},
  'scope': show
      ? {
          'seasons': [1, 2, 3, 5, 7, 8, 9, 11, 12, 14],
        }
      : null,
  'createdAt': '2026-11-01T00:00:00.000Z',
  'arrivedAt': '2026-11-20T00:00:00.000Z',
  'availability': {
    ..._availability('asked'),
    'action': action,
    'reason': reason,
  },
  'season': null,
  'state': state,
});

final _owns = [
  _own('waiting', action: 'cancel'),
  _own('waiting', action: 'cancel', show: true),
  _own('onTheWay', action: 'cancel'),
  _own('here'),
  _own(
    'declined',
    reason: {
      'kind': 'declined',
      'code': 'notForServer',
      'note':
          'We keep this one on the shelf at home, ask me for the disc '
          'whenever you want to watch it.',
    },
  ),
];

/// [cards] in a column at [width], under the app's theme in [locale].
Future<void> _pump(
  WidgetTester tester,
  double width,
  String locale,
  List<(Key, Widget)> cards,
) async {
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
        // The cards show every answer's button, and the hub reads no queue
        // to keep the test off the network.
        canProvider.overrideWith(
          (ref, permission) => permission != Permission.adminRequestRead,
        ),
      ],
      child: MaterialApp(
        locale: Locale(locale),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: MatineeTheme.data(matineeDark),
        home: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final (key, card) in cards)
                SizedBox(key: key, width: width, child: card),
            ],
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

/// Where each card's badge sits from the card's top: one place for all.
Set<double> _badgeTops(WidgetTester tester, Iterable<String> ids) => {
  for (final id in ids)
    tester
            .getTopLeft(
              find.descendant(
                of: find.byKey(ValueKey(id)),
                matching: find.byType(RequestStateBadge),
              ),
            )
            .dy -
        tester.getTopLeft(find.byKey(ValueKey(id))).dy,
};

void main() {
  // The bug it pins: a card's text making it taller than its poster, or
  // one card of a list taller than the next, whichever rows it fills.
  for (final (width, locale) in [
    (380.0, 'en'), // A phone.
    (380.0, 'de'),
    (376.0, 'de'), // A tablet upright, two columns.
    (405.0, 'en'), // A tablet on its side, three columns.
    (336.0, 'de'), // Explore's row.
  ]) {
    testWidgets('queue cards are one height at $width in $locale', (
      tester,
    ) async {
      await _pump(tester, width, locale, [
        for (final item in _cards) (ValueKey(item.id), QueueCard(item: item)),
      ]);
      final heights = {
        for (final item in _cards)
          tester.getSize(find.byKey(ValueKey(item.id))).height,
      };
      expect(heights, {requestCardHeight(TextScaler.noScaling, queue: true)});
      expect(
        _badgeTops(tester, [for (final item in _cards) item.id]),
        hasLength(1),
      );
      expect(tester.takeException(), isNull);
    });

    testWidgets('own cards are one height at $width in $locale', (
      tester,
    ) async {
      await _pump(tester, width, locale, [
        for (final item in _owns)
          (ValueKey(item.id), OwnRequestCard(item: item)),
      ]);
      final heights = {
        for (final item in _owns)
          tester.getSize(find.byKey(ValueKey(item.id))).height,
      };
      expect(heights, {requestCardHeight(TextScaler.noScaling, queue: false)});
      expect(
        _badgeTops(tester, [for (final item in _owns) item.id]),
        hasLength(1),
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('a cut seasons line on an own card opens in full', (
    tester,
  ) async {
    final item = _own('waiting', action: 'cancel', show: true);
    await _pump(tester, 336, 'en', [
      (ValueKey(item.id), OwnRequestCard(item: item)),
    ]);
    final line = find.textContaining('Seasons');
    expect(line, findsOneWidget);
    await tester.tap(line);
    await tester.pumpAndSettle();
    expect(find.textContaining('Seasons'), findsNWidgets(2));
  });
}
