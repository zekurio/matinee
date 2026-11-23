import 'dart:convert';

import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/l10n/app_localizations_en.dart';
import 'package:matinee/screens/settings/admin/connection_editor.dart';
import 'package:matinee/screens/settings/admin/connections_page.dart';

import '../core/fakes.dart';

const _base = 'https://media.test';
final _l = AppLocalizationsEn();

User _user(List<String> permissions) => User.fromJson({
  ...userJson('admin'),
  'role': 'admin',
  'permissions': permissions,
});

const _all = [
  Permission.fulfilmentRead,
  Permission.fulfilmentCreate,
  Permission.fulfilmentUpdate,
  Permission.fulfilmentDelete,
];

DescribedField _field(
  String key,
  String label,
  String kind,
  String section, {
  bool required = false,
  List<DescribedFieldChoice> choices = const [],
  String? folder,
}) => DescribedField(
  key: key,
  label: label,
  kind: kind,
  required: required,
  choices: choices,
  section: section,
  folder: folder,
);

FulfilmentSourceDescription _source() => FulfilmentSourceDescription(
  id: 'radarr',
  name: 'Radarr',
  kinds: const [TitleKind.movie],
  needs: const [ExternalIdSite.tmdb],
  scope: 'title',
  apiKey: true,
  rules: true,
  fields: [
    _field('url', 'API URL', 'text', FieldSection.connection, required: true),
  ],
  values: const {'url': ''},
);

FulfilmentConnection _connection({bool editable = true}) =>
    FulfilmentConnection(
      id: 'c1',
      name: 'Films',
      slug: 'FILMS',
      source: 'radarr',
      settings: const {'url': 'http://radarr:7878'},
      options: const {'qualityProfileId': '1'},
      defaultFor: const [TitleKind.movie],
      folderLibraries: const {},
      apiKey: const FulfilmentConnectionApiKey(
        source: 'saved',
        environment: false,
      ),
      landings: const [],
      editable: editable,
    );

FulfilmentOptions _options() => FulfilmentOptions(
  fields: [
    _field(
      'qualityProfileId',
      'Quality profile',
      'select',
      FieldSection.defaults,
      required: true,
      choices: const [
        DescribedFieldChoice(value: '1', label: 'HD', description: null),
      ],
    ),
  ],
  values: const {'qualityProfileId': '1'},
  rule: const [],
);

/// A server whose fulfilment answers a test sets up, and which records every
/// request.
final class _Server {
  _Server({this.connections = const []});

  final List<FulfilmentConnection> connections;
  final requests = <http.Request>[];
  bool removed = false;
  http.Response Function()? options;

  late final client = MockClient((request) async {
    requests.add(request);
    final path = request.url.path;
    if (path == '/api/v1/admin/fulfilment/sources') {
      return jsonResponse([_source().toJson()]);
    }
    if (path == '/api/v1/admin/fulfilment/connections') {
      return jsonResponse([
        if (!removed)
          for (final connection in connections) connection.toJson(),
      ]);
    }
    if (path == '/api/v1/admin/fulfilment/options') {
      return options?.call() ?? jsonResponse(_options().toJson());
    }
    if (path == '/api/v1/admin/fulfilment/test') {
      return http.Response('', 204);
    }
    if (path == '/api/v1/admin/fulfilment/connections/c1' &&
        request.method == 'DELETE') {
      removed = true;
      return http.Response('', 204);
    }
    if (path == '/api/v1/libraries') return jsonResponse(const []);
    return http.Response('', 404);
  });

  List<http.Request> to(String path) => [
    for (final request in requests)
      if (request.url.path == path) request,
  ];
}

