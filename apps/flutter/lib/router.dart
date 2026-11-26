import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'api/matinee_api.dart' show ImageTarget, TitleKind;
import 'core/device.dart';
import 'core/session.dart';
import 'kit/motion.dart';
import 'kit/route_page.dart';
import 'kit/theme.dart';
import 'player/offline_playback_screen.dart';
import 'player/player_lab.dart';
import 'player/tv/tv_playback_screen.dart';
import 'screens/downloads/downloads_screen.dart';
import 'screens/home/home_screen.dart';
import 'screens/library/library_screen.dart';
import 'screens/metadata/identify_screen.dart';
import 'screens/metadata/images_screen.dart';
import 'screens/person/person_screen.dart';
import 'screens/profile/lists_screens.dart';
import 'screens/profile/profile_screen.dart';
import 'screens/profile/user_profile_screen.dart';
import 'screens/requests/catalog_browse.dart';
import 'screens/requests/catalog_screen.dart';
import 'screens/requests/explore_screen.dart';
import 'screens/requests/requests_screen.dart';
import 'screens/search/search_screen.dart';
import 'screens/settings/admin/access_groups_page.dart';
import 'screens/settings/admin/connection_editor.dart';
import 'screens/settings/admin/library_editor.dart';
import 'screens/settings/admin/user_access_page.dart';
import 'screens/settings/licenses_page.dart';
import 'screens/settings/link_device.dart';
import 'screens/settings/settings_screen.dart';
import 'screens/shell/shell.dart';
import 'screens/sign_in/connect_screen.dart';
import 'screens/sign_in/sign_in_screen.dart';
import 'screens/sign_in/tv/tv_connect.dart';
import 'screens/sign_in/tv/tv_sign_in.dart';
import 'screens/sign_in/unreachable_screen.dart';
import 'screens/statistics/statistics_screen.dart';
import 'screens/title/episode_screen.dart';
import 'screens/title/season_screen.dart';
import 'screens/title/title_screen.dart';
import 'screens/tv/tv_browse.dart';
import 'screens/tv/tv_catalog.dart';
import 'screens/tv/tv_catalog_browse.dart';
import 'screens/tv/tv_detail.dart';
import 'screens/tv/tv_discover.dart';
import 'screens/tv/tv_home.dart';
import 'screens/tv/tv_profile.dart';
import 'screens/tv/tv_requests.dart';
import 'screens/tv/tv_settings.dart';
import 'screens/tv/tv_shell.dart';

/// Every place in the app, as the paths go_router opens. Screens navigate with
/// these, `context.push(Routes.title(id))`, never with a path typed out, so a
/// route's shape changes in one place. Media is a tab, with Shows and Movies
/// its preset links, and Explore holds what search used to open under its
/// empty field.
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

  // The tabs, and the profile that each of their headers opens over them.
  static const home = '/';
  static const media = '/media';
  static const downloads = '/downloads';
  static const explore = '/explore';
  static const profile = '/profile';
  static const statistics = '/statistics';

  /// The old links to one kind: Media, started on it.
  static const shows = '/shows';
  static const movies = '/movies';

  /// Search, over the tab it opens from. Offline it looks through the
  /// downloads.
  static const search = '/search';
  static const favorites = '/favorites';

  /// Discover on a TV, from its drawer: the touch screens have it in the
  /// Explore tab.
  static const discover = '/discover';
  static const recent = '/recent';
  static const settings = '/settings';
  static String settingsPage(String page) => '/settings/$page';
  static const linkDevice = '/link-device';

  /// The license text of [package], from Settings, About, Licenses.
  static String license(String package) =>
      '/licenses/${Uri.encodeComponent(package)}';

  /// The viewer's own requests.
  static String requests() => '/requests';

  /// Everyone's requests in one list, for whoever runs the queue; anyone
  /// else gets their own.
  static const requestQueue = '/requests/queue';

  static String browse({String? genre, String? studio}) => Uri(
    path: '/browse',
    queryParameters: _query({'genre': genre, 'studio': studio}),
  ).toString();

  static String title(String id) => '/title/$id';
  static String season(String titleId, int season) =>
      '/title/$titleId/season/$season';
  static String episode(String itemId) => '/episode/$itemId';

  /// The player, for the file or download id `playback.start` takes.
  static String play(String id) => '$playPrefix${Uri.encodeComponent(id)}';

  /// What every player's path starts with.
  static const playPrefix = '/play/';
  static String person(String name, {String? tmdbId}) => Uri(
    path: '/person/${Uri.encodeComponent(name)}',
    queryParameters: _query({'tmdb': tmdbId}),
  ).toString();

  /// Another person's profile, from Search or a link: their favorites,
  /// statistics, and recent plays, as far as they share them.
  static String userProfile(String username) =>
      '/profiles/${Uri.encodeComponent(username)}';

  /// The whole favorites list behind another person's profile.
  static String userFavorites(String username) =>
      '${userProfile(username)}/favorites';

  /// The whole recent list behind another person's profile.
  static String userRecent(String username) =>
      '${userProfile(username)}/recent';

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

  /// The server's folders, for the library editor to add one; it takes a
  /// `FolderPickerRequest` as the push's extra and pops the folder.
  static const folderPicker = '/admin/folders';

  /// A fulfilment connection, to add with no id or to change with one.
  static String connectionEditor([String? id]) =>
      id == null ? '/admin/connection' : '/admin/connection/$id';

  /// What an account may see and do, set by an admin.
  static String userAccess(String id) => '/admin/users/$id/access';

  /// An access group's page: [id]'s to change, or a new one.
  static String accessGroup([String? id]) =>
      id == null ? '/admin/groups' : '/admin/groups/$id';

  static Map<String, String>? _query(Map<String, String?> values) {
    final kept = {
      for (final MapEntry(:key, :value) in values.entries) key: ?value,
    };
    return kept.isEmpty ? null : kept;
  }
}

