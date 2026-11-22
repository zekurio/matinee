import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/screens/home/home_layout.dart';

import '../../media/fixtures.dart';

FeaturedTitle _featured({
  String id = 't',
  String kind = 'movie',
  int? year = 2016,
  String? contentRating,
  int count = 1,
}) {
  final title = titleJson(id, kind: kind, year: year);
  title['contentRating'] = contentRating;
  return FeaturedTitle.fromJson({
    'title': title,
    'item': itemJson('i-$id'),
    'count': count,
  });
}

void main() {
  group('HomeHeroLayout', () {
    test('a tablet gives the hero three quarters and keeps the words left', () {
      final layout = HomeHeroLayout(width: 1280, height: 720);
      expect(layout.tablet, isTrue);
      expect(layout.heroHeight, 540);
      expect(layout.alignsLeft, isTrue);
      expect(layout.logoHeight, 120);
      expect(layout.pagePadding, 40);
      expect(layout.contentBottom, 80);
    });

    test('a phone upright stops at 500 or two thirds of its page', () {
      expect(HomeHeroLayout(width: 400, height: 800).heroHeight, 500);
      expect(HomeHeroLayout(width: 400, height: 600).heroHeight, 390);
      expect(HomeHeroLayout(width: 400, height: 800).alignsLeft, isFalse);
      expect(HomeHeroLayout(width: 400, height: 800).logoHeight, 120);
    });

    test('a phone on its side fills its page and shrinks the logo', () {
      final layout = HomeHeroLayout(width: 800, height: 400);
      expect(layout.tablet, isFalse);
      expect(layout.heroHeight, 400);
      expect(layout.compact, isTrue);
      expect(layout.logoHeight, 80);
      // Wide enough for the words to lead on the left.
      expect(layout.alignsLeft, isTrue);
      expect(layout.contentBottom, 80);
    });

    test('a phone keeps its words clear of the controls at the bottom', () {
      final portrait = HomeHeroLayout(width: 400, height: 800);
      expect(
        portrait.contentBottom,
        greaterThan(HomeHeroLayout.controlsBottom),
      );
      expect(portrait.pagePadding, 24);
    });
  });

  group('heroFacts', () {
    test('a show reads what it is, its age rating, and its year', () {
      expect(
        heroFacts(
          _featured(kind: 'show', contentRating: 'TV-MA'),
          show: 'Show',
          movie: 'Movie',
        ),
        ['Show', 'TV-MA', '2016'],
      );
    });

    test('a movie without a rating keeps its kind and its year', () {
      expect(heroFacts(_featured(year: 1999), show: 'Show', movie: 'Movie'), [
        'Movie',
        '1999',
      ]);
    });

    test('a title with no year or rating is still named its kind', () {
      expect(heroFacts(_featured(year: null), show: 'Show', movie: 'Movie'), [
        'Movie',
      ]);
    });
  });

  group('HeroPaging', () {
    test('a dot goes to the nearest page that shows its slide', () {
      final start = HeroPaging.initialPage(3);
      expect(HeroPaging.slide(start, 3), 0);
      expect(HeroPaging.slide(HeroPaging.page(2, start, 3), 3), 2);
      expect(HeroPaging.slide(HeroPaging.page(1, start, 3), 3), 1);
    });

    test('a page before the first repeat still shows the last slide', () {
      // A backward swipe past the middle repeat wraps to the last slide
      // rather than an empty page.
      expect(HeroPaging.slide(-1, 3), 2);
    });

    test('one slide has one page and no forward repeat', () {
      expect(HeroPaging.pages(1), 1);
      expect(HeroPaging.initialPage(1), 0);
      expect(HeroPaging.slide(0, 1), 0);
    });
  });
}
