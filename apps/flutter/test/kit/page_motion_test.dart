import 'dart:async';

import 'package:flutter/cupertino.dart' show CupertinoPageTransition;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/motion.dart';
import 'package:matinee/kit/theme.dart';
import 'package:matinee/kit/tokens.dart';

const _width = 800.0;
const _below = Key('below');
const _above = Key('above');

/// The app's theme, with a page under the one [_push] opens. [below] is
/// how the page under it is made, a material page unless it's given.
Future<NavigatorState> _app(
  WidgetTester tester, {
  bool reduceMotion = false,
  Route<void> Function(Widget page)? below,
}) async {
  tester.view.physicalSize = const Size(_width, 600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final navigator = GlobalKey<NavigatorState>();
  await tester.pumpWidget(
    MaterialApp(
      navigatorKey: navigator,
      theme: MatineeTheme.data(matineeDark),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(disableAnimations: reduceMotion),
        child: child!,
      ),
      onGenerateRoute: (_) =>
          (below ?? _materialRoute)(const SizedBox.expand(key: _below)),
    ),
  );
  return navigator.currentState!;
}

Route<void> _materialRoute(Widget page) =>
    MaterialPageRoute<void>(builder: (_) => page);

/// Opens the page above, inside [wrap] if it's given, up to the first
/// frame of its move.
Future<void> _push(
  WidgetTester tester,
  NavigatorState navigator, {
  Widget Function(Widget page)? wrap,
}) async {
  const page = SizedBox.expand(key: _above);
  unawaited(navigator.push(_materialRoute(wrap?.call(page) ?? page)));
  // The first frame lays the page out offstage, for heroes.
  await tester.pump();
}

double _x(WidgetTester tester, Key key) =>
    tester.getTopLeft(find.byKey(key)).dx;

/// How opaque the page [key] is drawn, through every fade around it.
double _opacity(WidgetTester tester, Key key) {
  var opacity = 1.0;
  final around = find.ancestor(
    of: find.byKey(key),
    matching: find.byWidgetPredicate(
      (widget) => widget is Opacity || widget is FadeTransition,
    ),
  );
  for (final widget in tester.widgetList(around)) {
    opacity *= switch (widget) {
      Opacity(:final opacity) => opacity,
      FadeTransition(:final opacity) => opacity.value,
      _ => 1.0,
    };
  }
  return opacity;
}

Future<void> _at(WidgetTester tester, double fraction) =>
    tester.pump(KitMotion.page * fraction);

/// Android telling the app about its back gesture, as its embedding does.
Future<void> _gesture(
  WidgetTester tester,
  String method, [
  double? progress,
]) async {
  final message = const StandardMethodCodec().encodeMethodCall(
    MethodCall(method, {
      'touchOffset': [790.0, 300.0],
      'progress': ?progress,
      'swipeEdge': 1,
    }),
  );
  await tester.binding.defaultBinaryMessenger.handlePlatformMessage(
    SystemChannels.backGesture.name,
    message,
    (_) {},
  );
  await tester.pump();
}

/// A page over another, at rest, and the back gesture [progress] along.
Future<NavigatorState> _swiped(
  WidgetTester tester,
  double progress, {
  Widget Function(Widget page)? wrap,
}) async {
  final navigator = await _app(tester);
  await _push(tester, navigator, wrap: wrap);
  await tester.pumpAndSettle();
  await _gesture(tester, 'startBackGesture', 0);
  await _gesture(tester, 'updateBackGestureProgress', progress);
  return navigator;
}

