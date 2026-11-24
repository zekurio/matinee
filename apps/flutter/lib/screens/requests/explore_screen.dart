import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../query/refresh.dart';
import '../../router.dart';
import '../shell/offline_note.dart';
import '../shell/shell.dart' show tabReselectProvider;
import 'discover.dart';
import 'requests_data.dart';

/// Fetch again on return after this long, as Home does.
const _refreshAfter = Duration(seconds: 30);

/// The Explore tab: Discover's rows, the recent requests first, and the
/// catalog's browse, each loading on its own. It is what an empty search used
/// to show.
class ExploreScreen extends ConsumerStatefulWidget {
  const ExploreScreen({super.key});

  @override
  ConsumerState<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends ConsumerState<ExploreScreen> {
  final _scroll = ScrollController();
  var _fetched = DateTime.now();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  /// Back on the tab, the catalog's rows and requests may have moved on.
  void _returned() {
    final now = DateTime.now();
    if (now.difference(_fetched) < _refreshAfter) return;
    _fetched = now;
    final rails = ref.read(discoverRailsProvider).value?.rails;
    ref.invalidate(discoverRailsProvider);
    for (final rail in rails ?? const <DiscoverRail>[]) {
      ref.invalidate(discoverRowProvider(RowKey(rail)));
    }
  }

  void _toTop() {
    if (!_scroll.hasClients) return;
    if (MediaQuery.disableAnimationsOf(context)) {
      _scroll.jumpTo(0);
    } else {
      unawaited(
        _scroll.animateTo(0, duration: KitMotion.move, curve: KitMotion.easing),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    ref.listen(tabReselectProvider, (_, tap) {
      if (tap?.path == Routes.explore) _toTop();
    });
    return ReturnWatcher(
      path: Routes.explore,
      onReturn: _returned,
      child: ColoredBox(
        color: MatineeTheme.of(context).background,
        child: MediaQuery.removePadding(
          context: context,
          removeTop: true,
          child: ref.watch(authStateProvider) is Offline
              ? Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 32,
                      vertical: 48,
                    ),
                    child: OfflineNote(message: l.discoverFailed),
                  ),
                )
              : Explore(controller: _scroll),
        ),
      ),
    );
  }
}
