import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../api/matinee_api.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/avatar.dart';
import '../../query/server_data.dart';
import '../../router.dart';

/// How many movies and shows there are, so the drawer offers only the
/// kinds the server has.
final tvKindsProvider = serverQuery(
  (api) async => (await api.titles.browse(limit: 1)).kinds,
);

/// The navigator TV pages open in, under the drawer.
final tvPagesKey = GlobalKey<NavigatorState>(debugLabel: 'tv pages');

/// The drawer's entries, by the page each opens.
abstract final class TvDrawerKeys {
  static const profile = 'profile';
  static const search = 'search';
  static const home = 'home';
  static const favorites = 'favorites';
  static const settings = 'settings';
  static String kind(String kind) => 'kind-$kind';
}

/// The drawer entry a page belongs to, by its path, if any.
String? tvDrawerKey(String path) {
  if (path == Routes.home) return TvDrawerKeys.home;
  if (path == Routes.search) return TvDrawerKeys.search;
  if (path == Routes.favorites) return TvDrawerKeys.favorites;
  if (path == Routes.movies) return TvDrawerKeys.kind(TitleKind.movie);
  if (path == Routes.shows) return TvDrawerKeys.kind(TitleKind.show);
  if (path == Routes.profile || path == Routes.recent) {
    return TvDrawerKeys.profile;
  }
  if (path == Routes.settings || path.startsWith('${Routes.settings}/')) {
    return TvDrawerKeys.settings;
  }
  return null;
}

/// The signed-in app on a TV, as the Kotlin app's `TvSignedInApp`: its own
/// pages in [pages], under a drawer at the left edge, over the backdrop
/// the page picks, with the clock at the top right. [stack] is the paths of
/// the pages open, bottom first. Downloads, offline mode, the admin pages,
/// the image editor, identify, and linking by camera have no TV page, so
/// nothing here leads to them.
class TvShell extends ConsumerStatefulWidget {
  const TvShell({super.key, required this.pages, required this.stack});

  final Widget pages;
  final List<String> stack;

  @override
  ConsumerState<TvShell> createState() => _TvShellState();

  static _TvShellState? _of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<_ShellScope>()?.shell;
}

class _ShellScope extends InheritedWidget {
  const _ShellScope({
    required this.shell,
    required this.home,
    required super.child,
  });

  final _TvShellState shell;
  final bool home;

  @override
  bool updateShouldNotify(_ShellScope old) => old.home != home;
}

class _TvShellState extends ConsumerState<TvShell> {
  final drawer = TvDrawerController();
  final backdrop = TvBackdropState();
  final _scrolled = ValueNotifier<bool>(false);
  final _pagesScrolled = <Route<Object?>, bool>{};
  late final AppLifecycleListener _lifecycle;
  FocusNode? _pageFocus;
  Timer? _refocus;

  @override
  void initState() {
    super.initState();
    FocusManager.instance.addListener(_focusChanged);
    drawer.addListener(_drawerChanged);
    _lifecycle = AppLifecycleListener(
      onResume: () => ref.invalidate(tvKindsProvider),
    );
  }

  @override
  void dispose() {
    FocusManager.instance.removeListener(_focusChanged);
    drawer
      ..removeListener(_drawerChanged)
      ..dispose();
    backdrop.dispose();
    _scrolled.dispose();
    _lifecycle.dispose();
    _refocus?.cancel();
    super.dispose();
  }

  void _drawerChanged() => setState(() {});

  /// The page on screen, if it's a TV page.
  _TvPageState? get _page {
    for (final page in _TvPageState._live) {
      final route = page._route;
      if (route != null &&
          route.isCurrent &&
          route.navigator == tvPagesKey.currentState) {
        return page;
      }
    }
    return null;
  }

  void _focusChanged() {
    final node = FocusManager.instance.primaryFocus;
    final page = _page?._scope;
    if (node != null &&
        page != null &&
        node != page &&
        node.ancestors.contains(page)) {
      _pageFocus = node;
    }
    if (_lost(node)) _refocusIn(const Duration(milliseconds: 120));
  }

  void _refocusIn(Duration delay) {
    _refocus?.cancel();
    _refocus = Timer(delay, () {
      if (mounted && _lost(FocusManager.instance.primaryFocus)) toPage();
    });
  }

  /// Nothing has focus that should: it went with a card that's gone, or a
  /// page just opened. Not while a panel has it.
  bool _lost(FocusNode? node) {
    if (tvOpenPanels.value > 0) return false;
    if (node == null) return true;
    if (node is! FocusScopeNode || node is TvOverlayScopeNode) return false;
    final pages = tvPagesKey.currentState?.focusNode;
    if (pages == null) return false;
    return node == pages ||
        node.ancestors.contains(pages) ||
        pages.ancestors.contains(node);
  }

