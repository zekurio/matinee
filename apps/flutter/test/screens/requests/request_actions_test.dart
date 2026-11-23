import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/permissions.dart';
import 'package:matinee/core/session.dart'
    show SignedIn, apiProvider, authStateProvider;
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/l10n/app_localizations_en.dart';
import 'package:matinee/screens/requests/request_cards.dart';

import '../../core/fakes.dart';

Map<String, Object?> _availability() => {
  'state': 'asked',
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

AdminRequestItem _item(String state) => AdminRequestItem.fromJson({
  'id': state,
  'title': {
    'ref': {'kind': 'movie', 'provider': 'tmdb', 'providerId': state},
    'name': 'Dune',
    'year': 2021,
    'poster': null,
    'availability': _availability(),
  },
  'library': {'id': 'films', 'name': 'Films'},
  'scope': null,
  'createdAt': '2026-11-01T00:00:00.000Z',
  'arrivedAt': null,
  'availability': _availability(),
  'season': null,
  'state': state,
  'status': 'approved',
  'fulfilmentState': null,
  'error': null,
  'reason': null,
  'note': null,
  'declinedAt': null,
  'connection': null,
  'followers': <Object>[],
  'destinations': <Object>[],
  'remoteUrl': null,
  'diagnostics': <Object>[],
});

User _user(List<String> permissions) =>
    User.fromJson({...userJson('ada'), 'permissions': permissions});

/// The queue's cards for an account holding [permissions].
Future<void> _pump(WidgetTester tester, List<String> permissions) async {
  tester.view.physicalSize = const Size(1600, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        // Nothing to stream, so the hub only reads the account's rights.
        apiProvider.overrideWithValue(null),
        authStateProvider.overrideWithValue(
          SignedIn('https://media.example.com', _user(permissions)),
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
              for (final state in [
                'waiting',
                'needsAttention',
                'onTheWay',
                'declined',
              ])
                SizedBox(
                  key: ValueKey(state),
                  width: 380,
                  child: QueueCard(item: _item(state)),
                ),
            ],
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  final l = AppLocalizationsEn();

  // The bug it pins: every answer action shown to whoever could read the
  // queue, so a view-only account saw buttons the server would refuse.
  testWidgets('a view-only account gets no answer buttons', (tester) async {
    await _pump(tester, const [Permission.adminRequestRead]);

    for (final word in [
      l.webRequestsAdd,
      l.webRequestsDecline,
      l.webRequestsRetry,
      l.webRequestsGiveUp,
      l.webRequestsAddAfterAll,
    ]) {
      expect(find.text(word), findsNothing, reason: word);
    }
    // Its menu still opens the title and what the connection reported,
    // with none of the answers.
    await tester.tap(find.byType(MatineeButton).first);
    await tester.pumpAndSettle();
    expect(find.text(l.webRequestsOpenTitle), findsWidgets);
    for (final word in [
      l.webRequestsAdd,
      l.webRequestsDecline,
      l.webRequestsRetry,
      l.webRequestsGiveUp,
      l.webRequestsAddAfterAll,
      l.webRequestsAllowAgain,
    ]) {
      expect(find.text(word), findsNothing, reason: word);
    }
    expect(tester.takeException(), isNull);
  });

  // The bug it pins: retrying a failed send took approving or declining
  // too, and the card offered actions the token couldn't use.
  testWidgets('a retry-only account gets Retry and nothing else', (
    tester,
  ) async {
    await _pump(tester, const [
      Permission.adminRequestRead,
      Permission.adminRequestRetry,
    ]);

    expect(find.text(l.webRequestsRetry), findsOneWidget);
    for (final word in [
      l.webRequestsAdd,
      l.webRequestsDecline,
      l.webRequestsGiveUp,
      l.webRequestsAddAfterAll,
    ]) {
      expect(find.text(word), findsNothing, reason: word);
    }
    expect(tester.takeException(), isNull);
  });
}
