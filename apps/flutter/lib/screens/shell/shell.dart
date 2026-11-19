import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../core/width_class.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import 'rail.dart';

/// The signed-in touch screens' frame: the tabs, Home, Media, and
/// Downloads, each keeping its own stack. Phones and tablets in portrait
/// get the bar along the bottom, as Findroid has it; from 840 dp wide, a
/// tablet in landscape, the tabs move to a rail on the left so the page
/// keeps its height. Which tabs there are follows the Kotlin app's
/// ui/ShellLayout.kt.
class HandsetShell extends StatefulWidget {
  const HandsetShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  State<HandsetShell> createState() => _HandsetShellState();
}

class _HandsetShellState extends State<HandsetShell> {
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
    // A tap on the open tab goes back to its first page.
    widget.shell.goBranch(
      branch,
      initialLocation: branch == widget.shell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context) {
    final words = AppLocalizations.of(context);
    final items = [
      TabBarItem(id: 0, icon: Lucide.house, label: words.tabHome),
      TabBarItem(id: 1, icon: Lucide.libraryBig, label: words.tabMedia),
      TabBarItem(id: 2, icon: Lucide.download, label: words.downloadsTitle),
    ];
    final colors = MatineeTheme.of(context);
    final width = MediaQuery.sizeOf(context).width;
    if (WidthClass.of(width) == WidthClass.expanded) {
      return ColoredBox(
        color: colors.background,
        child: Row(
          children: [
            ShellRail(items: items, state: _selected, onSelected: _open),
            Expanded(
              child: MediaQuery.removePadding(
                context: context,
                removeLeft: true,
                child: widget.shell,
              ),
            ),
          ],
        ),
      );
    }
    return ColoredBox(
      color: colors.background,
      child: Column(
        children: [
          Expanded(
            child: MediaQuery.removePadding(
              context: context,
              removeBottom: true,
              child: widget.shell,
            ),
          ),
          TabBar(items: items, state: _selected, onSelected: _open),
        ],
      ),
    );
  }
}
