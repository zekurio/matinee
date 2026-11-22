import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/image_picker.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/core/toasts.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/media/actions.dart';
import 'package:matinee/screens/metadata/identify_screen.dart';
import 'package:matinee/screens/metadata/images_screen.dart';

import '../core/fakes.dart';
import '../media/fixtures.dart';
import '../media/harness.dart';
import 'title_backend.dart';

/// Toasts the screens showed, without their timers.
final class RecordedToasts extends ToastState {
  final shown = <(String, String?)>[];

  @override
  Future<ToastResult> show(
    String message, {
    String? description,
    ToastKind kind = ToastKind.message,
    String? actionLabel,
    String? closeLabel,
    ToastDuration? duration,
    Duration? within,
  }) {
    shown.add((message, description));
    return Future.value(ToastResult.dismissed);
  }
}

JsonMap _image(String slot, String? art, {bool chosen = false}) => {
  'slot': slot,
  'image': art == null ? null : artJson(art),
  'chosen': chosen,
  'uploaded': false,
};

JsonMap _remote(String id, {String? language = 'en'}) => {
  'id': id,
  'preview': artJson('preview-$id'),
  'width': 1000,
  'height': 1500,
  'language': language,
};

/// The server the metadata pages talk to: the title, its library and
/// provider, the matches, and the images, with every change recorded.
final class MetadataBackend {
  MetadataBackend({bool configured = true, bool matched = true}) {
    answers.addAll({
      'GET /api/v1/titles/m1': fullTitleJson(
        'm1',
        name: 'Arrival',
        provider: matched ? 'tmdb' : null,
      ),
      'GET /api/v1/libraries': [
        {...libraryJson('lib-movie'), 'metadataProvider': 'tmdb'},
      ],
      'GET /api/v1/metadata/providers': [
        {
          'id': 'tmdb',
          'name': 'TMDB',
          'description': '',
          'episodes': true,
          'configured': configured,
          'setup': null,
        },
      ],
      'GET /api/v1/titles/m1/matches': [
        {
          'provider': 'tmdb',
          'id': '329865',
          'name': 'Arrival',
          'year': 2016,
          'overview': 'Linguists talk to aliens.',
          'poster': null,
        },
        {
          'provider': 'tmdb',
          'id': '11',
          'name': 'The Arrival',
          'year': 1996,
          'overview': null,
          'poster': null,
        },
      ],
      'POST /api/v1/titles/m1/identify': fullTitleJson('m1', name: 'Arrival'),
      'GET /api/v1/titles/m1/images': [
        _image('poster', 'po-1', chosen: true),
        _image('backdrop', 'bd-1'),
        _image('logo', null),
      ],
      'GET /api/v1/titles/m1/images/poster/remote': [
        _remote('po-1'),
        _remote('po-2', language: 'ja'),
        _remote('po-3', language: null),
      ],
      'PUT /api/v1/titles/m1/images/poster': [
        _image('poster', 'po-2', chosen: true),
        _image('backdrop', 'bd-1'),
        _image('logo', null),
      ],
      'POST /api/v1/titles/m1/images/poster': [
        {..._image('poster', 'up-1', chosen: true), 'uploaded': true},
        _image('backdrop', 'bd-1'),
        _image('logo', null),
      ],
      'POST /api/v1/titles/m1/images/poster/reset': [
        _image('poster', 'po-1'),
        _image('backdrop', 'bd-1'),
        _image('logo', null),
      ],
    });
  }

  /// Each `METHOD path`'s answer, as JSON.
  final answers = <String, Object?>{};

  /// Requests answering with the server's message, by `METHOD path`.
  final failing = <String, String>{};

  /// Every request, as `METHOD path`, its query, and its body.
  final requests = <(String, Map<String, String>, String)>[];

  late final client = MockClient((request) async {
    final key = '${request.method} ${request.url.path}';
    requests.add((key, request.url.queryParameters, request.body));
    if (failing[key] case final message?) {
      return _json({'message': message}, 500);
    }
    if (!answers.containsKey(key)) return http.Response('', 404);
    return _json(answers[key], 200);
  });

  List<(String, Map<String, String>, String)> sent(String key) => [
    for (final request in requests)
      if (request.$1 == key) request,
  ];

  static http.Response _json(Object? body, int status) => http.Response.bytes(
    utf8.encode(jsonEncode(body)),
    status,
    headers: {HttpHeaders.contentTypeHeader: 'application/json'},
  );
}

final _admin = SignedIn(
  '$server',
  User.fromJson({...userJson('ada'), 'role': 'admin', 'permissions': ['all']}),
);

