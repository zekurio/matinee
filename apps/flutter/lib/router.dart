import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/device.dart';
import 'core/session.dart';
import 'player/player_lab.dart';
import 'screens/pending.dart';
import 'screens/shell/shell.dart';
import 'screens/sign_in/connect_screen.dart';
import 'screens/sign_in/sign_in_screen.dart';
import 'screens/sign_in/tv/tv_connect.dart';
import 'screens/sign_in/tv/tv_sign_in.dart';
import 'screens/sign_in/unreachable_screen.dart';

/// Every place in the app, as the paths go_router opens. Screens navigate
/// with these, `context.push(Routes.title(id))`, never with a path typed
/// out, so a route's shape changes in one place. They follow the Kotlin
/// app's (ui/Nav.kt), except that Shows and Movies are tabs in place of
/// Media and its libraries, and the requests are one page, which an admin
/// reaches from the waiting requests at the top of Explore.
abstract final class Routes {
  // Before the app: the session's state picks one (see [authRedirect]).
  /// Typing or picking a server's address.
  static const connect = '/connect';

  /// Signing in to the server, by browser or by code.
  static const signIn = '/sign-in';

  /// The saved server didn't answer.
  static const unreachable = '/unreachable';

  /// Checking the saved server and session.
  static const connecting = '/connecting';

  /// The routes the session's state chooses among, which no screen opens by
  /// hand.
  static const auth = {connect, signIn, unreachable, connecting};

  // The tabs.
  static const home = '/';
  static const shows = '/shows';
  static const movies = '/movies';
  static const downloads = '/downloads';
  static const profile = '/profile';

  /// Search, with Explore under the field: the catalog's rows, an
  /// admin's waiting requests first.
  static const search = '/search';
  static const favorites = '/favorites';
  static const recent = '/recent';
  static const settings = '/settings';
  static String settingsPage(String page) => '/settings/$page';
  static const linkDevice = '/link-device';

  /// Yours, and for an admin the ones waiting on them; [list] picks one
  /// of an admin's lists.
  static String requests([String? list]) =>
      list == null ? '/requests' : '/requests/$list';

  static String browse({String? genre, String? studio}) => Uri(
    path: '/browse',
    queryParameters: _query({'genre': genre, 'studio': studio}),
  ).toString();

  static String title(String id) => '/title/$id';
  static String season(String titleId, int season) =>
      '/title/$titleId/season/$season';
  static String episode(String itemId) => '/episode/$itemId';
  static String person(String name, {String? tmdbId}) => Uri(
    path: '/person/${Uri.encodeComponent(name)}',
    queryParameters: _query({'tmdb': tmdbId}),
  ).toString();

  static String downloadsShow(String titleId) => '/downloads/show/$titleId';
  static String identify(String titleId) => '/identify/$titleId';
  static String images(String titleId, {int? season, int? episode}) => Uri(
    path: '/images/$titleId',
    queryParameters: _query({
      'season': season?.toString(),
      'episode': episode?.toString(),
    }),
  ).toString();

  static String catalog(
    String kind,
    String provider,
    String providerId, {
    String? library,
  }) => Uri(
    path: '/catalog/$kind/$provider/$providerId',
    queryParameters: _query({'library': library}),
  ).toString();
  static String catalogBrowse(String kind, {String? filters, String? sort}) =>
      Uri(
        path: '/catalog-browse/$kind',
        queryParameters: _query({'filters': filters, 'sort': sort}),
      ).toString();

  /// Debug builds on Android only: both players, by hand.
  static const playerLab = '/debug/player';

  static String libraryEditor([String? id]) =>
      id == null ? '/admin/library' : '/admin/library/$id';
  static const folderPicker = '/admin/folders';

  static Map<String, String>? _query(Map<String, String?> values) {
    final kept = {
      for (final MapEntry(:key, :value) in values.entries) key: ?value,
    };
    return kept.isEmpty ? null : kept;
  }
}

final _rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');

/// Where the session's state says the app is: the route that shows it, or
/// null when the app is in use and wherever the person is stays. Mirrors the
/// Kotlin app's `MatineeRoot`: no server picks one, signed out signs in, a
/// server that didn't answer says so, checking shows that, and signed in
/// or offline is the app. [path] is where the router is now.
///
/// Leaving the sign-in routes once signed in, and coming back to them on
/// sign-out or a switch to another server, needs nothing from the screens:
/// the router asks this again whenever the state changes.
String? authRedirect(AuthState auth, String path) {
  final target = switch (auth) {
    NoServer() => Routes.connect,
    Connecting() => Routes.connecting,
    Unreachable() => Routes.unreachable,
    SignedOut() => Routes.signIn,
    SignedIn() || Offline() => null,
  };
  if (target == null) return Routes.auth.contains(path) ? Routes.home : null;
  return path == target ? null : target;
}

