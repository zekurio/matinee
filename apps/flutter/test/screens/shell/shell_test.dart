import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/session.dart';
import 'package:matinee/router.dart';

import '../../core/fakes.dart';

final _user = User.fromJson(userJson('viewer'));

void main() {
  test('the shell has four tabs, and the profile is not one of them', () {
    final container = ProviderContainer(
      overrides: [
        authStateProvider.overrideWithValue(
          SignedIn('https://media.test', _user),
        ),
      ],
    );
    addTearDown(container.dispose);
    final routes = container.read(routerProvider).configuration.routes;
    final shell = routes.whereType<StatefulShellRoute>().single;
    expect(shell.branches, hasLength(4));
    expect(
      [for (final branch in shell.branches) branch.defaultRoute?.path],
      [Routes.home, Routes.media, Routes.downloads, Routes.explore],
    );
    // Shows and Movies still open Media, on their kind.
    final media = shell.branches[1];
    expect(
      [
        for (final route in media.routes)
          if (route is GoRoute) route.path,
      ],
      [Routes.media, Routes.shows, Routes.movies],
    );
    expect([
      for (final route in routes)
        if (route is GoRoute) route.path,
    ], contains(Routes.profile));
  });
}
