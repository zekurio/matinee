import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/router.dart';

import 'core/fakes.dart';

/// A router with Home and one page pushed over it, which it opens.
Future<void> _push(WidgetTester tester) async {
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
}

void main() {
  // go_router 18 looks for material_ui's MaterialApp to choose a page for a
  // `builder`, doesn't see this app's, and gave every page NoTransitionPage:
  // no slide, no swipe back on iOS, no predictive Back on Android.
  testWidgets(
    'a page pushed on a phone slides in',
    (tester) async {
      await _push(tester);

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

  // A plain `GoRoute` with a `builder` would open with no transition.
  test('every page over the tabs is pushed, but the player', () {
    final container = ProviderContainer(
      overrides: [
        authStateProvider.overrideWithValue(
          SignedIn('https://media.test', User.fromJson(userJson('viewer'))),
        ),
      ],
    );
    addTearDown(container.dispose);
    final routes = container.read(routerProvider).configuration.routes;
    expect([
      for (final route in routes)
        if (route is GoRoute && route is! PushedRoute) route.path,
    ], unorderedEquals([...Routes.auth, '/play/:id']));
  });

  // A phone on its side has the notch or Dynamic Island at one end and
  // the same inset at the other.
  testWidgets('a pushed page keeps clear of a landscape phone\'s notch', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(874, 402);
    tester.view.devicePixelRatio = 1;
    tester.view.padding = const FakeViewPadding(
      left: 62,
      right: 62,
      bottom: 21,
    );
    addTearDown(tester.view.reset);
    await _push(tester);

    expect(tester.getTopLeft(find.text('page')).dx, 62);
    // Only the sides are taken: the page lays out the bottom inset itself.
    expect(
      MediaQuery.paddingOf(tester.element(find.text('page'))),
      const EdgeInsets.only(bottom: 21),
    );
  });
}
