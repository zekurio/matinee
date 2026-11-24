import 'dart:typed_data';

import 'package:dynamic_color/dynamic_color.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_color_utilities/material_color_utilities.dart';
import 'package:matinee/kit/kit.dart';

void main() {
  // A new wallpaper is picked while the app is away, and shows when it's
  // back, with the old colors on screen until the new ones come.
  testWidgets('the wallpaper is read again when the app comes back', (
    tester,
  ) async {
    var hue = 210.0;
    // What Android answers: its five palettes, thirteen tones each, as the
    // signed ints of a Kotlin IntArray.
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      DynamicColorPlugin.channel,
      (call) async => Int32List.fromList([
        for (final chroma in [48.0, 16.0, 24.0, 4.0, 8.0])
          ...TonalPalette.of(hue, chroma).asList,
      ]),
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        DynamicColorPlugin.channel,
        null,
      ),
    );
    final container = ProviderContainer.test();
    container.listen(materialYouProvider, (_, _) {});
    Color accent(double hue) => Color(TonalPalette.of(hue, 48).get(80));

    final first = await container.read(materialYouProvider.future);
    expect(first?.dark.accent, accent(210));

    hue = 30;
    // Away and back, a step at a time as the engine reports it.
    for (final state in const [
      AppLifecycleState.inactive,
      AppLifecycleState.hidden,
      AppLifecycleState.paused,
      AppLifecycleState.hidden,
      AppLifecycleState.inactive,
      AppLifecycleState.resumed,
    ]) {
      tester.binding.handleAppLifecycleStateChanged(state);
    }
    expect(container.read(materialYouProvider).value, same(first));
    final second = await container.read(materialYouProvider.future);
    expect(second?.dark.accent, accent(30));
    // Riverpod's own timer for the read it just made again.
    await tester.pump(Duration.zero);
  });
}