void main() {
  final half = KitMotion.pageEasing.transform(.5);
  double ease(double t) => KitMotion.pageEasing.transform(t);

  testWidgets('a page fades in over the one it covers, which holds still', (
    tester,
  ) async {
    final navigator = await _app(tester);
    await _push(tester, navigator);
    await _at(tester, .5);

    expect(_opacity(tester, _above), moreOrLessEquals(half));
    expect(_x(tester, _above), 0);
    expect(_opacity(tester, _below), 1);
    expect(_x(tester, _below), 0);

    await tester.pumpAndSettle();
    expect(_opacity(tester, _above), 1);
  });

  testWidgets('it starts gently, so the fade is seen from its first frames', (
    tester,
  ) async {
    final navigator = await _app(tester);
    await _push(tester, navigator);
    await _at(tester, .25);

    // The web's curve was three quarters in by now.
    expect(_opacity(tester, _above), lessThan(.3));
  });

  testWidgets('going back fades it out, on the same curve', (tester) async {
    final navigator = await _app(tester);
    await _push(tester, navigator);
    await tester.pumpAndSettle();

    navigator.pop();
    await tester.pump();
    await _at(tester, .5);

    // Half the time gone is as far as the push was at half its time.
    expect(_opacity(tester, _above), moreOrLessEquals(1 - half));
    expect(_opacity(tester, _below), 1);

    await tester.pumpAndSettle();
    expect(find.byKey(_above), findsNothing);
    expect(_x(tester, _below), 0);
  });

  testWidgets('a page of another kind below holds still the same', (
    tester,
  ) async {
    final navigator = await _app(
      tester,
      below: (page) => PageRouteBuilder<void>(
        pageBuilder: (_, _, _) => page,
        transitionsBuilder: (_, animation, _, child) =>
            FadeTransition(opacity: animation, child: child),
      ),
    );
    await _push(tester, navigator);
    await _at(tester, .5);

    expect(_opacity(tester, _below), 1);
    expect(_x(tester, _below), 0);
  });

  testWidgets('with less motion asked for, nothing fades', (tester) async {
    final navigator = await _app(tester, reduceMotion: true);
    await _push(tester, navigator);
    await _at(tester, .5);

    expect(_opacity(tester, _above), 1);
    expect(_x(tester, _above), 0);
  });

  testWidgets("iOS keeps Cupertino's slide", (tester) async {
    final navigator = await _app(tester);
    await _push(tester, navigator);

    expect(find.byType(CupertinoPageTransition), findsWidgets);
  }, variant: TargetPlatformVariant.only(TargetPlatform.iOS));

  testWidgets('the back gesture fades the page out by the finger', (
    tester,
  ) async {
    await _swiped(tester, .5);

    // Where going back is when half its time is gone.
    expect(_opacity(tester, _above), moreOrLessEquals(1 - half));
    expect(_opacity(tester, _below), 1);
    // Faded, never moved or shrunk.
    expect(tester.getSize(find.byKey(_above)), const Size(_width, 600));
    expect(tester.getTopLeft(find.byKey(_above)), Offset.zero);
  });

  testWidgets('let go, the page goes on from where the finger left it', (
    tester,
  ) async {
    final navigator = await _swiped(tester, .5);
    await _gesture(tester, 'commitBackGesture');

    expect(_opacity(tester, _above), moreOrLessEquals(1 - half));
    await _at(tester, .25);
    expect(_opacity(tester, _above), moreOrLessEquals(1 - ease(.75)));

    await tester.pumpAndSettle();
    expect(find.byKey(_above), findsNothing);
    expect(_x(tester, _below), 0);
    expect(navigator.userGestureInProgress, isFalse);
  });

  testWidgets('cancelled, the page comes back from where the finger left it', (
    tester,
  ) async {
    final navigator = await _swiped(tester, .5);
    await _gesture(tester, 'cancelBackGesture');

    expect(_opacity(tester, _above), moreOrLessEquals(1 - half));
    await _at(tester, .25);
    expect(_opacity(tester, _above), moreOrLessEquals(1 - ease(.25)));

    await tester.pumpAndSettle();
    expect(_opacity(tester, _above), 1);
    expect(navigator.userGestureInProgress, isFalse);
  });

  testWidgets("a page whose PopScope won't go stays, and hears Back", (
    tester,
  ) async {
    final heard = <bool>[];
    await _swiped(
      tester,
      .5,
      wrap: (page) => PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) => heard.add(didPop),
        child: page,
      ),
    );
    expect(_opacity(tester, _above), 1);

    await _gesture(tester, 'commitBackGesture');
    await tester.pumpAndSettle();
    expect(find.byKey(_above), findsOneWidget);
    expect(heard, [false]);
  });

  testWidgets('a PopScope that lets the page go hears it go', (tester) async {
    final heard = <bool>[];
    await _swiped(
      tester,
      .5,
      wrap: (page) => PopScope(
        onPopInvokedWithResult: (didPop, _) => heard.add(didPop),
        child: page,
      ),
    );
    await _gesture(tester, 'commitBackGesture');
    await tester.pumpAndSettle();

    expect(find.byKey(_above), findsNothing);
    expect(heard, [true]);
  });
}