  /// Gives focus back to the page: what it had last, or where it starts.
  void toPage() {
    final page = _page;
    final scope = page?._scope;
    if (page == null || scope == null) return;
    final last = _pageFocus;
    if (last != null &&
        last.context != null &&
        last.canRequestFocus &&
        last.ancestors.contains(scope)) {
      last.requestFocus();
      return;
    }
    final route = page._route;
    final memory = route == null ? null : TvFocusMemory.of(route);
    if (memory != null && memory.focusLast()) {
      // Still waiting for its card: ask again, so a page that never shows
      // it, as one whose episodes failed to load, still gets focus.
      if (memory.opening) _refocusIn(const Duration(milliseconds: 250));
      return;
    }
    final first = scope.traversalDescendants
        .where((node) => node.canRequestFocus && !node.skipTraversal)
        .firstOrNull;
    if (first == null) return;
    first.requestFocus();
    memory?.standIn(first);
  }

  void _edge(TraversalDirection direction) {
    final node = FocusManager.instance.primaryFocus;
    final inDrawer = node?.ancestors.contains(drawer.scope) ?? false;
    if (direction == TraversalDirection.left && !inDrawer) {
      drawer.open();
    } else if (direction == TraversalDirection.right && inDrawer) {
      toPage();
    }
  }

