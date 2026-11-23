import 'dart:typed_data';

import 'package:flutter/material.dart' show MaterialApp;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart' show apiProvider;
import 'package:matinee/kit/kit.dart';
import 'package:matinee/l10n/app_localizations.dart';
import 'package:matinee/media/artwork.dart';
import 'package:matinee/screens/home/home_layout.dart';
import 'package:matinee/screens/home/home_showcase.dart';

import '../../media/fixtures.dart';

/// A featured title called [name], with a backdrop and a logo of that name
/// when [art] says.
FeaturedTitle _slide(String name, {bool art = false, bool backdrop = true}) =>
    FeaturedTitle.fromJson({
      'title': {
        ...titleJson(name, name: name),
        if (art)
          'images': {
            'poster': null,
            'backdrop': backdrop ? artJson('backdrop-$name') : null,
            'logo': artJson('logo-$name'),
          },
      },
      'item': itemJson('item-$name'),
      'count': 1,
    });

final _slides = [
  for (final name in const ['Alien', 'Brazil', 'Contact', 'Dune']) _slide(name),
];

final class _NoCache implements ArtworkCache {
  @override
  Future<Uint8List?> read(Uri url) async => null;

  @override
  Future<void> write(Uri url, Uint8List bytes) async {}
}

/// [child] in a tablet's [window], under the app's theme. With [server], it
/// asks that for its pictures; without, a title draws its tone and its name.
Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  Size window = const Size(1280, 800),
  bool tickers = true,
  http.Client? server,
}) async {
  tester.view.physicalSize = window;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiProvider.overrideWithValue(
          server == null
              ? null
              : MatineeApi(
                  base: Uri.parse('https://media.example.com'),
                  client: server,
                ),
        ),
        if (server != null)
          artworkLoaderProvider.overrideWithValue(
            ArtworkLoader(server, _NoCache()),
          ),
      ],
      child: MaterialApp(
        supportedLocales: AppLocalizations.supportedLocales,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        theme: MatineeTheme.data(matineeDark),
        home: TickerMode(
          enabled: tickers,
          child: SingleChildScrollView(child: child),
        ),
      ),
    ),
  );
  await tester.pump();
}

/// The one title the card shows once it rests.
String _showing(WidgetTester tester) {
  final names = [
    for (final slide in _slides)
      if (find.text(slide.title.name).evaluate().isNotEmpty) slide.title.name,
  ];
  expect(names, hasLength(1));
  return names.single;
}

Future<void> _swipe(WidgetTester tester, double dx) async {
  await tester.drag(find.byType(HomeShowcase), Offset(dx, 0));
  await tester.pumpAndSettle();
}

/// Waits [times] the card's eight seconds, and for what it does then.
Future<void> _wait(WidgetTester tester, {int times = 1}) async {
  await tester.pump(ShowcaseLayout.advance * times);
  await tester.pumpAndSettle();
}

/// The file a [Picture]'s last source takes its frame from, which names the
/// title it draws.
String? _file(State picture) => switch (picture.widget) {
  Picture(:final sources) => switch (sources.last) {
    FrameSource(:final itemId) => itemId,
    _ => null,
  },
  _ => null,
};

