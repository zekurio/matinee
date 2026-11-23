import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import 'api/matinee_api.dart' show DevicePlatform;
import 'app.dart';
import 'core/apple_tv.dart';
import 'core/device.dart';
import 'core/fresh_start.dart';
import 'core/session.dart';
import 'core/session_lifecycle.dart';
import 'core/session_store.dart';
import 'downloads/downloads_lifecycle.dart';
import 'media/artwork.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // The Kotlin app's leftovers go before anything reads storage.
  await freshStart();
  final device = await Device.load();
  // The storage plugins have no tvOS side, so an Apple TV's settings and
  // tokens go through the app's own channel, set up before the first read.
  final appleTv = device.platform == DevicePlatform.tvos
      ? await AppleTv.open()
      : null;
  final store = await SessionStore.open(
    await PlatformPreferences.open(),
    appleTv?.secrets ?? const PlatformSecretStore(),
  );
  final httpStorage = device.platform == DevicePlatform.android
      ? await getApplicationCacheDirectory()
      : null;
  // A TV is driven by the remote alone, so focus shows from the start,
  // before the first key, and a stray touch event doesn't hide it.
  if (device.isTv) {
    FocusManager.instance.highlightStrategy =
        FocusHighlightStrategy.alwaysTraditional;
  }
  runApp(
    ProviderScope(
      overrides: [
        deviceProvider.overrideWithValue(device),
        sessionStoreProvider.overrideWithValue(store),
        httpStorageProvider.overrideWithValue(httpStorage),
        if (appleTv != null) ...[
          networkMonitorProvider.overrideWithValue(appleTv.network),
          cacheFolderProvider.overrideWithValue(
            Future.value(appleTv.cacheFolder),
          ),
        ],
      ],
      child: const SessionLifecycle(
        child: DownloadsLifecycle(child: MatineeApp()),
      ),
    ),
  );
}