final _rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');

/// Where the session's state says the app is: the route that shows it, or null
/// when the app is in use and wherever the person is stays. No server picks
/// one, signed out signs in, a server that didn't answer says so, checking
/// shows that, and signed in or offline is the app. [path] is where the router
/// is now.
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

/// Where the app goes back to if adding a server is cancelled, when the
/// page that started it says more than its location does, as Settings
/// naming its category. The router takes it as the add begins.
final addServerReturnProvider = NotifierProvider<AddServerReturn, String?>(
  AddServerReturn.new,
);

class AddServerReturn extends Notifier<String?> {
  @override
  String? build() => null;

  void remember(String location) => state = location;

  void forget() => state = null;
}

/// The router for this device. Touch screens get the tabs and the pages
/// over them; a TV gets its own tree, with its rail and its pages. Both
/// follow the session: [authRedirect] decides where the app is, and
/// listens to [authStateProvider] through the router's refresh listenable.
final routerProvider = Provider<GoRouter>((ref) {
  final device = ref.watch(deviceProvider);
  final refresh = _AuthRefresh();
  // Adding a server leaves the app for the connect screen. Cancelling it
  // brings back the very session it left, and with it the page it left,
  // instead of Home.
  AuthState? addingFrom;
  String? addReturn;
  // Not a watch: a new state moves the router, it doesn't make a new one.
  ref.listen(authStateProvider, (before, now) {
    if (now is NoServer &&
        now.canCancel &&
        (before is SignedIn || before is Offline)) {
      addingFrom = before;
    }
    refresh.changed();
  });
  String? redirect(String location, String path) {
    final auth = ref.read(authStateProvider);
    if (auth is NoServer &&
        addingFrom != null &&
        addReturn == null &&
        !Routes.auth.contains(path)) {
      addReturn = ref.read(addServerReturnProvider) ?? location;
      ref.read(addServerReturnProvider.notifier).forget();
    }
    if ((auth is SignedIn || auth is Offline) && Routes.auth.contains(path)) {
      final (back, from) = (addReturn, addingFrom);
      addReturn = addingFrom = null;
      if (back != null && identical(from, auth)) return back;
    }
    return authRedirect(auth, path);
  }

  final router = GoRouter(
    navigatorKey: _rootKey,
    initialLocation: Routes.home,
    refreshListenable: refresh,
    redirect: (context, state) =>
        redirect(state.uri.toString(), state.uri.path),
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

/// A page a phone or tablet opens over another, from [builder]: it comes
/// in as the theme says, Cupertino's slide with the swipe back from the
/// edge on iOS, and on Android the kit's, which fades it in over the page
/// below and out again.
///
/// Not left to go_router's `builder`: since 18 it picks the page by finding
/// `material_ui`'s `MaterialApp`, doesn't see this app's, and gives every
/// page no transition. A TV's pages are [_tv]'s, which fade.
final class PushedRoute extends GoRoute {
  PushedRoute({
    required super.path,
    required GoRouterWidgetBuilder builder,
    super.parentNavigatorKey,
  }) : super(
         pageBuilder: (context, state) => kitPage(
           key: state.pageKey,
           name: state.name ?? state.path,
           // Clear of a landscape phone's notch or Dynamic Island, with the
           // page's background behind it.
           child: ColoredBox(
             color: MatineeTheme.of(context).background,
             child: SafeArea(
               top: false,
               bottom: false,
               child: builder(context, state),
             ),
           ),
         ),
       );
}

/// One of them, which fades in over the last rather than sliding: they are
/// states of one place, not pages.
GoRoute _authRoute(String path, Widget screen) => GoRoute(
  path: path,
  parentNavigatorKey: _rootKey,
  pageBuilder: (context, state) => _fadePage(state, screen),
);

/// [child] fading in over what was there, as the app does wherever one state
/// of a place takes another's: a sign-in step for the next, or the app for
/// the sign-in once the session is there.
Page<void> _fadePage(GoRouterState state, Widget child) =>
    FadePage(key: state.pageKey, name: state.name ?? state.path, child: child);

/// The tabs, each with its own stack, and the pages that open over them. Pages
/// open over the tabs, on the root navigator: a title page fills the screen
/// without the bars. The tabs fade into each other ([HandsetTabs]), every
/// one kept as it was left.
List<RouteBase> _handsetRoutes() => [
  StatefulShellRoute(
    pageBuilder: (context, state, shell) =>
        _fadePage(state, HandsetShell(shell: shell)),
    navigatorContainerBuilder: (context, shell, children) =>
        HandsetTabs(shell: shell, children: children),
    branches: [
      StatefulShellBranch(
        routes: [
          GoRoute(path: Routes.home, builder: (context, state) => _home),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: Routes.media,
            builder: (context, state) => const MediaScreen(),
          ),
          GoRoute(
            path: Routes.shows,
            builder: (context, state) =>
                const MediaScreen(initialKind: TitleKind.show),
          ),
          GoRoute(
            path: Routes.movies,
            builder: (context, state) =>
                const MediaScreen(initialKind: TitleKind.movie),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: Routes.downloads,
            builder: (context, state) => const DownloadsScreen(),
          ),
        ],
      ),
      StatefulShellBranch(
        routes: [
          GoRoute(
            path: Routes.explore,
            builder: (context, state) => const ExploreScreen(),
          ),
        ],
      ),
    ],
  ),
  PushedRoute(
    path: Routes.profile,
    parentNavigatorKey: _rootKey,
    builder: (context, state) => const ProfileScreen(),
  ),
  PushedRoute(
    path: Routes.statistics,
    parentNavigatorKey: _rootKey,
    builder: (context, state) => const StatisticsScreen(),
  ),
  PushedRoute(
    path: Routes.favorites,
    parentNavigatorKey: _rootKey,
    builder: (context, state) => const FavoritesScreen(),
  ),
  PushedRoute(
    path: Routes.recent,
    parentNavigatorKey: _rootKey,
    builder: (context, state) => const RecentScreen(),
  ),
  PushedRoute(
    path: '/profiles/:username',
    parentNavigatorKey: _rootKey,
    builder: (context, state) =>
        UserProfileScreen(username: state.pathParameters['username']!),
  ),
  PushedRoute(
    path: '/profiles/:username/favorites',
    parentNavigatorKey: _rootKey,
    builder: (context, state) =>
        FavoritesScreen(username: state.pathParameters['username']!),
  ),
  PushedRoute(
    path: '/profiles/:username/recent',
    parentNavigatorKey: _rootKey,
    builder: (context, state) =>
        RecentScreen(username: state.pathParameters['username']!),
  ),
  PushedRoute(
    path: Routes.settings,
    parentNavigatorKey: _rootKey,
    builder: (context, state) => const SettingsScreen(),
  ),
  PushedRoute(
    path: '/settings/:page',
    parentNavigatorKey: _rootKey,
    builder: (context, state) =>
        SettingsPageScreen(pageKey: state.pathParameters['page']!),
  ),
  PushedRoute(
    path: '/licenses/:package',
    parentNavigatorKey: _rootKey,
    builder: (context, state) =>
        LicenseTextScreen(package: state.pathParameters['package']!),
  ),
  PushedRoute(
    path: Routes.linkDevice,
    parentNavigatorKey: _rootKey,
    builder: (context, state) => const LinkDeviceScreen(),
  ),
  PushedRoute(
    path: Routes.search,
    parentNavigatorKey: _rootKey,
    builder: (context, state) => const SearchScreen(),
  ),
  PushedRoute(
    path: '/admin/library',
    parentNavigatorKey: _rootKey,
    builder: (context, state) => const LibraryEditorScreen(),
  ),
  PushedRoute(
    path: '/admin/library/:id',
    parentNavigatorKey: _rootKey,
    builder: (context, state) =>
        LibraryEditorScreen(id: state.pathParameters['id']),
  ),
  PushedRoute(
    path: Routes.folderPicker,
    parentNavigatorKey: _rootKey,
    builder: (context, state) => FolderPickerScreen(
      request: switch (state.extra) {
        final FolderPickerRequest request => request,
        _ => const FolderPickerRequest(),
      },
    ),
  ),
  PushedRoute(
    path: '/admin/connection',
    parentNavigatorKey: _rootKey,
    builder: (context, state) => const ConnectionEditorScreen(),
  ),
  PushedRoute(
    path: '/admin/connection/:id',
    parentNavigatorKey: _rootKey,
    builder: (context, state) =>
        ConnectionEditorScreen(id: state.pathParameters['id']),
  ),
  PushedRoute(
    path: '/admin/users/:id/access',
    parentNavigatorKey: _rootKey,
    builder: (context, state) =>
        UserAccessPage(userId: state.pathParameters['id']!),
  ),
  PushedRoute(
    path: '/admin/groups',
    parentNavigatorKey: _rootKey,
    builder: (context, state) => const AccessGroupPage(),
  ),
  PushedRoute(
    path: '/admin/groups/:id',
    parentNavigatorKey: _rootKey,
    builder: (context, state) =>
        AccessGroupPage(id: state.pathParameters['id']),
  ),
  PushedRoute(
    path: '/downloads/show/:titleId',
    parentNavigatorKey: _rootKey,
    builder: (context, state) =>
        DownloadsShowScreen(titleId: state.pathParameters['titleId']!),
  ),
  PushedRoute(
    path: '/title/:id',
    parentNavigatorKey: _rootKey,
    builder: (context, state) => TitleScreen(id: state.pathParameters['id']!),
  ),
  PushedRoute(
    path: '/title/:id/season/:season',
    parentNavigatorKey: _rootKey,
    builder: (context, state) {
      // -1 is the files without a season number.
      final season = int.tryParse(state.pathParameters['season']!);
      return SeasonScreen(
        titleId: state.pathParameters['id']!,
        season: season == null || season < 0 ? null : season,
      );
    },
  ),
  PushedRoute(
    path: '/episode/:id',
    parentNavigatorKey: _rootKey,
    builder: (context, state) => EpisodeScreen(id: state.pathParameters['id']!),
  ),
  PushedRoute(
    path: '/requests',
    parentNavigatorKey: _rootKey,
    builder: (context, state) => const RequestsScreen(),
  ),
  PushedRoute(
    path: Routes.requestQueue,
    parentNavigatorKey: _rootKey,
    builder: (context, state) => const RequestsScreen(queue: true),
  ),
  PushedRoute(
    path: '/catalog/:kind/:provider/:providerId',
    parentNavigatorKey: _rootKey,
    builder: (context, state) => CatalogScreen(
      catalogKey: (
        kind: state.pathParameters['kind']!,
        provider: state.pathParameters['provider']!,
        providerId: state.pathParameters['providerId']!,
        libraryId: state.uri.queryParameters['library'],
      ),
    ),
  ),
  PushedRoute(
    path: '/catalog-browse/:kind',
    parentNavigatorKey: _rootKey,
    builder: (context, state) => CatalogBrowseScreen(
      kind: state.pathParameters['kind']!,
      filters: state.uri.queryParameters['filters'],
      sort: state.uri.queryParameters['sort'],
    ),
  ),
  PushedRoute(
    path: '/person/:name',
    parentNavigatorKey: _rootKey,
    builder: (context, state) => PersonScreen(
      name: state.pathParameters['name']!,
      tmdbId: state.uri.queryParameters['tmdb'],
    ),
  ),
  PushedRoute(
    path: '/identify/:titleId',
    parentNavigatorKey: _rootKey,
    builder: (context, state) =>
        IdentifyScreen(titleId: state.pathParameters['titleId']!),
  ),
  PushedRoute(
    path: '/images/:titleId',
    parentNavigatorKey: _rootKey,
    builder: (context, state) {
      final season = int.tryParse(state.uri.queryParameters['season'] ?? '');
      return ImagesScreen(
        target: ImageTarget(
          titleId: state.pathParameters['titleId']!,
          season: season,
          // An episode's only with its season.
          episode: season == null
              ? null
              : int.tryParse(state.uri.queryParameters['episode'] ?? ''),
        ),
      );
    },
  ),
  PushedRoute(
    path: '/browse',
    parentNavigatorKey: _rootKey,
    builder: (context, state) => BrowseScreen(
      genre: state.uri.queryParameters['genre'],
      studio: state.uri.queryParameters['studio'],
    ),
  ),
  if (_hasPlayer)
    GoRoute(
      path: '/play/:id',
      parentNavigatorKey: _rootKey,
      pageBuilder: (context, state) => NoTransitionPage<void>(
        key: state.pageKey,
        // A finished download plays from the device; the rest from the server.
        child: PlayRoute(
          id: state.pathParameters['id']!,
          startAt: switch (state.extra) {
            final double value => value,
            _ => null,
          },
        ),
      ),
    ),
  if (_hasPlayerLab)
    PushedRoute(
      path: Routes.playerLab,
      parentNavigatorKey: _rootKey,
      builder: (context, state) => const PlayerLab(),
    ),
];

/// Only Android and iOS have the native players so far.
bool get _hasPlayer =>
    defaultTargetPlatform == TargetPlatform.android ||
    defaultTargetPlatform == TargetPlatform.iOS;

bool get _hasPlayerLab => kDebugMode && _hasPlayer;

/// One Home for every build of the tabs: go_router builds each tab's page
/// again on every navigation, and a new Home built all of itself again in
/// the first frame of a page opening or going back, or of a tab.
final _home = HomeScreen(
  links: [if (_hasPlayerLab) ('Player lab', Routes.playerLab)],
);

/// The TV's pages, under its drawer: the phone's paths, TV screens. The pages
/// from the drawer sit over Home, so Back goes there; the rest open over
/// whatever opened them. There's no downloads page, no admin page, no image
/// editor or identify, and no single library's grid: the drawer's Movies and
/// Shows take every library at once. Discover has a page of its own from the
/// drawer, where the touch screens have it in the Explore tab.
List<RouteBase> _tvRoutes() => [
  GoRoute(
    path: '/play/:id',
    parentNavigatorKey: _rootKey,
    pageBuilder: (context, state) => NoTransitionPage<void>(
      key: state.pageKey,
      // A TV keeps no downloads, so every file plays from the server.
      child: TvPlaybackScreen(
        itemId: state.pathParameters['id']!,
        startAt: switch (state.extra) {
          final double value => value,
          _ => null,
        },
      ),
    ),
  ),
  ShellRoute(
    navigatorKey: tvPagesKey,
    pageBuilder: (context, state, child) => _fadePage(
      state,
      TvShell(stack: _tvStack(GoRouter.of(context)), pages: child),
    ),
    routes: [
      _tv(
        Routes.home,
        (state) => const TvHomeScreen(),
        routes: [
          _tv(Routes.search.substring(1), (state) => const TvSearchScreen()),
          _tv(
            Routes.favorites.substring(1),
            (state) => const TvFavoritesScreen(),
          ),
          _tv(
            Routes.discover.substring(1),
            (state) => const TvDiscoverScreen(),
          ),
          _tv(
            Routes.movies.substring(1),
            (state) => const TvKindScreen(kind: TitleKind.movie),
          ),
          _tv(
            Routes.shows.substring(1),
            (state) => const TvKindScreen(kind: TitleKind.show),
          ),
          _tv(Routes.profile.substring(1), (state) => const TvProfileScreen()),
          _tv(
            Routes.settings.substring(1),
            (state) => TvSettingsScreen(
              initial: state.uri.queryParameters['category'],
            ),
          ),
        ],
      ),
      _tv(Routes.recent, (state) => const TvRecentScreen()),
      _tv(
        '/settings/:page',
        (state) => TvSettingsScreen(initial: state.pathParameters['page']),
      ),
      _tv(
        '/title/:id',
        (state) => TvTitleScreen(id: state.pathParameters['id']!),
      ),
      _tv(
        '/title/:id/season/:season',
        (state) => TvSeasonScreen(
          titleId: state.pathParameters['id']!,
          // -1 is the files without a season number.
          season: switch (int.tryParse(state.pathParameters['season']!)) {
            final number? when number >= 0 => number,
            _ => null,
          },
        ),
      ),
      _tv(
        '/episode/:id',
        (state) => TvEpisodeScreen(id: state.pathParameters['id']!),
      ),
      _tv(
        '/person/:name',
        (state) => TvPersonScreen(
          name: state.pathParameters['name']!,
          tmdbId: state.uri.queryParameters['tmdb'],
        ),
      ),
      _tv('/requests', (state) => const TvRequestsScreen()),
      _tv(Routes.requestQueue, (state) => const TvRequestsScreen(queue: true)),
      _tv(
        '/catalog/:kind/:provider/:providerId',
        (state) => TvCatalogScreen(
          catalogKey: (
            kind: state.pathParameters['kind']!,
            provider: state.pathParameters['provider']!,
            providerId: state.pathParameters['providerId']!,
            libraryId: state.uri.queryParameters['library'],
          ),
        ),
      ),
      _tv(
        '/catalog-browse/:kind',
        (state) => TvCatalogBrowseScreen(
          kind: state.pathParameters['kind']!,
          filters: state.uri.queryParameters['filters'],
          sort: state.uri.queryParameters['sort'],
        ),
      ),
      _tv(
        '/browse',
        (state) => TvBrowseScreen(
          genre: state.uri.queryParameters['genre'],
          studio: state.uri.queryParameters['studio'],
        ),
      ),
    ],
  ),
];

/// A TV page at [path], fading in as the last fades out. A page under
/// Home takes its path without the slash.
GoRoute _tv(
  String path,
  Widget Function(GoRouterState state) screen, {
  List<RouteBase> routes = const [],
}) => GoRoute(
  path: path,
  routes: routes,
  pageBuilder: (context, state) => CustomTransitionPage<void>(
    key: state.pageKey,
    transitionDuration: TvMotion.enter + TvMotion.exit,
    reverseTransitionDuration: TvMotion.enter + TvMotion.exit,
    transitionsBuilder: (context, animation, secondary, child) =>
        FadeTransition(
          opacity: CurvedAnimation(
            parent: animation,
            curve: const Interval(.4, 1, curve: TvMotion.easing),
          ),
          child: FadeTransition(
            opacity: Tween<double>(begin: 1, end: 0).animate(
              CurvedAnimation(
                parent: secondary,
                curve: const Interval(0, .4, curve: TvMotion.exitEasing),
              ),
            ),
            child: child,
          ),
        ),
    child: TvPageFrame(child: screen(state)),
  ),
);

/// The paths of the TV pages open, bottom first.
List<String> _tvStack(GoRouter router) {
  final paths = <String>[];
  void walk(List<RouteMatchBase> matches) {
    for (final match in matches) {
      if (match is ShellRouteMatch) {
        walk(match.matches);
      } else if (match is RouteMatch) {
        paths.add(match.matchedLocation);
      }
    }
  }

  walk(router.routerDelegate.currentConfiguration.matches);
  return paths;
}
