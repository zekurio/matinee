import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/downloads/download_settings.dart';
import 'package:matinee/downloads/downloads.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/platform/player.g.dart' as player;
import 'package:matinee/player/playback_device.dart';
import 'package:matinee/screens/settings/downloads_page.dart';
import 'package:matinee/screens/settings/settings_screen.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../media/fixtures.dart';
import '../media/harness.dart';
import 'downloads_backend.dart';
import 'fake_downloads.dart';

const _server = 'https://media.example.com/';

player.VideoDecoderMessage _decoder(String codec) =>
    player.VideoDecoderMessage(codec: codec, tenBit: true);

Future<(ProviderContainer, FakeDownloadsPlatform)> _pump(
  WidgetTester tester, {
  DownloadsBackend? backend,
  Size size = const Size(412, 915),
  KitColors colors = matineeDark,
}) async {
  final platform = FakeDownloadsPlatform([
    downloadEntry(itemJson('m1'), server: _server, bytes: 1500000000),
    downloadEntry(itemJson('m2'), server: _server, bytes: 500000000),
  ]);
  const screen = SettingsPageScreen(pageKey: 'downloads');
  await pumpScreen(
    tester,
    screen,
    client: (backend ?? DownloadsBackend()).client,
    size: size,
    colors: colors,
    overrides: [
      downloadsPlatformProvider.overrideWithValue(platform),
      playbackCodecsProvider.overrideWith(
        (ref) async => player.CodecCapabilitiesMessage(
          video: [_decoder('h264'), _decoder('hevc')],
          audio: const ['aac'],
          dolbyVision: false,
        ),
      ),
    ],
  );
  await tester.runAsync(() => Future<void>.delayed(Duration.zero));
  await tester.pumpAndSettle();
  final container = ProviderScope.containerOf(
    tester.element(find.byType(DownloadsPage)),
  );
  return (container, platform);
}

void main() {
  setUpAll(loadFont);

  setUp(() {
    SharedPreferencesAsyncPlatform.instance =
        InMemorySharedPreferencesAsync.empty();
  });

  test("the codecs are the server's this device decodes", () {
    expect(downloadCodecChoices(['h264', 'hevc', 'av1'], ['hevc', 'h264']), [
      'h264',
      'hevc',
    ]);
    expect(downloadCodecChoices(['h264'], ['h264', 'av1']), ['h264']);
  });

  testWidgets('shows the space and keeps what is picked', (tester) async {
    final (container, platform) = await _pump(tester);
    expect(find.textContaining(' used · '), findsOneWidget);

    await tester.tap(find.text('Download on Wi-Fi only'));
    await tester.pumpAndSettle();
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    expect(
      container.read(downloadSettingsProvider).value?.unmeteredOnly,
      isFalse,
    );

    await tester.tap(find.text('Quality'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('720p, 4 Mbps'));
    await tester.pumpAndSettle();
    expect(
      container.read(downloadSettingsProvider).value?.defaultVersion,
      '720',
    );

    // AV1 is offered by the server, but this device has no decoder for it.
    await tester.tap(find.text('Codec'));
    await tester.pumpAndSettle();
    expect(find.text('AV1'), findsNothing);
    await tester.tap(find.text('HEVC'));
    await tester.pumpAndSettle();
    expect(container.read(downloadSettingsProvider).value?.videoCodec, 'hevc');
  });

  testWidgets('removes them all once confirmed', (tester) async {
    final (_, platform) = await _pump(tester);
    await tester.tap(find.text('Remove all downloads'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove'));
    await tester.pumpAndSettle();
    expect(platform.calls, containsAll(['remove m1', 'remove m2']));
    expect(find.text('Remove all downloads'), findsNothing);
  });

  testWidgets("an account that can't download has only the space", (
    tester,
  ) async {
    await _pump(tester, backend: DownloadsBackend(downloads: false));
    expect(find.text('Downloads are off'), findsOneWidget);
    expect(find.text('Download on Wi-Fi only'), findsNothing);
    expect(find.text('Quality'), findsNothing);
  });

  testWidgets('downloads_settings_phone_dark', (tester) async {
    await _pump(tester);
    await expectLater(
      find.byType(DownloadsPage),
      matchesGoldenFile('goldens/downloads_settings_phone_dark.png'),
    );
  });
}