/// A button that opens [screen] over the first page, so it can go back.
class _Opener extends StatelessWidget {
  const _Opener(this.screen);

  final Widget screen;

  @override
  Widget build(BuildContext context) => Center(
    child: MatineeButton(
      onPressed: () => Navigator.of(context)
          .push(PageRouteBuilder<void>(pageBuilder: (context, _, _) => screen)),
      child: const Text('Open'),
    ),
  );
}

Future<RecordedToasts> _pump(
  WidgetTester tester,
  Widget screen,
  MetadataBackend backend, {
  Size size = const Size(412, 915),
  KitColors colors = matineeDark,
  ImagePicker? picker,
  bool opened = false,
}) async {
  final toasts = RecordedToasts();
  await pumpScreen(
    tester,
    opened ? _Opener(screen) : screen,
    client: backend.client,
    size: size,
    colors: colors,
    auth: _admin,
    overrides: [
      toastProvider.overrideWithValue(toasts),
      if (picker != null) imagePickerProvider.overrideWithValue(picker),
    ],
  );
  if (opened) {
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
  }
  return toasts;
}

void main() {
  setUpAll(loadFont);

  group('identify', () {
    testWidgets('opens on a search for the name and year', (tester) async {
      final backend = MetadataBackend();
      await _pump(tester, const IdentifyScreen(titleId: 'm1'), backend);
      expect(find.text('Fix match'), findsOneWidget);
      expect(
        find.text('Search TMDB and pick the entry for /media/m1.'),
        findsOneWidget,
      );
      expect(backend.sent('GET /api/v1/titles/m1/matches').single.$2, {
        'query': 'Arrival',
        'year': '2016',
      });
      expect(find.text('Linguists talk to aliens.'), findsOneWidget);
      expect(find.text('Current match'), findsOneWidget);
      expect(find.text('The Arrival'), findsOneWidget);
    });

    testWidgets('searches again for what was typed', (tester) async {
      final backend = MetadataBackend();
      await _pump(tester, const IdentifyScreen(titleId: 'm1'), backend);
      await tester.enterText(find.byType(EditableText).first, 'Story');
      await tester.enterText(find.byType(EditableText).last, '19x96');
      await tester.tap(find.text('Search'));
      await tester.pumpAndSettle();
      expect(backend.sent('GET /api/v1/titles/m1/matches').last.$2, {
        'query': 'Story',
        'year': '1996',
      });
    });

    testWidgets('says when the provider found nothing', (tester) async {
      final backend = MetadataBackend()
        ..answers['GET /api/v1/titles/m1/matches'] = <Object>[];
      await _pump(tester, const IdentifyScreen(titleId: 'm1'), backend);
      expect(
        find.text(
          'TMDB found nothing for “Arrival”. Try the original title, or '
          'leave the year empty.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('picking an entry matches the title and goes back', (
      tester,
    ) async {
      final backend = MetadataBackend();
      final toasts = await _pump(
        tester,
        const IdentifyScreen(titleId: 'm1'),
        backend,
        opened: true,
      );
      await tester.tap(find.bySemanticsLabel('The Arrival, 1996'));
      await tester.pumpAndSettle();
      expect(
        backend.sent('POST /api/v1/titles/m1/identify').single.$3,
        jsonEncode({'providerId': '11'}),
      );
      expect(toasts.shown.single.$1, 'Matched to Arrival');
      expect(find.text('Open'), findsOneWidget);
    });

    testWidgets('a refused match stays on the page and says why', (
      tester,
    ) async {
      final backend = MetadataBackend()
        ..failing['POST /api/v1/titles/m1/identify'] = 'TMDB is down';
      await _pump(tester, const IdentifyScreen(titleId: 'm1'), backend);
      await tester.tap(find.bySemanticsLabel('The Arrival, 1996'));
      await tester.pumpAndSettle();
      expect(find.text('TMDB is down'), findsOneWidget);
      expect(find.text('Fix match'), findsOneWidget);
    });
  });

  group('images', () {
    const target = ImageTarget(titleId: 'm1');

    testWidgets('shows each slot and the provider\'s posters', (tester) async {
      final backend = MetadataBackend();
      await _pump(tester, const ImagesScreen(target: target), backend);
      expect(find.text('Edit images'), findsOneWidget);
      expect(find.bySemanticsLabel('Poster, Picked from TMDB'), findsOneWidget);
      expect(find.bySemanticsLabel('Backdrop, From TMDB'), findsOneWidget);
      expect(find.bySemanticsLabel('Logo, None'), findsOneWidget);
      expect(find.bySemanticsLabel('In use, 1000 × 1500, en'), findsOneWidget);
      expect(
        find.bySemanticsLabel('Use this image, 1000 × 1500, No text'),
        findsOneWidget,
      );
      expect(find.text('Remove'), findsOneWidget);
      expect(find.text("Use TMDB's"), findsOneWidget);
      expect(
        backend.sent('GET /api/v1/titles/m1/images/poster/remote').single.$2,
        {'allLanguages': 'false'},
      );
    });

    testWidgets('picking an image uses it', (tester) async {
      final backend = MetadataBackend();
      await _pump(tester, const ImagesScreen(target: target), backend);
      await tester.tap(
        find.bySemanticsLabel('Use this image, 1000 × 1500, ja'),
      );
      await tester.pumpAndSettle();
      expect(
        jsonDecode(
          backend.sent('PUT /api/v1/titles/m1/images/poster').single.$3,
        ),
        {'imageId': 'po-2'},
      );
      expect(find.bySemanticsLabel('In use, 1000 × 1500, ja'), findsOneWidget);
    });

    testWidgets('remove and going back to the provider\'s', (tester) async {
      final backend = MetadataBackend();
      await _pump(tester, const ImagesScreen(target: target), backend);
      await tester.tap(find.text('Remove'));
      await tester.pumpAndSettle();
      expect(
        jsonDecode(
          backend.sent('PUT /api/v1/titles/m1/images/poster').single.$3,
        ),
        containsPair('imageId', null),
      );
      await tester.tap(find.text("Use TMDB's"));
      await tester.pumpAndSettle();
      expect(
        backend.sent('POST /api/v1/titles/m1/images/poster/reset'),
        hasLength(1),
      );
    });

    testWidgets('all languages asks the provider for every image', (
      tester,
    ) async {
      final backend = MetadataBackend();
      await _pump(tester, const ImagesScreen(target: target), backend);
      await tester.tap(find.text('All languages'));
      await tester.pumpAndSettle();
      expect(
        backend.sent('GET /api/v1/titles/m1/images/poster/remote').last.$2,
        {'allLanguages': 'true'},
      );
    });

    testWidgets('another slot shows its own', (tester) async {
      final backend = MetadataBackend()
        ..answers['GET /api/v1/titles/m1/images/backdrop/remote'] = <Object>[];
      await _pump(tester, const ImagesScreen(target: target), backend);
      await tester.tap(find.bySemanticsLabel('Backdrop, From TMDB'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          "TMDB has none in the library's language, in English, or without text. Turn on All languages for the rest.",
        ),
        findsOneWidget,
      );
      expect(
        backend.sent('GET /api/v1/titles/m1/images/backdrop/remote'),
        hasLength(1),
      );
    });

    testWidgets('uploads a picked image, and turns down other files', (
      tester,
    ) async {
      final backend = MetadataBackend();
      var type = 'image/gif';
      final toasts = await _pump(
        tester,
        const ImagesScreen(target: target),
        backend,
        picker: (maxBytes) async {
          expect(maxBytes, maxImageBytes);
          return PickedImage(type: type, bytes: Uint8List.fromList([1, 2, 3]));
        },
      );
      await tester.tap(find.text('Upload'));
      await tester.pumpAndSettle();
      expect(toasts.shown.single, (
        "Couldn't change the image",
        'Pick a JPEG, PNG, or WebP image.',
      ));
      expect(backend.sent('POST /api/v1/titles/m1/images/poster'), isEmpty);
      type = 'image/png';
      await tester.tap(find.text('Upload'));
      await tester.pumpAndSettle();
      final upload = backend
          .sent('POST /api/v1/titles/m1/images/poster')
          .single;
      expect(upload.$3, contains('filename="image.png"'));
      expect(find.bySemanticsLabel('Poster, Uploaded'), findsOneWidget);
    });

    testWidgets('a title with no match has nothing to pick from', (
      tester,
    ) async {
      final backend = MetadataBackend(matched: false);
      await _pump(tester, const ImagesScreen(target: target), backend);
      expect(
        find.text(
          "TMDB has no match for this title, so there's nothing to pick "
          'from. Fix the match, or upload an image.',
        ),
        findsOneWidget,
      );
      expect(
        backend.sent('GET /api/v1/titles/m1/images/poster/remote'),
        isEmpty,
      );
    });

    testWidgets("a season's page edits its poster only", (tester) async {
      final backend = MetadataBackend()
        ..answers['GET /api/v1/titles/m1/images'] = [_image('poster', null)];
      await _pump(
        tester,
        const ImagesScreen(target: ImageTarget(titleId: 'm1', season: 2)),
        backend,
      );
      expect(
        find.textContaining('Pick images for Arrival: Season 2 from TMDB'),
        findsOneWidget,
      );
      expect(find.bySemanticsLabel('Poster, None'), findsOneWidget);
      expect(find.textContaining('Backdrop'), findsNothing);
      expect(backend.sent('GET /api/v1/titles/m1/images').single.$2, {
        'season': '2',
      });
    });
  });

  group('menus', () {
    Future<void> openMenu(
      WidgetTester tester,
      MetadataBackend backend,
      AuthState auth,
      ActionTarget target,
    ) async {
      await pumpScreen(
        tester,
        Builder(
          builder: (context) => Center(
            child: MatineeButton(
              onPressed: () => showActions(context, target),
              child: const Text('Menu'),
            ),
          ),
        ),
        client: backend.client,
        auth: auth,
      );
      await tester.tap(find.text('Menu'));
      await tester.pumpAndSettle();
    }

    final movie = TitleSummary.fromJson(titleJson('m1', name: 'Arrival'));

    testWidgets("an admin's title menu fixes, refreshes, and edits", (
      tester,
    ) async {
      final backend = MetadataBackend();
      await openMenu(tester, backend, _admin, TitleActions(movie));
      expect(find.text('Fix match'), findsOneWidget);
      expect(find.text('Refresh metadata'), findsOneWidget);
      await tester.tap(find.text('Edit images'));
      await tester.pumpAndSettle();
      expect(find.text('/images/m1'), findsOneWidget);
    });

    testWidgets('without the API key, only the images', (tester) async {
      final backend = MetadataBackend(configured: false);
      await openMenu(tester, backend, _admin, TitleActions(movie));
      expect(find.text('Fix match'), findsNothing);
      expect(find.text('Edit images'), findsOneWidget);
    });

    testWidgets('an account that isn\'t an admin gets none', (tester) async {
      final backend = MetadataBackend();
      await openMenu(
        tester,
        backend,
        SignedIn('$server', User.fromJson(userJson('ada'))),
        TitleActions(movie),
      );
      expect(find.text('Edit images'), findsNothing);
      // The menu asks what the account may download, and nothing of the
      // metadata.
      expect(
        backend.requests.where((r) => !r.$1.endsWith('/playback/options')),
        isEmpty,
      );
    });

    testWidgets("an episode's menu edits its still", (tester) async {
      final backend = MetadataBackend();
      final show = titleJson('s1', kind: 'show', name: 'The Expanse');
      await openMenu(
        tester,
        backend,
        _admin,
        ItemActions(
          MediaItem.fromJson(
            itemJson('e1', title: show, season: 2, episode: 5),
          ),
        ),
      );
      expect(find.text('Fix match'), findsNothing);
      await tester.tap(find.text('Edit images'));
      await tester.pumpAndSettle();
      expect(find.text('/images/s1?season=2&episode=5'), findsOneWidget);
    });

    test('a page offers its menu to an admin', () {
      final season = Season.fromJson(seasonJson(2));
      expect(hasActions(TitleActions(movie, here: true)), isFalse);
      expect(hasActions(TitleActions(movie, here: true), admin: true), isTrue);
      expect(
        hasActions(SeasonActions(movie, season, here: true), admin: true),
        isTrue,
      );
      expect(
        hasActions(
          SeasonActions(movie, Season.fromJson(seasonJson(null)), here: true),
          admin: true,
        ),
        isFalse,
      );
    });
  });

  for (final (name, screen, size, colors) in [
    (
      'identify_phone_dark',
      const IdentifyScreen(titleId: 'm1') as Widget,
      const Size(412, 915),
      matineeDark,
    ),
    (
      'images_phone_dark',
      const ImagesScreen(target: ImageTarget(titleId: 'm1')),
      const Size(412, 915),
      matineeDark,
    ),
    (
      'images_tablet_light',
      const ImagesScreen(target: ImageTarget(titleId: 'm1')),
      const Size(1280, 800),
      matineeLight,
    ),
  ]) {
    testWidgets('the $name', (tester) async {
      await _pump(
        tester,
        screen,
        MetadataBackend(),
        size: size,
        colors: colors,
      );
      await expectLater(
        find.byWidget(screen),
        matchesGoldenFile('goldens/metadata_$name.png'),
      );
    });
  }
}