Future<void> _pump(
  WidgetTester tester,
  Widget home,
  _Server server, {
  List<String> permissions = _all,
  GoRouter? router,
}) async {
  tester.view.physicalSize = const Size(500, 1200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  addTearDown(server.client.close);
  final app = router == null
      ? MaterialApp(
          locale: const Locale('en'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          theme: MatineeTheme.data(matineeDark),
          home: home,
        )
      : MaterialApp.router(
          locale: const Locale('en'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          theme: MatineeTheme.data(matineeDark),
          routerConfig: router,
        );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiProvider.overrideWithValue(
          MatineeApi(base: Uri.parse(_base), client: server.client),
        ),
        authStateProvider.overrideWithValue(
          SignedIn(_base, _user(permissions)),
        ),
      ],
      child: app,
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the list offers only what the permissions allow', (
    tester,
  ) async {
    final readOnly = _Server(connections: [_connection()]);
    await _pump(
      tester,
      const ConnectionsPage(),
      readOnly,
      permissions: const [Permission.fulfilmentRead],
    );

    expect(find.text(_l.webConnectionsAdd), findsNothing);
    await tester.tap(find.text('Films'));
    await tester.pumpAndSettle();
    expect(find.text(_l.webConnectionsTest), findsNothing);
    expect(find.text(_l.webConnectionsEdit), findsNothing);
    expect(find.text(_l.webConnectionsDelete), findsNothing);

    // Choosing a connection's defaults asks the server about them, so adding
    // one takes update as well as create.
    final createOnly = _Server(connections: [_connection()]);
    await _pump(
      tester,
      const ConnectionsPage(),
      createOnly,
      permissions: const [
        Permission.fulfilmentRead,
        Permission.fulfilmentCreate,
      ],
    );
    expect(find.text(_l.webConnectionsAdd), findsNothing);

    final allowed = _Server(connections: [_connection()]);
    await _pump(tester, const ConnectionsPage(), allowed);

    expect(find.text(_l.webConnectionsAdd), findsOneWidget);
    await tester.tap(find.text('Films'));
    await tester.pumpAndSettle();
    expect(find.text(_l.webConnectionsTest), findsOneWidget);
    expect(find.text(_l.webConnectionsEdit), findsOneWidget);
    expect(find.text(_l.webConnectionsDelete), findsOneWidget);
  });

  testWidgets('a source draws its fields, tests, and saves what they hold', (
    tester,
  ) async {
    final server = _Server();
    final router = GoRouter(
      initialLocation: '/admin/connection',
      routes: [
        GoRoute(path: '/', builder: (context, state) => const SizedBox()),
        GoRoute(
          path: '/admin/connection',
          builder: (context, state) => const ConnectionEditorScreen(),
        ),
      ],
    );
    addTearDown(router.dispose);
    await _pump(tester, const SizedBox(), server, router: router);

    // The source's own words, not words the app keeps for one service.
    expect(find.text('API URL'), findsOneWidget);
    expect(find.text(_l.webConnectionsDialogDefaultMovie), findsOneWidget);
    expect(find.text(_l.webConnectionsDialogTestFirst), findsOneWidget);

    await tester.enterText(find.byType(EditableText).at(0), 'Films');
    await tester.pump();
    expect(
      tester
          .widget<EditableText>(find.byType(EditableText).at(1))
          .controller
          .text,
      'FILMS',
    );
    await tester.enterText(
      find.byType(EditableText).at(2),
      'http://radarr:7878',
    );
    await tester.pump();

    await tester.tap(find.text(_l.webConnectionsDialogTest));
    await tester.pumpAndSettle();
    expect(find.text(_l.webConnectionsConnected), findsOneWidget);
    // The server's choices, drawn from what it describes.
    expect(find.text('Quality profile'), findsOneWidget);
    final asked = server.to('/api/v1/admin/fulfilment/options').single;
    expect((jsonDecode(asked.body) as Map<String, Object?>)['settings'], {
      'url': 'http://radarr:7878',
    });

    await tester.tap(
      find.widgetWithText(MatineeButton, _l.webConnectionsDialogCreate),
    );
    await tester.pumpAndSettle();
    final saved = server.to('/api/v1/admin/fulfilment/connections').last;
    final body = jsonDecode(saved.body) as Map<String, Object?>;
    expect(body['name'], 'Films');
    expect(body['slug'], 'FILMS');
    expect(body['source'], 'radarr');
    expect(body['settings'], {'url': 'http://radarr:7878'});
    expect(body['options'], {'qualityProfileId': '1'});
    expect(body['defaultFor'], [TitleKind.movie]);
    expect(body['apiKey'], isNull);
  });

  testWidgets('a failed test shows the server\'s words', (tester) async {
    final server = _Server()
      ..options = () => jsonResponse({
        'code': 'BAD_REQUEST',
        'status': 400,
        'message': 'This URL is not a Radarr server.',
      }, 400);
    await _pump(tester, const ConnectionEditorScreen(), server);

    await tester.enterText(find.byType(EditableText).at(0), 'Films');
    await tester.enterText(
      find.byType(EditableText).at(2),
      'http://elsewhere:7878',
    );
    await tester.tap(find.text(_l.webConnectionsDialogTest));
    await tester.pumpAndSettle();
    expect(find.text('This URL is not a Radarr server.'), findsOneWidget);
    expect(find.text(_l.webConnectionsConnected), findsNothing);
  });

  testWidgets('a connection goes after the confirmation says yes', (
    tester,
  ) async {
    final server = _Server(connections: [_connection()]);
    await _pump(tester, const ConnectionsPage(), server);

    await tester.tap(find.text('Films'));
    await tester.pumpAndSettle();
    await tester.tap(find.text(_l.webConnectionsDelete));
    await tester.pumpAndSettle();
    expect(find.text(_l.webConnectionsDeleteTitle('Films')), findsOneWidget);

    await tester.tap(find.text(_l.webConnectionsDeleteConfirm));
    await tester.pumpAndSettle();
    expect(server.removed, isTrue);
    expect(find.text('Films'), findsNothing);
    expect(find.text(_l.webConnectionsEmptyTitle), findsOneWidget);
  });
}
