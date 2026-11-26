import 'dart:async';

import 'package:flutter/cupertino.dart' show CupertinoPageTransition;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/kit/motion.dart';
import 'package:matinee/kit/theme.dart';
import 'package:matinee/kit/tokens.dart';

const _width = 800.0;
const _below = Key('below');
const _above = Key('above');

/// The app's theme, with a page under the one [push] opens. [below] is
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

/// Opens the page above, up to the first frame of its move.
Future<void> _push(WidgetTester tester, NavigatorState navigator) async {
  unawaited(navigator.push(_materialRoute(const SizedBox.expand(key: _above))));
  // The first frame lays the page out offstage, for heroes.
  await tester.pump();
}

double _x(WidgetTester tester, Key key) =>
    tester.getTopLeft(find.byKey(key)).dx;

Future<void> _at(WidgetTester tester, double fraction) =>
    tester.pump(KitMotion.move * fraction);

void main() {
  final half = KitMotion.easing.transform(.5);

  testWidgets('a page slides in over the one it covers, which moves aside', (
    tester,
  ) async {
    final navigator = await _app(tester);
    await _push(tester, navigator);
    await _at(tester, .5);

    expect(_x(tester, _above), moreOrLessEquals(_width * (1 - half)));
    expect(_x(tester, _below), moreOrLessEquals(-_width / 4 * half));

    await tester.pumpAndSettle();
    expect(_x(tester, _above), 0);
  });

  testWidgets('going back plays it backwards, on the same curve', (
    tester,
  ) async {
    final navigator = await _app(tester);
    await _push(tester, navigator);
    await tester.pumpAndSettle();

    navigator.pop();
    await tester.pump();
    await _at(tester, .5);

    // Half the time gone is as far as the push was at half its time.
    expect(_x(tester, _above), moreOrLessEquals(_width * half));
    expect(_x(tester, _below), moreOrLessEquals(-_width / 4 * (1 - half)));

    await tester.pumpAndSettle();
    expect(find.byKey(_above), findsNothing);
    expect(_x(tester, _below), 0);
  });

  testWidgets('a page of another kind below moves aside the same', (
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

    expect(_x(tester, _below), moreOrLessEquals(-_width / 4 * half));
  });

  testWidgets('with less motion asked for, nothing slides', (tester) async {
    final navigator = await _app(tester, reduceMotion: true);
    await _push(tester, navigator);
    await _at(tester, .5);

    expect(_x(tester, _above), 0);
    expect(_x(tester, _below), 0);
  });

  testWidgets("iOS keeps Cupertino's slide", (tester) async {
    final navigator = await _app(tester);
    await _push(tester, navigator);

    expect(find.byType(CupertinoPageTransition), findsWidgets);
  }, variant: TargetPlatformVariant.only(TargetPlatform.iOS));
}
