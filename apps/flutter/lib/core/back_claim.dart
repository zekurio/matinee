import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'device.dart';

/// Whether the app takes Back itself, as told to Android, in place of
/// `WidgetsApp`'s own handler.
///
/// A phone says what the navigators say, as the default does, so Back on
/// a screen with nothing to close shows the system's predictive animation.
///
/// A TV always takes it. Its pages sit in a navigator nested in the root
/// one, and each tells Android on its own whether Back is the app's, the
/// last one heard winning: as the app started, the root's "no" came after
/// Home's "yes, Back opens the drawer", and Back left the app. Taken
/// always, Back goes through the pages' `PopScope`s, and when nothing is
/// left to close the framework hands it to Android, which leaves the app
/// as before. A TV has no predictive animation to lose.
///
/// What it hears before the app has a lifecycle state, which the default
/// drops, it says again once the app is resumed.
final class BackClaim with WidgetsBindingObserver {
  BackClaim({required this.tv});

  final bool tv;
  bool? _last;

  /// For `onNavigationNotification`; stops it there, as the default does.
  bool onNotification(NavigationNotification notification) {
    final handles = tv || notification.canHandlePop;
    _last = handles;
    switch (WidgetsBinding.instance.lifecycleState) {
      case null:
      case AppLifecycleState.detached:
        break;
      case AppLifecycleState.resumed:
      case AppLifecycleState.inactive:
      case AppLifecycleState.hidden:
      case AppLifecycleState.paused:
        _tell(handles);
    }
    return true;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final last = _last;
    if (state == AppLifecycleState.resumed && last != null) _tell(last);
  }

  void _tell(bool handles) =>
      unawaited(SystemNavigator.setFrameworkHandlesBack(handles));
}

final backClaimProvider = Provider<BackClaim>((ref) {
  final claim = BackClaim(tv: ref.watch(deviceProvider).isTv);
  WidgetsBinding.instance.addObserver(claim);
  ref.onDispose(() => WidgetsBinding.instance.removeObserver(claim));
  return claim;
});
