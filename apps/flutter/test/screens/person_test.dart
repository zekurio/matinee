import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/screens/person/person_screen.dart';

import '../media/fixtures.dart';
import '../media/harness.dart';
import 'home_backend.dart';

const _path = '/api/v1/people/Amy%20Adams';

JsonMap _catalogCredit(String id, String name, {String state = 'none'}) => {
  'ref': refJson(id),
  'name': name,
  'year': 2024,
  'poster': null,
  'availability': availabilityJson(state),
  'role': 'Herself',
};

JsonMap _person({
  bool profile = true,
  List<JsonMap>? catalog,
  bool stale = false,
}) => {
  'name': 'Amy Adams',
  'photo': null,
  'kind': 'actor',
  'titleCount': 2,
  'credits': [
    {
      'title': titleJson('m1', name: 'Arrival'),
      'kind': 'actor',
      'role': 'Louise Banks',
    },
    {
      'title': titleJson('m2', name: 'Enchanted', year: 2007),
      'kind': 'actor',
      'role': null,
    },
  ],
  'profile': profile
      ? {
          'tmdbId': '9273',
          'knownFor': 'acting',
          'birthday': '1974-08-20',
          'deathday': null,
          'biography': 'An American actress known for her range.',
        }
      : null,
  'catalog':
      catalog ??
      [
        _catalogCredit('1', 'Nightbitch', state: 'asked'),
        _catalogCredit('2', 'Doubt'),
      ],
  'stale': stale,
};

HomeBackend _backend(JsonMap person) => HomeBackend()..answers[_path] = person;

void main() {
  setUpAll(loadFont);

  testWidgets('shows who they are, their titles here, and the rest', (
    tester,
  ) async {
    final backend = _backend(_person());
    await pumpScreen(
      tester,
      const PersonScreen(name: 'Amy Adams', tmdbId: '9273'),
      client: backend.client,
    );
    expect(find.text('Amy Adams'), findsOneWidget);
    expect(find.text('Acting · Born Aug 20, 1974'), findsOneWidget);
    expect(
      find.text('An American actress known for her range.'),
      findsOneWidget,
    );
    // The name is on the card and on its stand-in art.
    expect(find.text('Arrival'), findsNWidgets(2));
    expect(find.text('Louise Banks'), findsOneWidget);
    // A credit without a role says the title's year.
    expect(find.text('2007'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('2024 · Herself').last, 200);
    expect(find.text('Not here yet'), findsOneWidget);
    expect(find.text('2 titles'), findsWidgets);
    // The requested one says its state in place of the year and role.
    expect(find.text('2024 · Herself'), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('Requested')), findsWidgets);
    expect(backend.asked, contains('/api/v1/requests/live'));
  });

  testWidgets('without TMDB, says what they do here and in how much', (
    tester,
  ) async {
    await pumpScreen(
      tester,
      const PersonScreen(name: 'Amy Adams'),
      client: _backend(_person(profile: false, catalog: [])).client,
    );
    expect(find.text('Actor · 2 titles'), findsOneWidget);
    expect(find.text('Not here yet'), findsNothing);
  });

  testWidgets('a catalog card follows its title live', (tester) async {
    final backend = _backend(_person());
    await pumpScreen(
      tester,
      const PersonScreen(name: 'Amy Adams'),
      client: backend.client,
    );
    await tester.scrollUntilVisible(find.text('2024 · Herself').last, 200);
    expect(find.bySemanticsLabel(RegExp('On its way')), findsNothing);
    backend.send([
      {
        'ref': refJson('2'),
        'availability': availabilityJson('coming'),
        'seasons': <Object>[],
      },
    ]);
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel(RegExp('On its way')), findsOneWidget);
  });

  testWidgets('a catalog card opens the catalog page', (tester) async {
    await pumpScreen(
      tester,
      const PersonScreen(name: 'Amy Adams'),
      client: _backend(_person()).client,
    );
    await tester.scrollUntilVisible(find.text('2024 · Herself').last, 200);
    await tester.tap(find.text('Doubt').first);
    await tester.pumpAndSettle();
    expect(find.text('/catalog/movie/tmdb/2'), findsOneWidget);
  });

  testWidgets('a failure offers to try again', (tester) async {
    final backend = HomeBackend()..failing[_path] = 'No one by that name';
    await pumpScreen(
      tester,
      const PersonScreen(name: 'Amy Adams'),
      client: backend.client,
    );
    expect(find.text("Couldn't load this person"), findsOneWidget);
    backend
      ..failing.clear()
      ..answers[_path] = _person();
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Louise Banks'), findsOneWidget);
  });

  test('follows the blocks around the cards built, six at most', () {
    (int, int) window(Iterable<int> built) =>
        FollowWindow.windowFor(built, block: 12, blocks: 6);
    expect(window(const []), (0, 0));
    expect(window(const [0, 1, 2, 3]), (0, 24));
    expect(window(const [30, 31, 40]), (12, 60));
    expect(window(List.generate(200, (i) => i)), (0, 72));
  });

  for (final (name, size, colors) in [
    ('phone_dark', const Size(412, 915), matineeDark),
    ('tablet_light', const Size(1280, 800), matineeLight),
  ]) {
    testWidgets('the person page on a $name', (tester) async {
      const screen = PersonScreen(name: 'Amy Adams', tmdbId: '9273');
      await pumpScreen(
        tester,
        screen,
        client: _backend(_person(stale: true)).client,
        size: size,
        colors: colors,
      );
      await expectLater(
        find.byWidget(screen),
        matchesGoldenFile('goldens/person_$name.png'),
      );
    });
  }
}
