import 'dart:convert';

import 'package:flutter/material.dart' show MaterialApp, TextField;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart'
    show SignedIn, apiProvider, authStateProvider;
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/l10n/app_localizations_en.dart';
import 'package:matinee/screens/settings/admin/access_groups_page.dart';
import 'package:matinee/screens/settings/admin/admin_parts.dart';

import '../../core/fakes.dart';

Map<String, Object?> _policy({bool downloads = true}) => {
  'libraries': {'all': true, 'ids': <String>[]},
  'maxBitrate': null,
  'transcode': true,
  'maxStreams': null,
  'downloads': downloads,
  'requests': 'off',
  'requestLimit': null,
  'apiTokens': false,
  'manages': {
    'requests': 'none',
    'connections': 'none',
    'libraries': 'none',
    'metadata': 'none',
    'users': 'none',
    'server': 'none',
  },
};

Map<String, Object?> _group({
  String id = 'family',
  String name = 'Family',
  bool everyone = false,
  String? providerGroup,
  int members = 2,
}) => {
  'id': id,
  'name': name,
  'everyone': everyone,
  'providerGroup': providerGroup,
  'policy': _policy(),
  'members': members,
  'createdAt': '2026-01-01T00:00:00.000Z',
};

final _playbackOptions = {
  'qualities': <Object>[],
  'maxBitrate': null,
  'downloads': false,
  'downloadVideoPresets': <Object>[],
  'skipSteps': <Object>[],
  'videoCodecs': <Object>[],
  'audioCodecs': <Object>[],
  'audioLanguages': <Object>[],
  'subtitleLanguages': <Object>[],
};

/// The server the pages read: access groups to list and change, and the
/// rest empty. [refusal] answers a change with the server's reason, as
/// `requireOwn` does for a group that grants what its maker lacks.
final class _Backend {
  _Backend({List<Map<String, Object?>>? groups})
    : groups = [
        _group(id: 'everyone', name: 'Everyone', everyone: true, members: 0),
        ...?groups,
      ];

  final List<Map<String, Object?>> groups;
  String? refusal;
  final calls = <({String method, String path, String? body})>[];

  late final client = MockClient(_answer);

  Future<http.Response> _answer(http.Request request) async {
    final path = request.url.path;
    final method = request.method;
    calls.add((method: method, path: path, body: request.body));
    if (refusal case final refusal? when method != 'GET') {
      return http.Response(
        jsonEncode({'message': refusal}),
        403,
        headers: {'content-type': 'application/json'},
      );
    }
    if (method == 'GET' && path == '/api/v1/admin/groups') {
      return jsonResponse(groups);
    }
    if (method == 'POST' && path == '/api/v1/admin/groups') {
      final body = jsonDecode(request.body) as Map<String, Object?>;
      final created = _group(
        id: 'new',
        name: body['name']! as String,
        providerGroup: body['providerGroup'] as String?,
      );
      groups.add(created);
      return jsonResponse(created, 201);
    }
    if (path.startsWith('/api/v1/admin/groups/')) {
      final id = path.split('/').last;
      final index = groups.indexWhere((group) => group['id'] == id);
      if (method == 'DELETE') {
        groups.removeAt(index);
        return http.Response('', 204);
      }
      if (method == 'PUT') {
        final body = jsonDecode(request.body) as Map<String, Object?>;
        groups[index] = {
          ...groups[index],
          'name': body['name'],
          'providerGroup': body['providerGroup'],
          'policy': body['policy'],
        };
        return jsonResponse(groups[index]);
      }
    }
    if (method == 'GET' &&
        (path == '/api/v1/libraries' ||
            path == '/api/v1/admin/users' ||
            path == '/api/v1/admin/invites' ||
            path == '/api/v1/admin/provider-groups')) {
      return jsonResponse(<Object>[]);
    }
    if (method == 'GET' && path == '/api/v1/playback/options') {
      return jsonResponse(_playbackOptions);
    }
    return http.Response('', 404);
  }
}

User _user(List<String> permissions) =>
    User.fromJson({...userJson('ada'), 'permissions': permissions});

