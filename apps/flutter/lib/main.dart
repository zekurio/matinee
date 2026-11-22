import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/device.dart';
import 'core/fresh_start.dart';
import 'core/session.dart';
import 'core/session_lifecycle.dart';
import 'core/session_store.dart';
import 'downloads/downloads_lifecycle.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // The Kotlin app's leftovers go before anything reads storage.
  await freshStart();
  final store = await SessionStore.open(
    await PlatformPreferences.open(),
    const PlatformSecretStore(),
  );
  final device = await Device.load();
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
      ],
      child: const SessionLifecycle(
        child: DownloadsLifecycle(child: MatineeApp()),
      ),
    ),
  );
}
