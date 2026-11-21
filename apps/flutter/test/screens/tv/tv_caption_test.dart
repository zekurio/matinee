import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/screens/tv/tv_media.dart';

import 'tv_harness.dart';

void main() {
  loadTvFont();

  testWidgets('a caption in another script keeps to the card\'s height', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        child: Directionality(
          textDirection: TextDirection.ltr,
          child: MatineeTheme.wrap(
            matineeDark,
            Align(
              alignment: Alignment.topLeft,
              child: SizedBox(
                height: tvCaptionedHeight(),
                child: TvCaptionedPoster(
                  name: 'マリッジトキシン',
                  detail: '城崎ひかり (声)',
                  poster: null,
                  onPressed: () {},
                ),
              ),
            ),
          ),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
    // Glyphs another font draws can stand taller than the card's own, so
    // each line holds to its height rather than push the card over.
    for (final text in ['マリッジトキシン', '城崎ひかり (声)']) {
      final line = tester.widget<Text>(find.text(text).last);
      expect(line.strutStyle?.forceStrutHeight, isTrue, reason: text);
    }
  });
}
