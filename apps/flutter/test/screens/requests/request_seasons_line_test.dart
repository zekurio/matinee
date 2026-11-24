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

/// [cards] in a column, 336 wide, under the app's theme.
Future<void> _pump(WidgetTester tester, List<(Key, Widget)> cards) async {
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
        locale: const Locale('en'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: MatineeTheme.data(matineeDark),
        home: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final (key, card) in cards)
                SizedBox(key: key, width: 336, child: card),
            ],
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('a cut seasons line on an own card opens in full', (
    tester,
  ) async {
    final item = _own('waiting', action: 'cancel', show: true);
    await _pump(tester, [(ValueKey(item.id), OwnRequestCard(item: item))]);
    final line = find.textContaining('Seasons');
    expect(line, findsOneWidget);
    await tester.tap(line);
    await tester.pumpAndSettle();
    expect(find.textContaining('Seasons'), findsNWidgets(2));
  });
}
