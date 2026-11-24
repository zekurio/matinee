import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'server_accents.dart';
import 'session.dart';

/// Tells the session the app came to the foreground, so a saved server that
/// didn't answer while the process ran in the background is tried again.
/// Only back from out of sight: the notification shade or a system dialog
/// over the app takes its focus for a moment, which says nothing new.
class SessionLifecycle extends ConsumerStatefulWidget {
  const SessionLifecycle({required this.child, super.key});

  final Widget child;

  @override
  ConsumerState<SessionLifecycle> createState() => _SessionLifecycleState();
}

class _SessionLifecycleState extends ConsumerState<SessionLifecycle>
    with WidgetsBindingObserver {
  bool _away = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.hidden ||
        state == AppLifecycleState.paused) {
      _away = true;
    } else if (state == AppLifecycleState.resumed && _away) {
      _away = false;
      ref.read(sessionProvider.notifier).onForeground();
      unawaited(ref.read(serverAccentsProvider.notifier).refresh());
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
