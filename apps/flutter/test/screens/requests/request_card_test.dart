import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/permissions.dart';
import 'package:matinee/core/session.dart' show apiProvider;
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/media/artwork.dart';
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
  String? reason,
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
  'reason': reason,
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
  String? reason,
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
    'reason': reason == null
        ? null
        : {'kind': 'declined', 'code': reason, 'note': note},
  },
  'season': null,
  'state': state,
});

/// [card] at [width], in [colors], under the app's theme and a scope that
/// can answer the queue.
Future<void> _pump(
  WidgetTester tester,
  Widget card, {
  double width = 380,
  KitColors colors = matineeDark,
  String locale = 'en',
}) async {
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
        locale: Locale(locale),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: MatineeTheme.data(colors),
        home: SingleChildScrollView(
          child: SizedBox(width: width, child: card),
        ),
      ),
    ),
  );
  await tester.pump();
}

/// The fill a badge of [token] takes on [colors], as [RequestStateBadge]
/// blends it over the card's surface.
Color _fill(Color token, KitColors colors) =>
    Color.alphaBlend(token.withValues(alpha: .8), colors.surface);

/// How bright [ink] is against [fill], as WCAG counts it.
double _contrast(Color ink, Color fill) {
  final one = ink.computeLuminance();
  final other = fill.computeLuminance();
  return (one > other ? one + .05 : other + .05) /
      (one > other ? other + .05 : one + .05);
}

void main() {
  for (final colors in [matineeLight, matineeDark]) {
    final legend = colors.isDark ? 'dark' : 'light';
    // The bug it pins: a state with no badge of its own, or a badge in one
    // colour whatever the state, which the queue's lists can't be read by.
    testWidgets('every state fills its badge in a token in $legend', (
      tester,
    ) async {
      final token = {
        RequestState.waiting: colors.warning,
        RequestState.needsAttention: colors.danger,
        RequestState.onTheWay: colors.accent,
        RequestState.here: colors.success,
        RequestState.declined: colors.danger,
      };
      for (final MapEntry(key: state, value: tint) in token.entries) {
        final item = _item(
          state,
          error: state == RequestState.needsAttention
              ? 'Radarr timed out'
              : null,
          reason: state == RequestState.declined ? 'notForServer' : null,
          progress: .45,
        );
        await _pump(tester, QueueCard(item: item), colors: colors);
        final badge = tester.widget<FilledBadge>(find.byType(FilledBadge));
        final l = AppLocalizations.of(tester.element(find.byType(FilledBadge)));
        expect(
          badge.label,
          requestStateText(
            state,
            l,
            progress: state == RequestState.onTheWay ? .45 : null,
          ),
        );
        expect(badge.fill, _fill(tint, colors), reason: state);
        expect(
          _contrast(badge.ink, badge.fill),
          greaterThanOrEqualTo(3.5),
          reason: '$state in $legend',
        );
        expect(find.byType(RequestStateBadge), findsOneWidget);
      }
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('a badge reads as its status, and opens only what it holds', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    await _pump(
      tester,
      Column(
        children: [
          QueueCard(item: _item(RequestState.waiting)),
          QueueCard(
            item: _item(RequestState.needsAttention, error: 'Radarr timed out'),
          ),
          QueueCard(item: _item(RequestState.onTheWay, progress: .45)),
          QueueCard(item: _item(RequestState.here)),
          QueueCard(item: _item(RequestState.declined, reason: 'notForServer')),
        ],
      ),
    );

    for (final (state, text) in [
      (RequestState.waiting, 'Pending'),
      (RequestState.needsAttention, 'Failed'),
      (RequestState.onTheWay, 'Processing · 45%'),
      (RequestState.here, 'Available'),
      (RequestState.declined, 'Declined'),
    ]) {
      expect(
        find.bySemanticsLabel('Status: $text'),
        findsOneWidget,
        reason: state,
      );
      expect(find.text(text), findsOneWidget, reason: state);
    }
    // The chevron is on the two states that have more to say.
    final badges = tester.widgetList<FilledBadge>(find.byType(FilledBadge));
    expect(
      [for (final badge in badges) badge.trailing],
      [null, Lucide.chevronDown, null, null, Lucide.chevronDown],
    );
    expect(tester.takeException(), isNull);
    handle.dispose();
  });

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

  // The bug it pins: a decline's reason and the admin's note were two lines
  // under the name, and a long note was cut.
  testWidgets('a declined badge opens why and the whole note', (tester) async {
    const note =
        'We keep this one on the shelf at home, ask me for the disc whenever '
        'you want to watch it and I will bring it round.';
    final item = _own(
      RequestState.declined,
      reason: 'notForServer',
      note: note,
    );
    await _pump(tester, OwnRequestCard(item: item));
    expect(find.textContaining(note), findsNothing);

    await tester.tap(find.byType(RequestStateBadge));
    await tester.pumpAndSettle();

    expect(find.text('Not for this server.'), findsOneWidget);
    expect(find.textContaining(note), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a card draws its backdrop, and none without one', (
    tester,
  ) async {
    await _pump(
      tester,
      QueueCard(
        item: _item(
          RequestState.waiting,
          backdrop: {'id': 'backdrop', 'placeholder': null},
        ),
      ),
    );
    expect(find.byType(Picture), findsOneWidget);

    await _pump(tester, QueueCard(item: _item(RequestState.waiting)));
    expect(find.byType(Picture), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
