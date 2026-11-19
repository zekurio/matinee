import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import 'header.dart';

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
    // A tap on the open tab goes back to its first page.
    widget.shell.goBranch(
      branch,
      initialLocation: branch == widget.shell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context) {
    final words = AppLocalizations.of(context);
    final user = switch (ref.watch(authStateProvider)) {
      SignedIn(:final user) || Offline(:final user) => user,
      _ => null,
    };
    final avatar = user?.avatarId;
    final items = [
      TabBarItem(id: 0, icon: Lucide.house, label: words.tabHome),
      TabBarItem(id: 1, icon: Lucide.tv, label: words.tabShows),
      TabBarItem(id: 2, icon: Lucide.film, label: words.tabMovies),
      TabBarItem(id: 3, icon: Lucide.download, label: words.downloadsTitle),
      TabBarItem(
        id: 4,
        icon: Lucide.userRound,
        label: words.tabProfile,
        picture: avatar == null ? null : _AccountPicture(avatar),
      ),
    ];
    return ColoredBox(
      color: MatineeTheme.of(context).background,
      child: Column(
        children: [
          const ShellHeader(),
          Expanded(
            child: MediaQuery.removePadding(
              context: context,
              removeTop: true,
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

/// The account's picture in the profile's tab, or its icon when the
/// picture can't load, as offline.
class _AccountPicture extends ConsumerWidget {
  const _AccountPicture(this.avatarId);

  final String avatarId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(apiProvider);
    final fallback = KitIcon(
      Lucide.userRound,
      size: 22,
      color: MatineeTheme.of(context).mutedForeground,
    );
    if (api == null) return fallback;
    return ClipOval(
      child: Image.network(
        api.paths.avatar(avatarId).toString(),
        headers: ref.watch(playerHeadersProvider),
        fit: BoxFit.cover,
        errorBuilder: (context, error, stack) => fallback,
      ),
    );
  }
}
