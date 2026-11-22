import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/device.dart';
import '../core/session.dart';
import 'download_settings.dart';
import 'downloads.dart';
import 'pending_progress.dart';

/// Keeps the platform's downloads in step with the session: each saved server's
/// sign-in goes to the platform, so its downloads go on with the app closed;
/// whether to wait for Wi-Fi follows the setting; what was waiting or running
/// starts again; a server removed takes its downloads along; and once signed in
/// with the server answering, what was watched offline is sent there. `main`
/// puts it around the app; tests leave it out.
class DownloadsLifecycle extends ConsumerStatefulWidget {
  const DownloadsLifecycle({required this.child, super.key});

  final Widget child;

  @override
  ConsumerState<DownloadsLifecycle> createState() => _DownloadsLifecycleState();
}

class _DownloadsLifecycleState extends ConsumerState<DownloadsLifecycle> {
  final _sent = <String, String?>{};
  bool _restored = false;

  @override
  void initState() {
    super.initState();
    final session = ref.read(sessionProvider.notifier);
    session.onRemove = (origin, api) async {
      _sent.remove(origin);
      await ref.read(downloadsProvider.notifier).forgetServer(origin, api);
    };
    ref.listenManual(sessionProvider, (_, _) => _sendSignIns());
    ref.listenManual(
      downloadSettingsProvider,
      (_, settings) => unawaited(_settings(settings.value)),
      fireImmediately: true,
    );
    ref.listenManual(authStateProvider, (_, auth) {
      if (auth is! SignedIn) return;
      final api = ref.read(apiProvider);
      final server = ref.read(downloadsServerProvider);
      if (api == null || server == null) return;
      unawaited(ref.read(pendingProgressProvider.notifier).flush(server, api));
    }, fireImmediately: true);
    _sendSignIns();
  }

  /// Every saved server's token as it is now, sent when it changed.
  void _sendSignIns() {
    final store = ref.read(sessionStoreProvider);
    final agent = ref.read(deviceProvider).userAgent;
    final platform = ref.read(downloadsPlatformProvider);
    for (final server in store.servers) {
      final token = store.token(server.origin);
      if (_sent.containsKey(server.origin) && _sent[server.origin] == token) {
        continue;
      }
      _sent[server.origin] = token;
      unawaited(
        platform
            .setCredentials(server.origin, token, agent)
            .catchError((Object _) => _sent.remove(server.origin)),
      );
    }
  }

  Future<void> _settings(DownloadSettings? settings) async {
    if (settings == null) return;
    final platform = ref.read(downloadsPlatformProvider);
    try {
      await platform.setUnmeteredOnly(settings.unmeteredOnly);
      // What was waiting or running when the app last ran, with the
      // setting it has now.
      if (!_restored) {
        _restored = true;
        await platform.restore();
      }
    } on Object {
      // No platform side; nothing to fetch.
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
