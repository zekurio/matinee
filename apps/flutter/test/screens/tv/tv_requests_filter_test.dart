import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/services.dart' show LogicalKeyboardKey;
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

Map<String, Object?> _waiting(String id, String kind) => {
  'id': id,
  'title': {
    'ref': {'kind': kind, 'provider': 'tmdb', 'providerId': id},
    'name': 'Title $id',
    'year': 2024,
    'poster': null,
    'availability': _availability(),
  },
  'library': {'id': 'lib', 'name': 'Lib'},
  'scope': null,
  'createdAt': '2026-11-01T00:00:00.000Z',
  'arrivedAt': null,
  'availability': _availability(),
  'season': null,
  'state': 'waiting',
  'status': 'pending',
  'fulfilmentState': null,
  'error': null,
  'reason': null,
  'note': null,
  'declinedAt': null,
  'connection': null,
  'followers': [
    {
      'id': 'u1',
      'name': 'Ben',
      'avatarId': null,
      'createdAt': '2026-11-01T00:00:00.000Z',
    },
  ],
  'destinations': <Object>[],
  'remoteUrl': null,
  'diagnostics': <Object>[],
};

Map<String, Object?> _queue(Map<String, Object?> body) {
  final kind = body['kind'];
  final states = switch (body['states']) {
    final List<Object?> states => states,
    _ => const <Object?>[],
  };
  final waiting = [
    for (final (id, each) in [('s1', TitleKind.show), ('s2', TitleKind.show)])
      if ((kind == null || kind == each) &&
          (states.isEmpty || states.contains('waiting')))
        _waiting(id, each),
  ];
  return {
    'waiting': waiting,
    'needsAttention': <Object>[],
    'onTheWay': <Object>[],
    'done': <Object>[],
    'doneCount': 0,
    'nextCursor': null,
  };
}

typedef _Sent = ({String path, Map<String, Object?> body});

/// A server that answers each queue stream and keeps it open, and takes
/// everything else; each request lands in [sent].
http.Client _server(List<_Sent> sent) {
  final open = <StreamController<List<int>>>[];
  addTearDown(() {
    for (final each in open) {
      unawaited(each.close());
    }
  });
  return MockClient.streaming((request, bodyStream) async {
    final text = await utf8.decodeStream(bodyStream);
    final body = text.isEmpty
        ? <String, Object?>{}
        // SAFETY: every request body the client sends is a JSON object.
        : jsonDecode(text) as Map<String, Object?>;
    final path = request.url.path.replaceFirst('/api/v1', '');
    sent.add((path: path, body: body));
    if (path == '/admin/requests/live') {
      final events = StreamController<List<int>>();
      open.add(events);
      events.add(utf8.encode('data: ${jsonEncode(_queue(body))}\n\n'));
      return http.StreamedResponse(events.stream, 200);
    }
    if (path == '/requests/mine/live') {
      final events = StreamController<List<int>>();
      open.add(events);
      events.add(utf8.encode('data: {"items":[],"nextCursor":null}\n\n'));
      return http.StreamedResponse(events.stream, 200);
    }
    return http.StreamedResponse(Stream.value(utf8.encode('null')), 200);
  });
}

Future<void> _pumpOverview(WidgetTester tester, http.Client client) async {
  tester.view.physicalSize = const Size(1200, 2000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiProvider.overrideWithValue(
          MatineeApi(
            base: Uri.parse('https://media.example.com'),
            client: client,
          ),
        ),
        canProvider.overrideWith(
          (ref, permission) => const [
            Permission.adminRequestRead,
            Permission.adminRequestApprove,
            Permission.adminRequestDecline,
            Permission.adminRequestRetry,
          ].contains(permission),
        ),
      ],
      child: MaterialApp(
        locale: const Locale('en'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: MatineeTheme.data(matineeDark),
        home: const TvFocusRules(child: TvRequestsScreen(queue: true)),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 100));
  await tester.pump(const Duration(milliseconds: 100));
}

Future<void> _openFilter(WidgetTester tester) async {
  await tester.tap(find.text('Filters'));
  for (var frame = 0; frame < 20; frame++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _tapChip(WidgetTester tester, String label) async {
  await tester.tap(find.text(label).last);
  await tester.pump(const Duration(milliseconds: 100));
  await tester.pump(const Duration(milliseconds: 100));
}

/// What the queue's streams asked for, each a filter.
List<Map<String, Object?>> _queueAsks(List<_Sent> sent) => [
  for (final each in sent)
    if (each.path == '/admin/requests/live') each.body,
];

void main() {
  testWidgets('the overview sends the filter it shows', (tester) async {
    final sent = <_Sent>[];
    await _pumpOverview(tester, _server(sent));
    expect(_queueAsks(sent), [
      {'limit': 20},
    ]);
    await _openFilter(tester);
    await _tapChip(tester, 'Shows');
    await _tapChip(tester, 'Declined');
    await _tapChip(tester, 'Waiting');
    expect(_queueAsks(sent).skip(1), [
      {'limit': 20, 'states': <Object>[], 'kind': 'show'},
      {
        'limit': 20,
        'states': ['declined'],
        'kind': 'show',
      },
      {
        'limit': 20,
        'states': ['waiting', 'declined'],
        'kind': 'show',
      },
    ]);
    await _tapChip(tester, 'Clear filters');
    expect(_queueAsks(sent), hasLength(4));
  });

  testWidgets('nothing matching says so and offers Clear filters', (
    tester,
  ) async {
    final sent = <_Sent>[];
    await _pumpOverview(tester, _server(sent));
    await _openFilter(tester);
    await _tapChip(tester, 'Movies');
    await tester.tap(find.text('Show requests'));
    for (var frame = 0; frame < 10; frame++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.text('No requests match these filters'), findsOneWidget);
    expect(find.text('Clear filters'), findsOneWidget);
    await tester.tap(find.text('Clear filters'));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('No requests match these filters'), findsNothing);
    expect(find.text('Title s1'), findsWidgets);
  });

  testWidgets('Down from the filter button reaches the first card', (
    tester,
  ) async {
    final sent = <_Sent>[];
    await _pumpOverview(tester, _server(sent));
    await _openFilter(tester);
    await tester.tap(find.text('Show requests'));
    for (var frame = 0; frame < 10; frame++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(FocusManager.instance.primaryFocus?.debugLabel, 'header/filter');
    await tester.sendKeyEvent(LogicalKeyboardKey.arrowDown);
    await tester.pump();
    // The bug it pins: two header controls shared one row node, so the
    // D-pad found no card below the filter.
    expect(FocusManager.instance.primaryFocus?.debugLabel, 'grid/s1');
  });
}
