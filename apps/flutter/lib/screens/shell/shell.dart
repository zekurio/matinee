import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/avatar.dart';
import '../../router.dart';
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

/// The header above the tabs: Home keeps the logo with settings and search,
/// and each other tab gets its own name and only the actions it has. Shows and
/// Movies build theirs in the tab itself, where the list's filter and sort
/// live, so the shell leaves no band for them.
class ShellTopBar extends ConsumerWidget {
  const ShellTopBar({super.key, required this.index});

  /// The shell's branch index: Home, Shows, Movies, Downloads, or Profile.
  final int index;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final words = AppLocalizations.of(context);
    return switch (index) {
      0 => const ShellHeader(),
      1 || 2 => const SizedBox.shrink(),
      3 => TabHeader(
        title: words.downloadsTitle,
        offline: ref.watch(authStateProvider) is Offline,
      ),
      _ => TabHeader(
        title: words.tabProfile,
        actions: [
          HeaderButton(
            icon: Lucide.settings,
            label: words.shellSettings,
            onPressed: () => context.push(Routes.settings),
          ),
        ],
      ),
    };
  }
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

  @override
  void didUpdateWidget(HandsetShell old) {
    super.didUpdateWidget(old);
    _selected.select(widget.shell.currentIndex);
  }

  @override
  void dispose() {
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
    return PopScope(
      canPop: home,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !home) widget.shell.goBranch(0);
      },
      child: ColoredBox(
        color: MatineeTheme.of(context).background,
        child: Column(
          children: [
            ShellTopBar(index: widget.shell.currentIndex),
            Expanded(
              child: MediaQuery.removePadding(
                context: context,
                // A library tab's header is inside the tab, which keeps the
                // status bar's inset to clear it, as [ShellTopBar] does.
                removeTop: !_libraryTabs.contains(widget.shell.currentIndex),
                removeBottom: true,
                child: widget.shell,
              ),
            ),
            TabBar(items: items, state: _selected, onSelected: _open),
          ],
        ),
      ),
    );
  }
}
