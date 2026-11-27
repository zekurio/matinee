import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
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

/// The header above the tabs: Home keeps the logo with search, each other tab
/// gets its own name and only the actions it has, and every one ends with the
/// account's avatar, which opens the profile over the tabs. Media builds its
/// header in the tab itself, where the list's filter and sort live, so the
/// shell leaves no band for it. Offline, Downloads gets a search beside its
/// name, which looks through the downloads.
class ShellTopBar extends ConsumerWidget {
  const ShellTopBar({super.key, required this.index});

  /// The shell's branch index: Home, Media, Downloads, or Explore.
  final int index;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final words = AppLocalizations.of(context);
    final offline = ref.watch(authStateProvider) is Offline;
    return switch (index) {
      0 => const ShellHeader(),
      1 => const SizedBox.shrink(),
      3 => TabHeader(
        title: words.tabExplore,
        actions: [
          PageBarButton(
            icon: Lucide.search,
            label: words.searchTitle,
            onPressed: () => context.push(Routes.search),
          ),
        ],
      ),
      _ => TabHeader(
        title: words.downloadsTitle,
        actions: [
          if (offline)
            PageBarButton(
              icon: Lucide.search,
              label: words.searchTitle,
              onPressed: () => context.push(Routes.search),
            ),
        ],
      ),
    };
  }
}

/// The signed-in touch screens' frame, the same on a phone and a tablet:
/// the tabs, [HandsetTabs], above the tab bar, Home, Media, Downloads, and
/// Explore, each keeping its own stack. The bar stays while a tab's pages
/// scroll and while tabs fade into each other; a page opened from a tab
/// covers them.
class HandsetShell extends ConsumerStatefulWidget {
  const HandsetShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  ConsumerState<HandsetShell> createState() => _HandsetShellState();
}

/// Media and Explore, which need the server.
const _serverTabs = {1, 3};

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
    // Offline only what works without the server stays: Home from the
    // downloads, and the downloads. The profile still opens from the header's
    // avatar, and leads to Settings. There are no libraries or catalog to
    // list without it; Search looks through the downloads.
    final offline = ref.watch(authStateProvider) is Offline;
    ref.listen(authStateProvider, (_, auth) {
      if (auth is Offline && _serverTabs.contains(widget.shell.currentIndex)) {
        widget.shell.goBranch(0);
      }
    });
    final items = [
      TabBarItem(id: 0, icon: Lucide.house, label: words.tabHome),
      if (!offline)
        TabBarItem(id: 1, icon: Lucide.libraryBig, label: words.tabMedia),
      TabBarItem(id: 2, icon: Lucide.download, label: words.downloadsTitle),
      if (!offline)
        TabBarItem(id: 3, icon: Lucide.compass, label: words.tabExplore),
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
            Expanded(child: widget.shell),
            TabBar(items: items, state: _selected, onSelected: _open),
          ],
        ),
      ),
    );
  }
}

/// The tabs' pages, each under its own header, for [HandsetShell]: the
/// shell route's container for its branches' navigators, in the tab bar's
/// order. A tab picked fades in over the last, its header with it, Back to
/// Home too.
class HandsetTabs extends StatelessWidget {
  const HandsetTabs({super.key, required this.shell, required this.children});

  final StatefulNavigationShell shell;

  /// The branches' navigators, by branch index.
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => TabFade(
    index: shell.currentIndex,
    background: MatineeTheme.of(context).background,
    children: [
      for (final (index, branch) in children.indexed)
        Column(
          children: [
            ShellTopBar(index: index),
            Expanded(
              child: MediaQuery.removePadding(
                context: context,
                // Media's header is inside the tab, which keeps the status
                // bar's inset to clear it, as [ShellTopBar] does.
                removeTop: !_serverTabs.contains(index),
                removeBottom: true,
                // Clear of a landscape phone's notch or Dynamic Island, as
                // the header and the tab bar are.
                child: SafeArea(top: false, bottom: false, child: branch),
              ),
            ),
          ],
        ),
    ],
  );
}
