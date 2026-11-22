import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/core/back_claim.dart';

void main() {
  testWidgets('a phone says what the navigators say, again on resume', (
    tester,
  ) async {
    await _android(() async {
      final (claim, told) = _claim(tester, tv: false);

      // As the app starts: a screen keeps Back before Android said anything.
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.detached);
      expect(
        claim.onNotification(const NavigationNotification(canHandlePop: true)),
        isTrue,
      );
      expect(told, isEmpty);

      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      expect(told, [true]);

      // Once resumed, every word goes through.
      claim.onNotification(const NavigationNotification(canHandlePop: false));
      expect(told, [true, false]);
    });
  });

  testWidgets('a TV keeps Back whatever a navigator says last', (tester) async {
    await _android(() async {
      final (claim, told) = _claim(tester, tv: true);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);

      // Home's pages say yes, then the root navigator says no.
      claim.onNotification(const NavigationNotification(canHandlePop: true));
      claim.onNotification(const NavigationNotification(canHandlePop: false));
      expect(told, [true, true]);
    });
  });
}

/// Only Android's `SystemNavigator` says anything. The binding checks the
/// override is gone before teardown, so it's cleared here, not there.
Future<void> _android(Future<void> Function() body) async {
  debugDefaultTargetPlatformOverride = TargetPlatform.android;
  try {
    await body();
  } finally {
    debugDefaultTargetPlatformOverride = null;
  }
}

(BackClaim, List<Object?>) _claim(WidgetTester tester, {required bool tv}) {
  final told = <Object?>[];
  final messenger = tester.binding.defaultBinaryMessenger;
  messenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
    if (call.method == 'SystemNavigator.setFrameworkHandlesBack') {
      told.add(call.arguments);
    }
    return null;
  });
  addTearDown(
    () => messenger.setMockMethodCallHandler(SystemChannels.platform, null),
  );
  final claim = BackClaim(tv: tv);
  tester.binding.addObserver(claim);
  addTearDown(() => tester.binding.removeObserver(claim));
  return (claim, told);
}
