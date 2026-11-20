import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/screens/home/home_banner.dart';
import 'package:matinee/screens/home/home_layout.dart';
import 'package:matinee/screens/home/home_screen.dart';

import '../media/fixtures.dart';
import '../media/harness.dart';
import 'home_backend.dart';

Finder _homeList() => find
    .descendant(of: find.byType(HomeScreen), matching: find.byType(Scrollable))
    .first;

Future<void> _scrollTo(WidgetTester tester, Finder finder) =>
    tester.scrollUntilVisible(finder, 200, scrollable: _homeList());

void main() {
  setUpAll(loadFont);

  testWidgets('a phone shows the cards, then every row', (tester) async {
    final backend = HomeBackend();
    await pumpScreen(tester, const HomeScreen(), client: backend.client);
    expect(find.text('Drama · Sci-Fi'), findsOneWidget);
    expect(
      find.bySemanticsLabel('The Expanse, Drama · Sci-Fi, 1 of 2'),
      findsOneWidget,
    );
    expect(find.text('Continue watching'), findsOneWidget);
    expect(find.text('S2, E5: Home · 12 min left'), findsOneWidget);
    for (final heading in [
      'Next up',
      'Recommended for you',
      'My requests',
      'Recently added in Movies',
    ]) {
      await _scrollTo(tester, find.text(heading));
      expect(find.text(heading), findsOneWidget);
    }
    expect(find.text('Sicario'), findsWidgets);
    expect(find.bySemanticsLabel(RegExp('Requested')), findsOneWidget);
  });

  testWidgets('a card opens its page', (tester) async {
    final backend = HomeBackend();
    await pumpScreen(tester, const HomeScreen(), client: backend.client);
    await tester.tap(find.text('The Expanse').first);
    await tester.pumpAndSettle();
    expect(find.text('/title/s1'), findsOneWidget);
  });

  testWidgets('an episode card opens the episode', (tester) async {
    final backend = HomeBackend();
    await pumpScreen(tester, const HomeScreen(), client: backend.client);
    await tester.tap(
      find.bySemanticsLabel('The Expanse, S2, E5: Home · 12 min left'),
    );
    await tester.pumpAndSettle();
    expect(find.text('/episode/e1'), findsOneWidget);
  });

  testWidgets('a tablet opens with the banner, whose Play starts the file', (
    tester,
  ) async {
    final backend = HomeBackend();
    await pumpScreen(
      tester,
      const HomeScreen(),
      client: backend.client,
      size: const Size(1280, 800),
    );
    expect(find.byType(HomeBanner), findsOneWidget);
    expect(find.text('2016 · 23 episodes').hitTestable(), findsOneWidget);
    expect(find.text('TV-14').hitTestable(), findsOneWidget);
    expect(find.text('8.4').hitTestable(), findsOneWidget);
    expect(find.text('S1, E1 · 30 min left').hitTestable(), findsOneWidget);
    await tester.tap(find.text('Play'));
    await tester.pumpAndSettle();
    expect(find.text('/play/f-e1'), findsOneWidget);
  });

  testWidgets('the banner stays dark in a light theme, as the web\'s', (
    tester,
  ) async {
    final backend = HomeBackend();
    await pumpScreen(
      tester,
      const HomeScreen(),
      client: backend.client,
      size: const Size(1280, 800),
      colors: matineeLight,
    );
    Color colorOf(Finder text) =>
        tester.widget<Text>(text.hitTestable().first).style!.color!;
    final title = find.descendant(
      of: find.byType(HomeBanner),
      matching: find.byWidgetPredicate(
        (widget) => widget is Text && (widget.style?.shadows ?? []).isNotEmpty,
      ),
    );
    // Light text over the dark shade, whichever scheme the app is in.
    expect(colorOf(title), matineeDark.foreground);
    expect(
      colorOf(find.text('2016 · 23 episodes')),
      matineeDark.foreground.withValues(alpha: .8),
    );
    // The page around it keeps the light scheme.
    expect(colorOf(find.text('Continue watching')), matineeLight.foreground);
  });

  testWidgets('the banner moves to a slide its dot picks', (tester) async {
    final backend = HomeBackend();
    await pumpScreen(
      tester,
      const HomeScreen(),
      client: backend.client,
      size: const Size(1280, 800),
    );
    await tester.tap(find.bySemanticsLabel('Show slide 2'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Details'));
    await tester.pumpAndSettle();
    expect(find.text('/title/m2'), findsOneWidget);
  });

  testWidgets('Home is one error only when nothing else could show', (
    tester,
  ) async {
    final backend = HomeBackend()
      ..failing['/api/v1/libraries'] = 'The database is down.'
      ..answers['/api/v1/home/continue-watching'] = <Object>[]
      ..answers['/api/v1/home/next-up'] = <Object>[]
      ..answers['/api/v1/home/featured'] = <Object>[];
    await pumpScreen(tester, const HomeScreen(), client: backend.client);
    expect(find.text("Couldn't load Home"), findsOneWidget);
    expect(find.text('The database is down.'), findsOneWidget);
    backend.failing.clear();
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text("Couldn't load Home"), findsNothing);
    expect(find.text('Recommended for you'), findsOneWidget);
  });

  testWidgets('an unreachable server shows the cloud and Try again', (
    tester,
  ) async {
    final backend = HomeBackend()
      ..down.addAll([
        '/api/v1/libraries',
        '/api/v1/home/continue-watching',
        '/api/v1/home/next-up',
        '/api/v1/home/featured',
      ]);
    await pumpScreen(tester, const HomeScreen(), client: backend.client);
    expect(find.bySemanticsLabel('Server not reachable'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
    expect(find.text("Couldn't load Home"), findsNothing);
  });

  testWidgets('a failed row is left out and the rest show', (tester) async {
    final backend = HomeBackend()
      ..failing['/api/v1/home/continue-watching'] = 'No.'
      ..failing['/api/v1/libraries/lib1/shelf'] = 'No.';
    await pumpScreen(tester, const HomeScreen(), client: backend.client);
    expect(find.text('Continue watching'), findsNothing);
    expect(find.text('Next up'), findsOneWidget);
    await _scrollTo(tester, find.text('My requests'));
    await tester.drag(_homeList(), const Offset(0, -600));
    await tester.pumpAndSettle();
    expect(find.text('Recently added in Movies'), findsNothing);
  });

  testWidgets('with no library it says there is nothing yet', (tester) async {
    final backend = HomeBackend()
      ..answers['/api/v1/libraries'] = <Object>[]
      ..answers['/api/v1/home/featured'] = <Object>[];
    await pumpScreen(tester, const HomeScreen(), client: backend.client);
    expect(find.text('Nothing to watch yet'), findsOneWidget);
    expect(find.text('Continue watching'), findsNothing);
  });

  testWidgets('a request follows its title live', (tester) async {
    final backend = HomeBackend();
    await pumpScreen(tester, const HomeScreen(), client: backend.client);
    await _scrollTo(tester, find.text('My requests'));
    expect(find.bySemanticsLabel(RegExp('Requested')), findsOneWidget);
    backend.send([
      {
        'ref': refJson('999'),
        'availability': availabilityJson('coming', progress: .4),
        'seasons': <Object>[],
      },
    ]);
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel(RegExp('Requested')), findsNothing);
    expect(find.bySemanticsLabel(RegExp('On its way')), findsOneWidget);
    expect(backend.asked.where((p) => p == '/api/v1/requests/live').length, 1);
  });

  test('the banner lays itself out as the web does', () {
    final tablet = HeroLayout(800, 1136, rowsBelow: true);
    expect(tablet.size, HeroSize.medium);
    expect(tablet.height, 720);
    expect(tablet.showsOverview, isTrue);
    final wide = HeroLayout(1280, 680, rowsBelow: true);
    expect(wide.size, HeroSize.large);
    expect(wide.height, closeTo(435.2, .01));
    expect(wide.dotsBesideButtons, isTrue);
    expect(HeroLayout(1280, 680, rowsBelow: false).height, 480);
    expect(HeroLayout(700, 500, rowsBelow: true).size, HeroSize.short);
    expect(HeroPaging.slide(HeroPaging.initialPage(3) + 4, 3), 1);
    expect(HeroPaging.page(2, 1501, 3), 1502);
    expect(FeaturedCarousel.cardHeight(380, 915), closeTo(213.75, .01));
    expect(FeaturedCarousel.cardHeight(380, 400), 160);
  });

  for (final (name, size, colors) in [
    ('phone_dark', const Size(412, 915), matineeDark),
    ('tablet_light', const Size(1280, 800), matineeLight),
  ]) {
    testWidgets('Home on a $name', (tester) async {
      final backend = HomeBackend();
      await pumpScreen(
        tester,
        const HomeScreen(),
        client: backend.client,
        size: size,
        colors: colors,
      );
      await expectLater(
        find.byType(HomeScreen),
        matchesGoldenFile('goldens/home_$name.png'),
      );
    });
  }
}