  void _pick(TvDrawerEntry entry, String? shown) {
    if (entry.key == shown) {
      toPage();
      return;
    }
    // A page from the drawer, on top of Home so Back goes there.
    final path = switch (entry.key) {
      TvDrawerKeys.home => Routes.home,
      TvDrawerKeys.search => Routes.search,
      TvDrawerKeys.favorites => Routes.favorites,
      TvDrawerKeys.profile => Routes.profile,
      TvDrawerKeys.settings => Routes.settings,
      _ when entry.key == TvDrawerKeys.kind(TitleKind.movie) => Routes.movies,
      _ => Routes.shows,
    };
    _pageFocus = null;
    context.go(path);
    // A new page takes focus from the drawer as it opens. Home is already
    // under the others, so going there only uncovers it, and nothing would.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final node = FocusManager.instance.primaryFocus;
      if (mounted && (node?.ancestors.contains(drawer.scope) ?? false)) {
        toPage();
      }
    });
  }

  bool _scroll(ScrollNotification notification) {
    if (notification.depth != 0 || notification.metrics.axis != Axis.vertical) {
      return false;
    }
    final route = ModalRoute.of(notification.context ?? context);
    if (route == null) return false;
    _pagesScrolled[route] = notification.metrics.pixels > 8;
    _updateScrolled();
    return false;
  }

  void _updateScrolled() {
    _pagesScrolled.removeWhere((route, _) => !route.isActive);
    final page = _page?._route;
    _scrolled.value = page != null && (_pagesScrolled[page] ?? false);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final user = switch (ref.watch(authStateProvider)) {
      SignedIn(:final user) || Offline(:final user) => user,
      _ => null,
    };
    final counts = ref.watch(tvKindsProvider).value;
    final stack = widget.stack;
    final top = stack.lastOrNull ?? Routes.home;
    final current =
        stack.reversed.map(tvDrawerKey).nonNulls.firstOrNull ??
        TvDrawerKeys.home;
    final shown = top == Routes.recent ? null : tvDrawerKey(top);
    final name = user?.displayName ?? user?.username ?? '';
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _updateScrolled();
    });
    return _ShellScope(
      shell: this,
      home: top == Routes.home,
      child: ColoredBox(
        color: colors.background,
        child: TvFocusRules(
          onEdge: _edge,
          child: Stack(
            fit: StackFit.expand,
            children: [
              TvBackdropLayer(state: backdrop),
              NotificationListener<ScrollNotification>(
                onNotification: _scroll,
                child: widget.pages,
              ),
              PositionedDirectional(
                top: Overscan.vertical + 11,
                end: Overscan.horizontal,
                child: ListenableBuilder(
                  listenable: Listenable.merge([tvOpenPanels, _scrolled]),
                  builder: (context, _) => AnimatedOpacity(
                    opacity: tvOpenPanels.value > 0 || _scrolled.value ? 0 : 1,
                    duration: TvMotion.color,
                    child: const TvClock(),
                  ),
                ),
              ),
              PositionedDirectional(
                top: 0,
                bottom: 0,
                start: 0,
                child: TvDrawer(
                  controller: drawer,
                  current: current,
                  onPick: (entry) => _pick(entry, shown),
                  top: TvDrawerEntry(
                    key: TvDrawerKeys.profile,
                    label: name,
                    leading: Avatar(
                      avatarId: user?.avatarId,
                      name: name,
                      size: 32,
                    ),
                  ),
                  entries: [
                    TvDrawerEntry(
                      key: TvDrawerKeys.search,
                      label: l.searchTitle,
                      icon: Lucide.search,
                    ),
                    TvDrawerEntry(
                      key: TvDrawerKeys.home,
                      label: l.tabHome,
                      icon: Lucide.house,
                    ),
                    TvDrawerEntry(
                      key: TvDrawerKeys.favorites,
                      label: l.favoritesTitle,
                      icon: Lucide.heart,
                    ),
                    if ((counts?.movie ?? 0) > 0)
                      TvDrawerEntry(
                        key: TvDrawerKeys.kind(TitleKind.movie),
                        label: l.browseKindMovie,
                        icon: Lucide.film,
                      ),
                    if ((counts?.show ?? 0) > 0)
                      TvDrawerEntry(
                        key: TvDrawerKeys.kind(TitleKind.show),
                        label: l.browseKindShow,
                        icon: Lucide.tv,
                      ),
                  ],
                  bottom: TvDrawerEntry(
                    key: TvDrawerKeys.settings,
                    label: l.shellSettings,
                    icon: Lucide.settings,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Every TV page, for the router to put around it: Back closes the drawer
/// first, Back on Home opens it, and the next Back leaves the app. A page
/// with a [TvFocusMemory] lets the shell put focus back where it was.
class TvPageFrame extends StatefulWidget {
  const TvPageFrame({super.key, required this.child});

  final Widget child;

  @override
  State<TvPageFrame> createState() => _TvPageState();
}

class _TvPageState extends State<TvPageFrame> {
  static final _live = <_TvPageState>{};

  ModalRoute<Object?>? _route;
  FocusScopeNode? _scope;

  @override
  void initState() {
    super.initState();
    _live.add(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _route = ModalRoute.of(context);
    _scope = FocusScope.of(context);
  }

  @override
  void dispose() {
    _live.remove(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<_ShellScope>();
    final shell = scope?.shell;
    final route = _route;
    if (shell != null && route != null) shell.backdrop.open(route);
    final open = shell?.drawer.isOpen ?? false;
    final home = scope?.home ?? false;
    return PopScope(
      canPop: home ? open : !open,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop || shell == null) return;
        if (open) {
          shell.toPage();
        } else if (home) {
          shell.drawer.open();
        }
      },
      child: widget.child,
    );
  }
}

/// Shows [sources] behind the page while it's on screen, the first that
/// loads. A page shows it with what's focused; a change waits a moment for
/// focus to rest and crossfades.
class TvBackdrop extends StatefulWidget {
  const TvBackdrop({super.key, required this.sources, required this.child});

  final List<PictureSource> sources;
  final Widget child;

  @override
  State<TvBackdrop> createState() => _TvBackdropState();
}

class _TvBackdropState extends State<TvBackdrop> {
  @override
  Widget build(BuildContext context) {
    final shell = TvShell._of(context);
    final route = ModalRoute.of(context);
    if (shell != null && route != null) {
      final sources = widget.sources;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) shell.backdrop.set(route, sources);
      });
    }
    return widget.child;
  }
}

/// What each page asked to show behind it, by its route. A page that asks
/// for none shows the plain background from its first frame.
class TvBackdropState extends ChangeNotifier {
  final _requests = <Route<Object?>, List<PictureSource>>{};

  void open(Route<Object?> page) => _requests.putIfAbsent(page, () => const []);

  void set(Route<Object?> page, List<PictureSource> sources) {
    if (_sameSources(_requests[page], sources)) return;
    _requests[page] = sources;
    notifyListeners();
  }

  /// The page on screen and what it asked for.
  (Route<Object?>, List<PictureSource>)? get shown {
    _requests.removeWhere((route, _) => !route.isActive);
    for (final MapEntry(:key, :value) in _requests.entries) {
      if (key.isCurrent) return (key, value);
    }
    return null;
  }
}

bool _sameSources(List<PictureSource>? a, List<PictureSource> b) =>
    a != null && listEquals(_keys(a), _keys(b));

List<Object> _keys(List<PictureSource> sources) => [
  for (final source in sources)
    switch (source) {
      ArtSource(:final art) => art.id,
      FrameSource(:final itemId) => 'frame:$itemId',
    },
];

/// How long focus has to rest before the backdrop follows it.
const _settle = Duration(milliseconds: 350);

/// The shell's layer under the pages: the picture the page on screen asked
/// for, dimmed from the left and the bottom where a page's text and rows
/// sit, crossfading when it changes.
class TvBackdropLayer extends StatefulWidget {
  const TvBackdropLayer({super.key, required this.state});

  final TvBackdropState state;

  @override
  State<TvBackdropLayer> createState() => _TvBackdropLayerState();
}

class _TvBackdropLayerState extends State<TvBackdropLayer> {
  Route<Object?>? _page;
  List<PictureSource> _sources = const [];
  Timer? _wait;

  @override
  void initState() {
    super.initState();
    widget.state.addListener(_changed);
  }

  @override
  void dispose() {
    widget.state.removeListener(_changed);
    _wait?.cancel();
    super.dispose();
  }

  void _changed() {
    final shown = widget.state.shown;
    if (shown == null) return;
    final (page, sources) = shown;
    if (page == _page && _sameSources(_sources, sources)) return;
    _wait?.cancel();
    if (page == _page && _sources.isNotEmpty && sources.isNotEmpty) {
      _wait = Timer(_settle, () {
        if (mounted) setState(() => _sources = sources);
      });
    } else {
      setState(() {
        _page = page;
        _sources = sources;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // A page come back, or one on top gone: what it asked for at once.
    final shown = widget.state.shown;
    if (shown != null && shown.$1 != _page) {
      _page = shown.$1;
      _sources = shown.$2;
      _wait?.cancel();
    }
    final colors = MatineeTheme.of(context);
    final sources = _sources;
    return ColoredBox(
      color: colors.background,
      child: AnimatedSwitcher(
        duration: TvMotion.move * 2,
        switchInCurve: TvMotion.easing,
        child: sources.isEmpty
            ? const SizedBox.expand()
            : Stack(
                key: ValueKey(_keys(sources).join('|')),
                fit: StackFit.expand,
                children: [
                  Picture(sources, alignment: Alignment.topRight),
                  _Scrim(colors.background),
                ],
              ),
      ),
    );
  }
}

/// Darkens the picture so text reads on it: most at the left and bottom,
/// a little at the top for the clock.
class _Scrim extends StatelessWidget {
  const _Scrim(this.shade);

  final Color shade;

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              shade.withValues(alpha: .94),
              shade.withValues(alpha: .78),
              shade.withValues(alpha: .3),
              shade.withValues(alpha: .15),
            ],
            stops: const [0, .35, .7, 1],
          ),
        ),
      ),
      DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              shade.withValues(alpha: .45),
              shade.withValues(alpha: 0),
              shade.withValues(alpha: .35),
              shade.withValues(alpha: .95),
            ],
            stops: const [0, .18, .45, 1],
          ),
        ),
      ),
    ],
  );
}

