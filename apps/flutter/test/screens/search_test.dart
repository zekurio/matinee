import 'package:flutter/gestures.dart' show PointerDeviceKind;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/screens/search/search_data.dart';
import 'package:matinee/screens/search/search_screen.dart';

import '../media/fixtures.dart';
import '../media/harness.dart';
import 'home_backend.dart';

JsonMap _results({List<JsonMap> titles = const []}) => {
  'users': <Object>[],
  'titles': titles,
  'people': [
    {
      'name': 'Denis Villeneuve',
      'photo': null,
      'kind': 'director',
      'titleCount': 2,
    },
  ],
  'genres': [
    {'name': 'Drama', 'titleCount': 4},
  ],
  'studios': <Object>[],
};

HomeBackend _backend() => HomeBackend()
  ..answers['/api/v1/libraries'] = [libraryJson('lib-movie', name: 'Films')]
  ..answers['/api/v1/search'] = _results(
    titles: [
      titleJson('m1', name: 'Arrival'),
      titleJson('m2', name: 'Sicario', year: 2015),
    ],
  );

Future<void> _type(WidgetTester tester, String text) async {
  await tester.enterText(find.byType(EditableText), text);
  await tester.pump(searchDebounce);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(loadFont);

  testWidgets('the empty field leaves the page to Explore', (tester) async {
    final backend = _backend();
    await pumpScreen(tester, const SearchScreen(), client: backend.client);
    expect(find.text('Search movies, shows, people, and more'), findsWidgets);
    expect(backend.asked, isNot(contains('/api/v1/search')));
  });

  testWidgets('typing searches once it pauses, grouped by library', (
    tester,
  ) async {
    final backend = _backend();
    await pumpScreen(tester, const SearchScreen(), client: backend.client);
    await tester.enterText(find.byType(EditableText), 'ar');
    await tester.pump(const Duration(milliseconds: 100));
    await tester.enterText(find.byType(EditableText), 'arr');
    await tester.pump(searchDebounce);
    await tester.pumpAndSettle();
    expect(backend.asked.where((p) => p == '/api/v1/search').length, 1);
    expect(find.text('Films'), findsOneWidget);
    expect(find.text('2 titles'), findsOneWidget);
    expect(find.text('Arrival'), findsWidgets);
    expect(find.text('Cast & crew'), findsOneWidget);
    expect(find.text('Director'), findsOneWidget);
    // People are the round cards of a title's cast.
    expect(find.byType(PersonCard), findsOneWidget);
    await tester.tap(find.text('Arrival').first);
    await tester.pumpAndSettle();
    expect(find.text('/title/m1'), findsOneWidget);
  });

  testWidgets('clearing the query keeps the field ready to type', (
    tester,
  ) async {
    final backend = _backend();
    await pumpScreen(tester, const SearchScreen(), client: backend.client);
    await _type(tester, 'arr');
    expect(find.text('Arrival'), findsWidgets);
    // A mouse or stylus, which a tablet takes too, drops a field's focus
    // on a tap outside it, unlike a finger.
    await tester.tap(
      find.bySemanticsLabel('Clear search'),
      kind: PointerDeviceKind.mouse,
    );
    await tester.pumpAndSettle();
    final field = tester.widget<EditableText>(find.byType(EditableText));
    expect(field.controller.text, isEmpty);
    // A tap on the clear button is a tap on the field, so the keyboard
    // stays up for the next query.
    expect(field.focusNode.hasFocus, isTrue);
  });

  testWidgets('a genre opens Browse', (tester) async {
    final backend = _backend();
    await pumpScreen(tester, const SearchScreen(), client: backend.client);
    await _type(tester, 'drama');
    await tester.scrollUntilVisible(
      find.widgetWithText(ChoiceChip, 'Drama'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.widgetWithText(ChoiceChip, 'Drama'));
    await tester.pumpAndSettle();
    expect(find.text('/browse?genre=Drama'), findsOneWidget);
  });

  testWidgets('nothing matching says so', (tester) async {
    final backend = _backend()
      ..answers['/api/v1/search'] = {
        'users': <Object>[],
        'titles': <Object>[],
        'people': <Object>[],
        'genres': <Object>[],
        'studios': <Object>[],
      };
    await pumpScreen(tester, const SearchScreen(), client: backend.client);
    await _type(tester, 'zzz');
    expect(find.text('Nothing matches “zzz”'), findsOneWidget);
  });

  testWidgets('a failed search offers Try again', (tester) async {
    final backend = _backend()..failing['/api/v1/search'] = 'Search is down.';
    await pumpScreen(tester, const SearchScreen(), client: backend.client);
    await _type(tester, 'arrival');
    expect(find.text("Couldn't search"), findsOneWidget);
    backend.failing.clear();
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('Arrival'), findsWidgets);
  });

  for (final (name, size, colors) in [
    ('phone_dark', const Size(412, 915), matineeDark),
    ('tablet_light', const Size(1280, 800), matineeLight),
  ]) {
    testWidgets('search results on a $name', (tester) async {
      final backend = _backend();
      await pumpScreen(
        tester,
        const SearchScreen(),
        client: backend.client,
        size: size,
        colors: colors,
      );
      await _type(tester, 'arrival');
      // The caret blinks; take it away for a steady picture.
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      await expectLater(
        find.byType(SearchScreen),
        matchesGoldenFile('goldens/search_$name.png'),
      );
    });
  }
}
