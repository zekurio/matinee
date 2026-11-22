import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart' show MaterialApp, TextField;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/permissions.dart';
import 'package:matinee/core/session.dart' show apiProvider;
import 'package:matinee/core/toasts.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/screens/requests/request_filter.dart';
import 'package:matinee/screens/requests/requests_screen.dart';

/// Toasts that time out at once, so a held answer goes.
final class _Toasts extends ToastState {
  @override
  Future<ToastResult> show(
    String message, {
    String? description,
    ToastKind kind = ToastKind.message,
    String? actionLabel,
    ToastDuration? duration,
    Duration? within,
  }) async => ToastResult.timedOut;
}

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

/// A waiting request for a title of [kind].
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

const _everything = [
  ('s1', TitleKind.show),
  ('m1', TitleKind.movie),
  ('s2', TitleKind.show),
];

/// The queue the server keeps to [body]'s kind, as it would.
Map<String, Object?> _queue(Map<String, Object?> body) {
  final kind = body['kind'];
  final waiting = [
    for (final (id, each) in _everything)
      if (kind == null || kind == each) _waiting(id, each),
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

/// A server that answers the queue's stream once and holds it open, and
/// takes everything else; each request lands in [sent].
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
      // Nothing the viewer asked for is a waiting movie.
      events.add(utf8.encode('data: {"items":[],"nextCursor":null}\n\n'));
      return http.StreamedResponse(events.stream, 200);
    }
    return http.StreamedResponse(Stream.value(utf8.encode('null')), 200);
  });
}

Future<void> _pumpOverview(
  WidgetTester tester,
  http.Client client, {
  bool queue = true,
}) async {
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
          (ref, permission) =>
              queue &&
              const [
                Permission.adminRequestRead,
                Permission.adminRequestApprove,
                Permission.adminRequestDecline,
                Permission.adminRequestRetry,
              ].contains(permission),
        ),
        toastProvider.overrideWithValue(_Toasts()),
      ],
      child: MaterialApp(
        locale: const Locale('en'),
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: MatineeTheme.data(matineeDark),
        home: RequestsScreen(queue: queue),
      ),
    ),
  );
  await tester.pump(const Duration(milliseconds: 100));
  await tester.pump(const Duration(milliseconds: 100));
}

Future<void> _openFilter(WidgetTester tester) async {
  await tester.tap(find.byType(RequestFilterButton));
  // The sheet's way in.
  for (var frame = 0; frame < 20; frame++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _tapChip(WidgetTester tester, String label) async {
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}

/// Opens the states' field, whose list is under it while it has focus, and
/// picks one.
Future<void> _tapState(WidgetTester tester, String label) async {
  await tester.tap(find.byType(TextField).last);
  await tester.pumpAndSettle();
  await _tapChip(tester, label);
}

/// Opens the Type row's sheet and picks a kind.
Future<void> _tapKind(WidgetTester tester, String label) async {
  await tester.tap(find.text('Any').last);
  await tester.pumpAndSettle();
  await _tapChip(tester, label);
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
    // Unfiltered, the queue the whole app follows, which asks for every
    // state.
    expect(_queueAsks(sent), [
      {'limit': 20},
    ]);
    await _openFilter(tester);
    await _tapKind(tester, 'Shows');
    await _tapState(tester, 'Declined');
    await _tapChip(tester, 'Waiting');
    expect(_queueAsks(sent).skip(1), [
      {'limit': 20, 'states': <Object>[], 'kind': 'show'},
      {
        'limit': 20,
        'states': ['declined'],
        'kind': 'show',
      },
      // In the badges' order, whichever was turned on first.
      {
        'limit': 20,
        'states': ['waiting', 'declined'],
        'kind': 'show',
      },
    ]);
    await _tapChip(tester, 'Clear filters');
    // Back on the app's own queue: nothing more is asked.
    expect(_queueAsks(sent), hasLength(4));
  });

  testWidgets('Add all adds only the waiting requests the filter shows', (
    tester,
  ) async {
    final sent = <_Sent>[];
    await _pumpOverview(tester, _server(sent));
    expect(find.text('Add all 3'), findsOneWidget);
    await _openFilter(tester);
    await _tapKind(tester, 'Shows');
    await _tapChip(tester, 'Show requests');
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Add all 3'), findsNothing);
    await tester.tap(find.text('Add all 2'));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(seconds: 2));
    expect(
      [
        for (final each in sent)
          if (each.path == '/admin/requests/approve-all') each.body,
      ],
      [
        {
          'ids': ['s1', 's2'],
        },
      ],
    );
  });

  testWidgets('Add all goes when the filter shows one waiting or none', (
    tester,
  ) async {
    final sent = <_Sent>[];
    await _pumpOverview(tester, _server(sent));
    await _openFilter(tester);
    await _tapKind(tester, 'Movies');
    await _tapChip(tester, 'Show requests');
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.textContaining('Add all'), findsNothing);
  });

  testWidgets('My requests sends the filter, and says when nothing matches', (
    tester,
  ) async {
    final sent = <_Sent>[];
    await _pumpOverview(tester, _server(sent), queue: false);
    List<Map<String, Object?>> asks() => [
      for (final each in sent)
        if (each.path == '/requests/mine/live') each.body,
    ];
    expect(find.text('Nothing requested yet'), findsOneWidget);
    await _openFilter(tester);
    await _tapState(tester, 'Waiting');
    await _tapKind(tester, 'Movies');
    await _tapChip(tester, 'Show requests');
    await tester.pump(const Duration(milliseconds: 500));
    expect(asks().last, {
      'limit': 20,
      'states': ['waiting'],
      'kind': 'movie',
    });
    expect(find.text('No requests match these filters'), findsOneWidget);
    await tester.tap(find.text('Clear filters'));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('No requests match these filters'), findsNothing);
  });
}