/// Tells the router to ask [authRedirect] again.
final class _AuthRefresh extends ChangeNotifier {
  void changed() => notifyListeners();
}

/// The router for this device. Touch screens get the tabs and the pages
/// over them; a TV gets its own tree (to come with the TV screens). Both
/// follow the session: [authRedirect] decides where the app is, and
/// listens to [authStateProvider] through the router's refresh listenable.
final routerProvider = Provider<GoRouter>((ref) {
  final device = ref.watch(deviceProvider);
  final refresh = _AuthRefresh();
  // Not a watch: a new state moves the router, it doesn't make a new one.
  ref.listen(authStateProvider, (_, _) => refresh.changed());
  final router = GoRouter(
    navigatorKey: _rootKey,
    initialLocation: Routes.home,
    refreshListenable: refresh,
    redirect: (context, state) =>
        authRedirect(ref.read(authStateProvider), state.uri.path),
    routes: [
      ..._authRoutes(tv: device.isTv),
      ...(device.isTv ? _tvRoutes() : _handsetRoutes()),
    ],
  );
  ref.onDispose(() {
    router.dispose();
    refresh.dispose();
  });
  return router;
});

/// The screens the session's state chooses among, each its own for a TV.
List<RouteBase> _authRoutes({required bool tv}) => [
  _authRoute(
    Routes.connect,
    tv ? const TvConnectScreen() : const ConnectScreen(),
  ),
  _authRoute(Routes.signIn, tv ? const TvSignInScreen() : const SignInScreen()),
  _authRoute(
    Routes.unreachable,
    tv ? const TvUnreachableScreen() : const UnreachableScreen(),
  ),
  _authRoute(
    Routes.connecting,
    tv ? const TvConnectingScreen() : const ConnectingScreen(),
  ),
];

/// One of them, which replaces the last without a slide: they are states of
/// one place, not pages.
GoRoute _authRoute(String path, Widget screen) => GoRoute(
  path: path,
  parentNavigatorKey: _rootKey,
  pageBuilder: (context, state) =>
      NoTransitionPage<void>(key: state.pageKey, child: screen),
);

/// The tabs, each with its own stack, and the pages that open over them.
/// Pages open over the tabs, on the root navigator, as the Kotlin app has
/// them: a title page fills the screen without the bars.
List<RouteBase> _handsetRoutes() => [
  StatefulShellRoute.indexedStack(
    builder: (context, state, shell) => HandsetShell(shell: shell),
    branches: [
      StatefulShellBranch(
        routes: [
          _pending(
            Routes.home,
            'Home',
            links: [if (_hasPlayerLab) ('Player lab', Routes.playerLab)],
          ),
        ],
      ),
      StatefulShellBranch(routes: [_pending(Routes.shows, 'Shows')]),
      StatefulShellBranch(routes: [_pending(Routes.movies, 'Movies')]),
      StatefulShellBranch(routes: [_pending(Routes.downloads, 'Downloads')]),
      StatefulShellBranch(routes: [_pending(Routes.profile, 'Profile')]),
    ],
  ),
  for (final (path, name) in _pages) _pending(path, name, root: true),
  if (_hasPlayerLab)
    GoRoute(
      path: Routes.playerLab,
      parentNavigatorKey: _rootKey,
      builder: (context, state) => const PlayerLab(),
    ),
];

/// Only Android has the native players so far.
bool get _hasPlayerLab =>
    kDebugMode && defaultTargetPlatform == TargetPlatform.android;

List<RouteBase> _tvRoutes() => [_pending(Routes.home, 'TV home')];

/// The pages over the tabs, by path pattern, until each has its screen.
const _pages = [
  ('/search', 'Search and Explore'),
  ('/favorites', 'Favorites'),
  ('/recent', 'Recently watched'),
  ('/settings', 'Settings'),
  ('/settings/:page', 'Settings page'),
  ('/link-device', 'Link a device'),
  ('/requests', 'Requests'),
  ('/requests/:list', 'Requests'),
  ('/browse', 'Browse'),
  ('/title/:id', 'Title'),
  ('/title/:id/season/:season', 'Season'),
  ('/episode/:id', 'Episode'),
  ('/person/:name', 'Person'),
  ('/downloads/show/:titleId', 'Show downloads'),
  ('/identify/:titleId', 'Identify'),
  ('/images/:titleId', 'Images'),
  ('/catalog/:kind/:provider/:providerId', 'Catalog title'),
  ('/catalog-browse/:kind', 'Browse the catalog'),
  ('/admin/library', 'New library'),
  ('/admin/library/:id', 'Library editor'),
  ('/admin/folders', 'Folder picker'),
];

GoRoute _pending(
  String path,
  String name, {
  bool root = false,
  List<(String, String)> links = const [],
}) => GoRoute(
  path: path,
  parentNavigatorKey: root ? _rootKey : null,
  builder: (context, state) =>
      PendingScreen(name: name, location: state.uri, links: links),
);
