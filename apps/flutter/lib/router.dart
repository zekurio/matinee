import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/device.dart';
import 'screens/pending.dart';
import 'screens/shell/shell.dart';

/// Every place in the app, as the paths go_router opens. Screens navigate
/// with these, `context.push(Routes.title(id))`, never with a path typed
/// out, so a route's shape changes in one place. The Kotlin app's routes
/// (ui/Nav.kt) map one to one.
abstract final class Routes {
  static const home = '/';
  static const media = '/media';
  static const downloads = '/downloads';

  static const profile = '/profile';
  static const favorites = '/favorites';
  static const recent = '/recent';
  static const settings = '/settings';
  static String settingsPage(String page) => '/settings/$page';
  static const linkDevice = '/link-device';
  static const asked = '/asked';
  static String requests([String list = 'waiting']) => '/requests/$list';

  static String library(String id, {String? sort}) => Uri(
    path: '/library/$id',
    queryParameters: _query({'sort': sort}),
  ).toString();
  static String kind(String kind) => '/kind/$kind';
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

/// The router for this device. Touch screens get the tabs and the pages
/// over them; a TV gets its own tree (to come with the TV screens).
final routerProvider = Provider<GoRouter>((ref) {
  final device = ref.watch(deviceProvider);
  final router = GoRouter(
    navigatorKey: _rootKey,
    initialLocation: Routes.home,
    routes: device.isTv ? _tvRoutes() : _handsetRoutes(),
  );
  ref.onDispose(router.dispose);
  return router;
});

/// The tabs, each with its own stack, and the pages that open over them.
/// Pages open over the tabs, on the root navigator, as the Kotlin app has
/// them: a title page fills the screen without the bar.
List<RouteBase> _handsetRoutes() => [
  StatefulShellRoute.indexedStack(
    builder: (context, state, shell) => HandsetShell(shell: shell),
    branches: [
      StatefulShellBranch(routes: [_pending(Routes.home, 'Home')]),
      StatefulShellBranch(routes: [_pending(Routes.media, 'Media')]),
      StatefulShellBranch(routes: [_pending(Routes.downloads, 'Downloads')]),
    ],
  ),
  for (final (path, name) in _pages) _pending(path, name, root: true),
];

List<RouteBase> _tvRoutes() => [_pending(Routes.home, 'TV home')];

/// The pages over the tabs, by path pattern, until each has its screen.
const _pages = [
  ('/profile', 'Profile'),
  ('/favorites', 'Favorites'),
  ('/recent', 'Recently watched'),
  ('/settings', 'Settings'),
  ('/settings/:page', 'Settings page'),
  ('/link-device', 'Link a device'),
  ('/asked', 'My requests'),
  ('/requests/:list', 'Requests'),
  ('/library/:id', 'Library'),
  ('/kind/:kind', 'Movies or shows'),
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

GoRoute _pending(String path, String name, {bool root = false}) => GoRoute(
  path: path,
  parentNavigatorKey: root ? _rootKey : null,
  builder: (context, state) => PendingScreen(name: name, location: state.uri),
);