void main() {
  testWidgets('a swipe changes the title either way, round the ends', (
    tester,
  ) async {
    await _pump(tester, HomeShowcase(slides: _slides));
    expect(_showing(tester), 'Alien');
    await _swipe(tester, -200);
    expect(_showing(tester), 'Brazil');
    await _swipe(tester, 200);
    await _swipe(tester, 200);
    expect(_showing(tester), 'Dune');
    await _swipe(tester, -200);
    expect(_showing(tester), 'Alien');
    // Too short to mean it.
    await _swipe(tester, -30);
    expect(_showing(tester), 'Alien');
  });

  testWidgets('a dot shows its title', (tester) async {
    await _pump(tester, HomeShowcase(slides: _slides));
    await tester.tap(find.bySemanticsLabel('3 of 4'));
    await tester.pumpAndSettle();
    expect(_showing(tester), 'Contact');
  });

  testWidgets('it moves on every eight seconds, and back to the first', (
    tester,
  ) async {
    await _pump(tester, HomeShowcase(slides: _slides));
    const tick = Duration(milliseconds: 1);
    for (final name in const ['Brazil', 'Contact', 'Dune', 'Alien']) {
      await tester.pump(ShowcaseLayout.advance - tick);
      expect(find.text(name), findsNothing);
      await tester.pump(tick);
      await tester.pump();
      expect(find.text(name), findsOneWidget);
    }
    await tester.pumpAndSettle();
    expect(_showing(tester), 'Alien');
  });

  testWidgets('a swipe starts the eight seconds again', (tester) async {
    await _pump(tester, HomeShowcase(slides: _slides));
    await tester.pump(ShowcaseLayout.advance - const Duration(seconds: 1));
    await _swipe(tester, -200);
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(_showing(tester), 'Brazil');
  });

  testWidgets('it stays while a finger is on it', (tester) async {
    await _pump(tester, HomeShowcase(slides: _slides));
    final finger = await tester.startGesture(
      tester.getCenter(find.byType(HomeShowcase)),
    );
    // Off the spot, so lifting it isn't a tap, which would open the title.
    await finger.moveBy(const Offset(0, 60));
    await _wait(tester, times: 2);
    expect(_showing(tester), 'Alien');
    await finger.up();
    await _wait(tester);
    expect(_showing(tester), 'Brazil');
  });

  testWidgets('it stays while Home is out of sight', (tester) async {
    await _pump(tester, HomeShowcase(slides: _slides), tickers: false);
    await _wait(tester, times: 2);
    expect(_showing(tester), 'Alien');
    await _pump(tester, HomeShowcase(slides: _slides));
    await _wait(tester);
    expect(_showing(tester), 'Brazil');
  });

  testWidgets('it stays with animations off, and a swipe changes it at once', (
    tester,
  ) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await _pump(tester, HomeShowcase(slides: _slides));
    await _wait(tester, times: 2);
    expect(_showing(tester), 'Alien');
    await tester.drag(find.byType(HomeShowcase), const Offset(-200, 0));
    await tester.pump();
    expect(_showing(tester), 'Brazil');
    expect(tester.hasRunningAnimations, isFalse);
  });

  testWidgets('it stays with a screen reader on', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(accessibleNavigation: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await _pump(tester, HomeShowcase(slides: _slides));
    await _wait(tester, times: 2);
    expect(_showing(tester), 'Alien');
  });

  testWidgets('one title has no dots and nowhere to go', (tester) async {
    await _pump(tester, HomeShowcase(slides: [_slides.first]));
    expect(find.byType(PageDots), findsNothing);
    await _swipe(tester, -200);
    await _wait(tester, times: 2);
    expect(_showing(tester), 'Alien');
  });

  // The bug it pins: the title coming in took over the picture of the one
  // leaving, which went on drawing the old art until the new one had loaded,
  // and a logo that hadn't loaded was asked for again as its title left.
  testWidgets('a title keeps its own picture while the next comes in', (
    tester,
  ) async {
    await _pump(tester, HomeShowcase(slides: _slides));
    final alien = tester.state(find.byType(Picture));
    await tester.drag(find.byType(HomeShowcase), const Offset(-200, 0));
    await tester.pump();
    final pictures = tester.stateList(find.byType(Picture)).toList();
    expect(pictures, hasLength(2));
    expect(pictures.first, same(alien));
    expect(_file(alien), 'item-Alien');
    expect(_file(pictures.last), 'item-Brazil');
    await tester.pumpAndSettle();
    expect(tester.state(find.byType(Picture)), same(pictures.last));
    expect(alien.mounted, isFalse);
  });

  // The bugs it pins: a preload that failed was reported as an error, and a
  // title with no backdrop had nothing loaded ahead.
  testWidgets('the next title\'s art and logo load before it shows', (
    tester,
  ) async {
    final asked = <String>[];
    final server = MockClient((request) async {
      asked.add('${request.url.path}?${request.url.query}');
      return http.Response('', 404);
    });
    final slides = [
      _slide('Alien', art: true),
      _slide('Brazil', art: true),
      _slide('Contact', art: true, backdrop: false),
      _slide('Dune', art: true),
    ];
    await _pump(tester, HomeShowcase(slides: slides), server: server);
    expect(
      asked,
      containsAll([
        '/api/artwork/backdrop-Brazil?size=large',
        '/api/artwork/logo-Brazil?size=medium',
      ]),
    );
    expect(asked.where((path) => path.contains('Contact')), isEmpty);
    expect(asked.where((path) => path.contains('Dune')), isEmpty);
    expect(tester.takeException(), isNull);

    asked.clear();
    await tester.drag(find.byType(HomeShowcase), const Offset(-200, 0));
    await tester.pumpAndSettle();
    expect(asked, contains('/api/artwork/logo-Contact?size=medium'));
    // No backdrop and no still, so a frame from its file.
    expect(asked, contains('/api/media/item-Contact/thumbnail?size=large'));
    expect(asked.where((path) => path.contains('Dune')), isEmpty);
    expect(tester.takeException(), isNull);
  });
}
