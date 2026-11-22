import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:matinee/router.dart';

void main() {
  // go_router 18 looks for material_ui's MaterialApp to choose a page for a
  // `builder`, doesn't see this app's, and gave every page NoTransitionPage:
  // no slide, no swipe back on iOS, no predictive Back on Android.
  testWidgets(
    'a page pushed on a phone slides in',
    (tester) async {
      final navigator = GlobalKey<NavigatorState>();
      final router = GoRouter(
        navigatorKey: navigator,
        initialLocation: '/',
        routes: [
          GoRoute(path: '/', builder: (context, state) => const Text('home')),
          PushedRoute(
            path: '/page',
            parentNavigatorKey: navigator,
            builder: (context, state) => const Text('page'),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      unawaited(router.push('/page'));
      await tester.pumpAndSettle();

      final route = ModalRoute.of(tester.element(find.text('page')))!;
      expect(route.settings, isNot(isA<NoTransitionPage<void>>()));
      expect(route, isA<PageRoute<void>>());
      expect(route.transitionDuration, greaterThan(Duration.zero));
    },
    variant: TargetPlatformVariant(const {
      TargetPlatform.iOS,
      TargetPlatform.android,
    }),
  );
}
