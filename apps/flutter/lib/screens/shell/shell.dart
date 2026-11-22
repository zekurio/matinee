import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/avatar.dart';
import '../../router.dart';
import '../home/home_data.dart';
import 'header.dart';

/// A tap on the tab that's already open: [path] is the tab's first page,
/// and [count] tells one tap from the next. The tab's screen listens and
/// scrolls back to its top, as the shell sends the tab to its first page.
typedef TabReselect = ({String path, int count});

final tabReselectProvider = NotifierProvider<_TabReselects, TabReselect?>(
  _TabReselects.new,
);

final class _TabReselects extends Notifier<TabReselect?> {
  @override
  TabReselect? build() => null;

  void tapped(String path) =>
      state = (path: path, count: (state?.count ?? 0) + 1);
}

/// The signed-in touch screens' frame, the same on a phone and a tablet:
/// the header on top, and the tabs along the bottom, Home, Shows, Movies,
/// Downloads, and the profile, each keeping its own stack. Both stay while
/// a tab's pages scroll; a page opened from a tab covers them.
class HandsetShell extends ConsumerStatefulWidget {
  const HandsetShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  ConsumerState<HandsetShell> createState() => _HandsetShellState();
}

/// Shows and Movies, which need the server.
const _libraryTabs = {1, 2};

class _HandsetShellState extends ConsumerState<HandsetShell> {
  late final _selected = TabBarState(widget.shell.currentIndex);

  /// Home's header floats over the hero until its page scrolls, then it
  /// takes its band back so its words read over whatever is under them.
  var _homeScrolled = false;

