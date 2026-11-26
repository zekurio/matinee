import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/media/still_image.dart';

/// A picture that's [image] at once, or fails with [error].
class _Provider extends ImageProvider<_Provider> {
  const _Provider(this.name, this.image, {this.error});

  final String name;
  final ui.Image? image;
  final Object? error;

  @override
  Future<_Provider> obtainKey(ImageConfiguration configuration) =>
      SynchronousFuture(this);

  @override
  ImageStreamCompleter loadImage(_Provider key, ImageDecoderCallback decode) {
    final error = this.error;
    if (error != null) {
      return OneFrameImageStreamCompleter(Future.error(error));
    }
    return OneFrameImageStreamCompleter(
      SynchronousFuture(ImageInfo(image: image!.clone())),
    );
  }

  @override
  bool operator ==(Object other) => other is _Provider && other.name == name;

  @override
  int get hashCode => name.hashCode;
}

void main() {
  late ui.Image image;
  setUpAll(() async => image = await createTestImage(width: 4, height: 4));
  tearDown(() => imageCache.clear());

  Widget still(
    ImageProvider provider, {
    bool ticking = true,
    List<(int?, bool)>? frames,
  }) => Directionality(
    textDirection: TextDirection.ltr,
    child: TickerMode(
      enabled: ticking,
      child: StillImage(
        image: provider,
        fit: BoxFit.cover,
        frameBuilder: (context, child, frame, synchronous) {
          frames?.add((frame, synchronous));
          return child;
        },
        errorBuilder: (context, error, stack) => Text('$error'),
      ),
    ),
  );

  testWidgets('it draws the picture, at once when it was there', (
    tester,
  ) async {
    final frames = <(int?, bool)>[];
    await tester.pumpWidget(still(_Provider('a', image), frames: frames));
    final raw = tester.widget<RawImage>(find.byType(RawImage));
    expect(raw.image!.isCloneOf(image), isTrue);
    expect(raw.fit, BoxFit.cover);
    expect(raw.filterQuality, FilterQuality.medium);
    expect(frames.last, (0, true));
  });

  // Every picture in a tab built again when the tab was left or shown.
  testWidgets('tickers stopping or starting don\'t build it again', (
    tester,
  ) async {
    final frames = <(int?, bool)>[];
    // The same widget each time, as a tab's pictures stay when it's left.
    final picture = StillImage(
      image: _Provider('a', image),
      frameBuilder: (context, child, frame, synchronous) {
        frames.add((frame, synchronous));
        return child;
      },
    );
    Widget tab(bool ticking) => Directionality(
      textDirection: TextDirection.ltr,
      child: TickerMode(enabled: ticking, child: picture),
    );
    await tester.pumpWidget(tab(true));
    final built = frames.length;
    await tester.pumpWidget(tab(false));
    await tester.pumpWidget(tab(true));
    expect(frames, hasLength(built));
  });

  testWidgets('a picture that fails shows what the error builder gives', (
    tester,
  ) async {
    await tester.pumpWidget(still(_Provider('b', null, error: 'gone')));
    await tester.pump();
    expect(find.text('gone'), findsOneWidget);
  });
}
