import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/screens/home/home_layout.dart';

void main() {
  const gutter = 16.0;

  test('a phone shows one featured card from margin to margin', () {
    expect(FeaturedCarousel.cardWidth(400, gutter), 368);
  });

  test('a phone on its side keeps the phone card', () {
    expect(ShowcaseLayout.shows(const Size(914, 411)), isFalse);
    expect(FeaturedCarousel.cardWidth(914, gutter), 882);
  });

  test('the showcase starts at the tablet breakpoint', () {
    expect(ShowcaseLayout.shows(const Size(599, 900)), isFalse);
    expect(ShowcaseLayout.shows(const Size(600, 900)), isTrue);
  });

  test('a tablet shows one card, inset from the page by its gutter', () {
    for (final size in const [
      Size(600, 960),
      Size(800, 1280),
      Size(1280, 800),
      Size(2560, 1600),
    ]) {
      expect(ShowcaseLayout.shows(size), isTrue);
      expect(ShowcaseLayout.width(size, gutter), size.width - 2 * gutter);
      expect(ShowcaseLayout.width(size, gutter) / size.width, greaterThan(.9));
    }
  });

  test('a landscape tablet card leaves the first row showing under it', () {
    const size = Size(1280, 800);
    final height = ShowcaseLayout.baseHeight(size, gutter);
    expect(height, closeTo(464, .01));
    expect(height / size.height, inInclusiveRange(.55, .62));
    // The row's heading and the top of its cards start below it.
    expect(size.height - height, greaterThan(size.height * .3));
  });

  test('a portrait tablet card is around 16:9', () {
    const size = Size(800, 1280);
    final width = ShowcaseLayout.width(size, gutter);
    final height = ShowcaseLayout.baseHeight(size, gutter);
    expect(width, 768);
    expect(height, 432);
    expect(width / height, closeTo(16 / 9, .001));
    expect(height, lessThanOrEqualTo(size.height * ShowcaseLayout.portraitCap));
    // The first row's heading is well inside the screen under it.
    expect(size.height - height, greaterThan(size.height * .4));
  });

  test('a window only just taller than it is wide caps the card', () {
    const size = Size(600, 610);
    expect(
      ShowcaseLayout.baseHeight(size, gutter),
      size.height * ShowcaseLayout.portraitCap,
    );
  });

  test('a short card keeps its share sideways and grows upright', () {
    const none = TextScaler.noScaling;
    // The usual tablets keep the share at ordinary text, with the whole
    // overview.
    for (final size in const [Size(1280, 800), Size(800, 1280)]) {
      expect(
        ShowcaseLayout.height(size, gutter, none),
        ShowcaseLayout.baseHeight(size, gutter),
        reason: '$size',
      );
      expect(
        ShowcaseLayout.overviewLines(size, gutter, none),
        3,
        reason: '$size',
      );
    }
    // A small one held sideways keeps its share, so the row under it still
    // starts on screen, and shows less of the overview.
    const sideways = Size(960, 600);
    expect(
      ShowcaseLayout.height(sideways, gutter, none),
      ShowcaseLayout.baseHeight(sideways, gutter),
    );
    expect(ShowcaseLayout.overviewLines(sideways, gutter, none), lessThan(3));
    // Upright it has the room, so it grows for the whole overview.
    const upright = Size(600, 960);
    final base = ShowcaseLayout.baseHeight(upright, gutter);
    final height = ShowcaseLayout.height(upright, gutter, none);
    expect(height, greaterThan(base));
    expect(
      height,
      ShowcaseLayout.padding +
          ShowcaseLayout.wordsRoom(base, none) +
          ShowcaseLayout.wordsBottom,
    );
    expect(ShowcaseLayout.overviewLines(upright, gutter, none), 3);
    // Large text grows it anywhere, for the words besides the overview.
    const large = TextScaler.linear(2);
    expect(
      ShowcaseLayout.height(const Size(1280, 800), gutter, large),
      greaterThan(464),
    );
  });

  test('the words take half the card, and no more than 640', () {
    expect(ShowcaseLayout.wordsWidth(1248), 624);
    expect(ShowcaseLayout.wordsWidth(768), 384);
    expect(ShowcaseLayout.wordsWidth(2528), 640);
  });

  test('a featured card keeps 16:9 until the window gets short', () {
    expect(FeaturedCarousel.cardHeight(368, 800), 207);
    expect(FeaturedCarousel.cardHeight(800, 400), 160);
  });
}