  /// A page is open over the shell, so Home's status bar belongs to it.
  var _homeCovered = false;
  GoRouter? _router;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final router = GoRouter.maybeOf(context);
    if (router == _router) return;
    _router?.routerDelegate.removeListener(_routeMoved);
    _router?.routeInformationProvider.removeListener(_routeMoved);
    _router = router;
    _router?.routerDelegate.addListener(_routeMoved);
    _router?.routeInformationProvider.addListener(_routeMoved);
    _syncCovered();
  }

  void _routeMoved() => _syncCovered();

  void _syncCovered() {
    final router = _router;
    if (router == null) return;
    final path = router.routeInformationProvider.value.uri.path;
    final covered = path != Routes.home;
    if (covered != _homeCovered) setState(() => _homeCovered = covered);
  }

  @override
  void didUpdateWidget(HandsetShell old) {
    super.didUpdateWidget(old);
    _selected.select(widget.shell.currentIndex);
  }

  @override
  void dispose() {
    _router?.routerDelegate.removeListener(_routeMoved);
    _router?.routeInformationProvider.removeListener(_routeMoved);
    _selected.dispose();
    super.dispose();
  }

  void _open(Object index) {
    // SAFETY: the items' ids are their branch indexes, set just below.
    final branch = index as int;
    // A tap on the open tab goes back to its first page, at its top.
    final again = branch == widget.shell.currentIndex;
    widget.shell.goBranch(branch, initialLocation: again);
    if (again) {
      final first = widget.shell.route.branches[branch].defaultRoute;
      if (first != null) {
        ref.read(tabReselectProvider.notifier).tapped(first.path);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final words = AppLocalizations.of(context);
    final user = switch (ref.watch(authStateProvider)) {
      SignedIn(:final user) || Offline(:final user) => user,
      _ => null,
    };
    final avatar = user?.avatarId;
    // Offline only what works without the server stays: Home from the
    // downloads, the downloads, and the profile, which leads to Settings. There
    // are no libraries to list without it.
    final offline = ref.watch(authStateProvider) is Offline;
    ref.listen(authStateProvider, (_, auth) {
      if (auth is Offline && _libraryTabs.contains(widget.shell.currentIndex)) {
        widget.shell.goBranch(0);
      }
    });
    final items = [
      TabBarItem(id: 0, icon: Lucide.house, label: words.tabHome),
      if (!offline) ...[
        TabBarItem(id: 1, icon: Lucide.tv, label: words.tabShows),
        TabBarItem(id: 2, icon: Lucide.film, label: words.tabMovies),
      ],
      TabBarItem(id: 3, icon: Lucide.download, label: words.downloadsTitle),
      TabBarItem(
        id: 4,
        icon: Lucide.userRound,
        label: words.tabProfile,
        picture: avatar == null
            ? null
            : Avatar(
                avatarId: avatar,
                name: user?.username ?? '',
                size: 22,
                // Offline, or when it can't load, the tab's own icon.
                fallback: KitIcon(
                  Lucide.userRound,
                  size: 22,
                  color: MatineeTheme.of(context).mutedForeground,
                ),
              ),
      ),
    ];
    // Home is under every other tab: back on another tab's first page goes to
    // Home, and only Home's leaves the app.
    final home = widget.shell.currentIndex == 0;
    // Home opens with a hero, its skeleton, or neither. The header floats
    // over the first two, so one with no featured titles keeps its band.
    final featured = ref.watch(featuredProvider);
    final hero =
        home && !offline && (featured.value?.isNotEmpty ?? !featured.hasError);
    final page = MediaQuery.removePadding(
      context: context,
      // A hero runs from the screen's top, under the status bar, and reads
      // that inset for its height. Other tabs start below the header.
      removeTop: !hero,
      removeBottom: true,
      child: widget.shell,
    );
    Widget body = hero
        ? Stack(
            children: [
              Positioned.fill(
                child: NotificationListener<ScrollNotification>(
                  onNotification: (notification) {
                    // Only Home's own list moves the header; the rails
                    // inside it and the hero's pages don't.
                    if (notification.depth != 0) return false;
                    final scrolled = notification.metrics.pixels > 0;
                    if (scrolled != _homeScrolled) {
                      setState(() => _homeScrolled = scrolled);
                    }
                    return false;
                  },
                  child: page,
                ),
              ),
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: ShellHeader(floating: !_homeScrolled),
              ),
            ],
          )
        : page;
    // While Home is the page showing, its status bar sits over the hero's
    // dark art (or, scrolled, over the header's band). A pushed page keeps
    // the theme's usual bar.
    if (hero) {
      body = AnnotatedRegion<SystemUiOverlayStyle>(
        value: _homeCovered
            ? _themeStatusBarStyle(context)
            : _heroStatusBarStyle(context),
        child: body,
      );
    }
    return PopScope(
      canPop: home,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !home) widget.shell.goBranch(0);
      },
      child: ColoredBox(
        color: MatineeTheme.of(context).background,
        child: Column(
          children: [
            if (!hero) const ShellHeader(),
            Expanded(child: body),
            TabBar(items: items, state: _selected, onSelected: _open),
          ],
        ),
      ),
    );
  }

  /// Light icons over the hero, whose art is dark in either scheme; the
  /// usual brightness once the header has its band back.
  SystemUiOverlayStyle _heroStatusBarStyle(BuildContext context) {
    final darkIcons = _homeScrolled && !MatineeTheme.of(context).isDark;
    return SystemUiOverlayStyle(
      statusBarColor: const Color(0x00000000),
      statusBarIconBrightness: darkIcons ? Brightness.dark : Brightness.light,
      statusBarBrightness: darkIcons ? Brightness.light : Brightness.dark,
    );
  }

  /// The theme's usual status bar, for a page opened over Home.
  SystemUiOverlayStyle _themeStatusBarStyle(BuildContext context) {
    final dark = MatineeTheme.of(context).isDark;
    return SystemUiOverlayStyle(
      statusBarColor: const Color(0x00000000),
      statusBarIconBrightness: dark ? Brightness.light : Brightness.dark,
      statusBarBrightness: dark ? Brightness.light : Brightness.dark,
    );
  }
}