Widget _app(Widget page, _Backend backend, List<String> permissions) {
  return ProviderScope(
    overrides: [
      apiProvider.overrideWithValue(
        MatineeApi(
          base: Uri.parse('https://media.test'),
          client: backend.client,
        ),
      ),
      authStateProvider.overrideWithValue(
        SignedIn('https://media.test', _user(permissions)),
      ),
    ],
    child: MaterialApp(
      locale: const Locale('en'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      theme: MatineeTheme.data(matineeDark),
      home: page,
    ),
  );
}

Future<void> _pump(
  WidgetTester tester,
  Widget page, {
  required _Backend backend,
  required List<String> permissions,
}) async {
  tester.view.physicalSize = const Size(500, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  addTearDown(backend.client.close);
  await tester.pumpWidget(_app(page, backend, permissions));
  await tester.pumpAndSettle();
}

void main() {
  final l = AppLocalizationsEn();

  // The bug it pins: a group list showed the controls its account's
  // permissions don't call, so every one of them failed at the server.
  testWidgets('reading groups only lists them, without actions', (
    tester,
  ) async {
    await _pump(
      tester,
      const AccessGroupsPage(),
      backend: _Backend(groups: [_group()]),
      permissions: [Permission.groupRead],
    );

    expect(find.textContaining('Family'), findsOneWidget);
    expect(_barButton(l.webAccessGroupsCreate), findsNothing);

    await tester.tap(find.byKey(const ValueKey('family')));
    await tester.pumpAndSettle();
    expect(find.text(l.webAccessGroupEdit), findsNothing);
    expect(find.text(l.webAccessGroupDelete), findsNothing);
  });

  testWidgets('creating, changing and deleting follow the permissions', (
    tester,
  ) async {
    await _pump(
      tester,
      const AccessGroupsPage(),
      backend: _Backend(groups: [_group()]),
      permissions: [
        Permission.groupRead,
        Permission.groupCreate,
        Permission.groupUpdate,
        Permission.groupDelete,
      ],
    );

    expect(_barButton(l.webAccessGroupsCreate), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('family')));
    await tester.pumpAndSettle();
    expect(find.text(l.webAccessGroupEdit), findsOneWidget);
    expect(find.text(l.webAccessGroupDelete), findsOneWidget);
    await tester.tapAt(const Offset(10, 30));
    await tester.pumpAndSettle();

    // Everyone holds every account, so it can't be deleted.
    await tester.tap(find.byKey(const ValueKey('everyone')));
    await tester.pumpAndSettle();
    expect(find.text(l.webAccessGroupEdit), findsOneWidget);
    expect(find.text(l.webAccessGroupDelete), findsNothing);
  });

  // The bug it pins: the form saved what the old group held, not what the
  // field showed, and the bar couldn't say "Saved" before it went.
  testWidgets('a renamed group saves what was typed', (tester) async {
    final backend = _Backend(groups: [_group()]);
    await _pump(
      tester,
      const AccessGroupPage(id: 'family'),
      backend: backend,
      permissions: [Permission.groupRead, Permission.groupUpdate],
    );

    await tester.enterText(find.byType(TextField).first, 'Kids');
    await tester.pumpAndSettle();
    await tester.tap(find.text(l.saveBarSave));
    await tester.pumpAndSettle();

    final put = backend.calls.lastWhere((call) => call.method == 'PUT');
    expect((jsonDecode(put.body!) as Map<String, Object?>)['name'], 'Kids');
    expect(find.text(l.webCommonSaveBarDone), findsOneWidget);

    await tester.pump(savedFor);
    await tester.pumpAndSettle();
  });

  testWidgets("the server's refusal shows in the save bar", (tester) async {
    final refusal = l.webServerRpcOwnPermissions('group.update');
    final backend = _Backend(groups: [_group()])..refusal = refusal;
    await _pump(
      tester,
      const AccessGroupPage(id: 'family'),
      backend: backend,
      permissions: [Permission.groupRead, Permission.groupUpdate],
    );

    await tester.enterText(find.byType(TextField).first, 'Kids');
    await tester.pumpAndSettle();
    await tester.tap(find.text(l.saveBarSave));
    await tester.pumpAndSettle();

    expect(find.textContaining(refusal), findsOneWidget);
  });

  testWidgets('a new group the server refuses says why on the page', (
    tester,
  ) async {
    final refusal = l.webServerRpcOwnPermissions('group.create');
    final backend = _Backend(groups: [_group()])..refusal = refusal;
    await _pump(
      tester,
      const AccessGroupPage(),
      backend: backend,
      permissions: [Permission.groupRead, Permission.groupCreate],
    );

    await tester.enterText(find.byType(TextField).first, 'Kids');
    await tester.pumpAndSettle();
    await tester.tap(find.text(l.webAccessGroupCreate));
    await tester.pumpAndSettle();

    expect(find.text(refusal), findsOneWidget);
  });

  testWidgets('a group is deleted once the confirmation is answered', (
    tester,
  ) async {
    final backend = _Backend(groups: [_group()]);
    await _pump(
      tester,
      const AccessGroupsPage(),
      backend: backend,
      permissions: [Permission.groupRead, Permission.groupDelete],
    );

    await tester.tap(find.byKey(const ValueKey('family')));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l.webAccessGroupDelete));
    await tester.pumpAndSettle();

    expect(find.text(l.webAccessGroupDeleteTitle('Family')), findsOneWidget);
    await tester.tap(find.text(l.webAccessGroupDelete).last);
    await tester.pumpAndSettle();

    expect(backend.calls.where((call) => call.method == 'DELETE'), isNotEmpty);
    expect(find.byKey(const ValueKey('family')), findsNothing);
  });

  testWidgets('a new group is created and its page closes', (tester) async {
    final backend = _Backend(groups: [_group()]);
    final router = GoRouter(
      initialLocation: '/admin/groups',
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) =>
              const SizedBox(key: ValueKey('home'), child: Text('Home')),
          routes: [
            GoRoute(
              path: 'admin/groups',
              builder: (context, state) => const AccessGroupPage(),
            ),
          ],
        ),
      ],
    );
    addTearDown(router.dispose);
    tester.view.physicalSize = const Size(500, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    addTearDown(backend.client.close);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          apiProvider.overrideWithValue(
            MatineeApi(
              base: Uri.parse('https://media.test'),
              client: backend.client,
            ),
          ),
          authStateProvider.overrideWithValue(
            SignedIn(
              'https://media.test',
              _user([Permission.groupRead, Permission.groupCreate]),
            ),
          ),
        ],
        child: MaterialApp.router(
          locale: const Locale('en'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          theme: MatineeTheme.data(matineeDark),
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).first, 'Kids');
    await tester.pump();
    await tester.tap(find.text(l.webAccessGroupCreate));
    await tester.pumpAndSettle();

    final post = backend.calls.lastWhere((call) => call.method == 'POST');
    expect((jsonDecode(post.body!) as Map<String, Object?>)['name'], 'Kids');
    expect(find.byKey(const ValueKey('home')), findsOneWidget);
  });
}

/// The page bar's button that says [label] to a screen reader.
Finder _barButton(String label) => find.byWidgetPredicate(
  (widget) => widget is PageBarButton && widget.label == label,
);
