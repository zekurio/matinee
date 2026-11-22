import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/screens/home/home_layout.dart';

void main() {
  const gutter = 16.0;

  test('a phone shows one featured card from margin to margin', () {
    expect(FeaturedCarousel.showsNeighbours(const Size(400, 800)), isFalse);
    expect(FeaturedCarousel.cardWidth(const Size(400, 800), gutter), 368);
  });

  test('a phone on its side keeps the phone card', () {
    expect(FeaturedCarousel.showsNeighbours(const Size(914, 411)), isFalse);
    expect(FeaturedCarousel.cardWidth(const Size(914, 411), gutter), 882);
  });

  test('a tablet shows one card, not two or three across', () {
    for (final size in const [
      Size(600, 960),
      Size(800, 1280),
      Size(1280, 800),
      Size(2560, 1600),
    ]) {
      expect(FeaturedCarousel.showsNeighbours(size), isTrue);
      final card = FeaturedCarousel.cardWidth(size, gutter);
      // The card sits centred with a gutter either side, and the neighbours
      // peek in at both edges by the same amount.
      expect(
        (size.width - card) / 2,
        closeTo(FeaturedCarousel.peek + gutter, .01),
      );
      expect(
        size.width - card,
        closeTo(2 * (gutter + FeaturedCarousel.peek), .01),
      );
    }
  });

  test('the neighbours peek by 24 to 48', () {
    expect(FeaturedCarousel.peek, inInclusiveRange(24, 48));
  });

  test('the neighbours start at the tablet breakpoint', () {
    expect(FeaturedCarousel.showsNeighbours(const Size(599, 900)), isFalse);
    expect(FeaturedCarousel.showsNeighbours(const Size(600, 900)), isTrue);
  });

  test('a landscape tablet card is wide and short enough to see the row '
      'below', () {
    const size = Size(1280, 800);
    final card = FeaturedCarousel.cardWidth(size, gutter);
    final height = FeaturedCarousel.cardHeight(card, size.height);
    expect(height, 320);
    expect(card / height, greaterThan(16 / 9));
    // The heading under it, past the dots and the gap, starts in view.
    expect(height, lessThan(size.height * .45));
  });

  test('a portrait tablet card is around 16:9', () {
    const size = Size(800, 1280);
    final card = FeaturedCarousel.cardWidth(size, gutter);
    final height = FeaturedCarousel.cardHeight(card, size.height);
    expect(card / height, closeTo(16 / 9, .001));
  });

  test('a featured card keeps 16:9 until the window gets short', () {
    expect(FeaturedCarousel.cardHeight(368, 800), 207);
    expect(FeaturedCarousel.cardHeight(800, 400), 160);
  });
}