/// The time at the top right of every TV page, in the device's 12 or 24
/// hour style.
class TvClock extends StatefulWidget {
  const TvClock({super.key});

  /// The time it reads, which tests hold still.
  @visibleForTesting
  static DateTime Function() now = DateTime.now;

  @override
  State<TvClock> createState() => _TvClockState();
}

class _TvClockState extends State<TvClock> {
  Timer? _tick;
  DateTime _now = TvClock.now();

  @override
  void initState() {
    super.initState();
    _schedule();
  }

  void _schedule() {
    final now = DateTime.now();
    // Wake at the turn of the next minute.
    final wait = Duration(
      milliseconds: 60000 - (now.second * 1000 + now.millisecond),
    );
    _tick = Timer(wait, () {
      if (!mounted) return;
      setState(() => _now = TvClock.now());
      _schedule();
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).toLanguageTag();
    final format = MediaQuery.alwaysUse24HourFormatOf(context)
        ? DateFormat.Hm(locale)
        : DateFormat.jm(locale);
    return Text(
      format.format(_now),
      style: TvType.clock.style(
        color: MatineeTheme.of(context).foreground.withValues(alpha: .9),
      ),
    );
  }
}

/// Goes to [route] as the page above this one, as the Kotlin app's
/// `titleUp` and `seasonUp`: back to it when it's the page before, else
/// opened over this one. The phone's `goUp` reads the root's matches; a
/// TV's pages sit under its shell, so this reads the shell's.
void tvGoUp(BuildContext context, String route) {
  final locations = <String>[];
  void walk(List<RouteMatchBase> matches) {
    for (final match in matches) {
      if (match is ImperativeRouteMatch) {
        walk(match.matches.matches);
      } else if (match is ShellRouteMatch) {
        walk(match.matches);
      } else if (match is RouteMatch) {
        locations.add(match.matchedLocation);
      }
    }
  }

  walk(GoRouter.of(context).routerDelegate.currentConfiguration.matches);
  if (locations.length >= 2 && locations[locations.length - 2] == route) {
    context.pop();
    return;
  }
  unawaited(context.push(route));
}
