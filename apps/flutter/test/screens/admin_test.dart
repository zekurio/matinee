import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/screens/settings/admin/library_editor.dart';
import 'package:matinee/screens/settings/admin/user_access_page.dart';
import 'package:matinee/screens/settings/settings_screen.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../core/fakes.dart';
import '../media/harness.dart';
import 'admin_backend.dart';

final _admin = SignedIn(
  '$server',
  User.fromJson({...userJson('ada'), 'role': 'admin'}),
);
final _plain = SignedIn('$server', User.fromJson(userJson('grace')));

List<Override> _signedInAs(AuthState auth) => [
  if (auth case SignedIn(:final user))
    savedServersProvider.overrideWithValue([
      SavedServer(
        origin: '$server/',
        address: '$server',
        name: null,
        user: user,
        active: true,
      ),
    ]),
];

Future<AdminBackend> _pump(
  WidgetTester tester,
  String page, {
  Widget? screen,
  AdminBackend? backend,
  AuthState? auth,
  Size size = const Size(412, 915),
  KitColors colors = matineeDark,
}) async {
  final server = backend ?? AdminBackend();
  await pumpScreen(
    tester,
    screen ?? SettingsPageScreen(pageKey: page),
    client: server.client,
    auth: auth ?? _admin,
    overrides: _signedInAs(auth ?? _admin),
    size: size,
    colors: colors,
  );
  return server;
}

/// Scrolls the page until [finder] is on screen, then taps it.
Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(
    finder,
    200,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(loadFont);

  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });

  group('who sees it', () {
    testWidgets('an admin gets the Administration section', (tester) async {
      await _pump(tester, '');
      await tester.scrollUntilVisible(
        find.text('Administration'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      for (final name in [
        'Libraries',
        'Users',
        'Authentication',
        'Transcoding',
        'Trickplay',
        'Jobs',
        'Branding',
      ]) {
        expect(find.text(name), findsOneWidget);
      }
      await _tap(tester, find.text('Jobs'));
      expect(find.text('/settings/jobs'), findsOneWidget);
    });

    testWidgets('a plain account sees none of it', (tester) async {
      await _pump(tester, '', auth: _plain);
      expect(find.text('Administration'), findsNothing);
      expect(find.text('Transcoding'), findsNothing);
    });

    testWidgets('a plain account opening an admin page gets Settings', (
      tester,
    ) async {
      final backend = await _pump(tester, 'users', auth: _plain);
      expect(find.text('Offline mode'), findsOneWidget);
      expect(find.text('grace'), findsNothing);
      expect(backend.sent, isEmpty);
    });
  });

  group('libraries', () {
    testWidgets('lists each library with its titles', (tester) async {
      await _pump(tester, 'libraries');
      expect(find.text('Movies'), findsOneWidget);
      expect(find.text('Shows'), findsOneWidget);
      expect(find.textContaining('TMDB'), findsOneWidget);
      expect(find.text('Add library'), findsOneWidget);
    });

    testWidgets('removing asks first, and Cancel keeps it', (tester) async {
      final backend = await _pump(tester, 'libraries');
      await tester.tap(find.text('Movies'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove'));
      await tester.pumpAndSettle();
      expect(find.text('Remove Movies?'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(backend.sent, isEmpty);
      expect(find.text('Movies'), findsOneWidget);
    });

    testWidgets('removing after the confirmation drops it', (tester) async {
      final backend = await _pump(tester, 'libraries');
      await tester.tap(find.text('Movies'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove library'));
      await tester.pumpAndSettle();
      expect(backend.sent.single.method, 'DELETE');
      expect(backend.sent.single.path, '/libraries/movies1');
      expect(find.text('Movies'), findsNothing);
    });
  });

  group('library editor', () {
    testWidgets('saves the edited name', (tester) async {
      final backend = await _pump(
        tester,
        '',
        screen: const LibraryEditorScreen(id: 'movies1'),
      );
      expect(find.text('Edit library'), findsOneWidget);
      await tester.enterText(find.byType(MatineeTextField).first, 'Films');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(backend.sent.single.method, 'PUT');
      expect((backend.sent.single.body! as JsonMap)['name'], 'Films');
    });

    testWidgets("puts the server's word under the name", (tester) async {
      final backend = AdminBackend();
      backend.refusing['/libraries/movies1'] = [
        (['name'], 'A library needs a name.'),
      ];
      await _pump(
        tester,
        '',
        backend: backend,
        screen: const LibraryEditorScreen(id: 'movies1'),
      );
      await tester.enterText(find.byType(MatineeTextField).first, '');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(find.text('A library needs a name.'), findsOneWidget);
      expect(backend.libraries.first['name'], 'Movies');
    });

    testWidgets('the folder picker lists the folders', (tester) async {
      await _pump(
        tester,
        '',
        screen: const FolderPickerScreen(request: FolderPickerRequest()),
      );
      expect(find.text('movies'), findsOneWidget);
      expect(find.text('shows'), findsOneWidget);
    });

    testWidgets('system Back in the folder picker goes up, then leaves', (
      tester,
    ) async {
      await _pump(
        tester,
        '',
        screen: const FolderPickerScreen(
          request: FolderPickerRequest(start: '/media/movies'),
        ),
      );
      String shown() => tester
          .widget<EditableText>(find.byType(EditableText))
          .controller
          .text;
      expect(shown(), '/media/movies');
      expect(await tester.binding.handlePopRoute(), isTrue);
      await tester.pumpAndSettle();
      expect(shown(), '/media');
      expect(await tester.binding.handlePopRoute(), isTrue);
      await tester.pumpAndSettle();
      expect(shown(), '/');
      // At the top, Back is the system's again, and leaves.
      expect(await tester.binding.handlePopRoute(), isFalse);
    });

    testWidgets('the folder picker keeps to the settings pages\' width', (
      tester,
    ) async {
      await _pump(
        tester,
        '',
        size: const Size(1280, 800),
        screen: const FolderPickerScreen(request: FolderPickerRequest()),
      );
      expect(tester.getSize(find.byType(EditableText)).width, lessThan(720));
      expect(
        tester.getRect(find.text('movies')).left,
        lessThan(CardMetrics.gutter + 80),
      );
      final add = tester.getRect(
        find.ancestor(
          of: find.textContaining('Add'),
          matching: find.byType(MatineeButton),
        ),
      );
      expect(add.width, lessThanOrEqualTo(720));
    });
  });

  group('access', () {
    testWidgets('shows what an account gets and saves an override', (
      tester,
    ) async {
      final backend = await _pump(
        tester,
        '',
        screen: const UserAccessPage(userId: 'id-grace'),
      );
      expect(find.text('Access for grace'), findsOneWidget);
      expect(find.text('What grace gets'), findsOneWidget);
      // The override's row, under the summary's.
      await tester.scrollUntilVisible(
        find.text('Set on this account'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.drag(find.byType(Scrollable).first, const Offset(0, -300));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Video encoding').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Not allowed').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();
      expect(backend.sent.single.path, '/admin/users/id-grace/access');
      final body = backend.sent.single.body! as JsonMap;
      expect((body['override']! as JsonMap)['transcode'], isFalse);
    });

    testWidgets('a tablet shows the values whole', (tester) async {
      await _pump(
        tester,
        '',
        screen: const UserAccessPage(userId: 'id-grace'),
        size: const Size(800, 1280),
      );
      final cut = [
        for (final paragraph in tester.renderObjectList<RenderParagraph>(
          find.descendant(
            of: find.byType(UserAccessPage),
            matching: find.byType(RichText),
          ),
        ))
          if (paragraph.didExceedMaxLines) paragraph.text.toPlainText(),
      ];
      expect(cut, isEmpty);
    });

    testWidgets('admin_access_phone_dark', (tester) async {
      await _pump(tester, '', screen: const UserAccessPage(userId: 'id-grace'));
      await expectLater(
        find.byType(UserAccessPage),
        matchesGoldenFile('goldens/admin_access_phone_dark.png'),
      );
    });
  });

  group('users', () {
    testWidgets('lists the accounts and the invite links', (tester) async {
      await _pump(tester, 'users');
      expect(find.textContaining('ada'), findsWidgets);
      expect(find.text('grace'), findsOneWidget);
      expect(find.text('Family'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('For Linus'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('For Linus'), findsOneWidget);
    });

    testWidgets('an account never seen says when it joined', (tester) async {
      final backend = AdminBackend();
      backend.users = [
        ...backend.users,
        {...adminUserJson('linus'), 'lastSeenAt': null, 'sessions': 0},
      ];
      await _pump(tester, 'users', backend: backend);
      expect(
        find.text('Signed out · Joined Jan 1, 2026 · 1 passkey'),
        findsOneWidget,
      );
    });

    testWidgets('deleting an account asks first', (tester) async {
      final backend = await _pump(tester, 'users');
      await tester.tap(find.text('grace'));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Delete').last);
      await tester.pumpAndSettle();
      expect(backend.sent, isEmpty);
      expect(find.byType(Dialog), findsOneWidget);
    });
  });

  group('jobs', () {
    testWidgets('lists the queues and tasks', (tester) async {
      await _pump(tester, 'jobs');
      expect(find.text('Library scans'), findsOneWidget);
      // Once as a queue, once among the queues whose concurrency is set.
      expect(find.text('Trickplay images'), findsNWidgets(2));
    });

    testWidgets('clearing a queue asks first', (tester) async {
      final backend = await _pump(tester, 'jobs');
      await tester.tap(find.text('Library scans'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Clear waiting jobs'));
      await tester.pumpAndSettle();
      expect(find.text('Clear the jobs waiting in Library scans?'), findsOne);
      expect(backend.sent, isEmpty);
      await tester.tap(find.text('Clear waiting jobs').last);
      await tester.pumpAndSettle();
      expect(backend.sent.single.path, '/admin/jobs/library-scan/clear');
    });
  });

  group('save bar', () {
    testWidgets('trickplay saves the fields together', (tester) async {
      final backend = await _pump(tester, 'trickplay');
      expect(find.text('Save changes'), findsNothing);
      await tester.tap(find.text('Keyframes only'));
      await tester.pumpAndSettle();
      expect(find.text('Unsaved changes'), findsOneWidget);
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();
      expect(backend.sent.single.method, 'PUT');
      expect(backend.sent.single.path, '/admin/trickplay');
      expect((backend.sent.single.body! as JsonMap)['keyframesOnly'], isFalse);
      expect(find.text('Save changes'), findsNothing);
    });

    testWidgets('Reset takes the edits back', (tester) async {
      final backend = await _pump(tester, 'trickplay');
      await tester.tap(find.text('Keyframes only'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Reset'));
      await tester.pumpAndSettle();
      expect(find.text('Save changes'), findsNothing);
      expect(backend.sent, isEmpty);
    });

    testWidgets('a refusal shows at its field and in the bar', (tester) async {
      final backend = AdminBackend();
      backend.refusing['/admin/auth'] = [
        (['oidc', 'issuerUrl'], 'Enter an http or https URL.'),
      ];
      await _pump(tester, 'authentication', backend: backend);
      await tester.enterText(
        find.byType(MatineeTextField).at(1),
        'id.example.com',
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();
      expect(backend.sent.single.path, '/admin/auth');
      expect(find.text('Enter an http or https URL.'), findsOneWidget);
      expect(find.text("Couldn't save your changes"), findsOneWidget);
      // The edit stays, ready for another try.
      expect(find.text('Try again'), findsOneWidget);
    });

    testWidgets('branding refuses a color at its field', (tester) async {
      final backend = AdminBackend();
      backend.refusing['/admin/branding'] = [
        (['themeAccents', 'light'], 'Enter a color like #3b5bdb.'),
      ];
      await _pump(tester, 'branding', backend: backend);
      await tester.enterText(find.byType(MatineeTextField).first, '#zzz');
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();
      expect(find.text('Enter a color like #3b5bdb.'), findsOneWidget);
      expect(backend.branding['themeAccents'], {'light': null, 'dark': null});
    });

    testWidgets('branding stores the default accent as none', (tester) async {
      final backend = await _pump(tester, 'branding');
      // The second preset, then Matinee's own again.
      final swatches = find.byWidgetPredicate(
        (widget) =>
            widget is PressIndication &&
            (widget.label == 'Default' || '${widget.label}'.contains(' / ')),
      );
      expect(swatches, findsNWidgets(8));
      await tester.tap(swatches.at(2));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save changes'));
      await tester.pumpAndSettle();
      expect(backend.branding['themeAccents'], {
        'light': '#0f766e',
        'dark': '#2dd4bf',
      });
    });
  });

  testWidgets('transcoding shows ffmpeg and its settings', (tester) async {
    await _pump(tester, 'transcoding');
    expect(find.textContaining('7.1'), findsWidgets);
  });

  for (final (name, page, colors) in [
    ('admin_libraries_phone_dark', 'libraries', matineeDark),
    ('admin_users_phone_light', 'users', matineeLight),
    ('admin_jobs_phone_dark', 'jobs', matineeDark),
    ('admin_authentication_phone_dark', 'authentication', matineeDark),
    ('admin_branding_phone_light', 'branding', matineeLight),
  ]) {
    testWidgets(name, (tester) async {
      await _pump(tester, page, colors: colors);
      await expectLater(
        find.byType(SettingsPageScreen),
        matchesGoldenFile('goldens/$name.png'),
      );
    });
  }

  testWidgets('admin_users_tablet_dark', (tester) async {
    await _pump(tester, 'users', size: const Size(1280, 800));
    await expectLater(
      find.byType(SettingsPageScreen),
      matchesGoldenFile('goldens/admin_users_tablet_dark.png'),
    );
  });
}
