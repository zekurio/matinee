import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show ProviderBase;
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/device.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../query/failure_view.dart';
import '../../query/server_data.dart';
import '../../router.dart';
import '../profile/profile_data.dart';
import '../profile/stats.dart';
import 'statistics_sections.dart';

enum _View {
  activity(Permission.serverStatsRead),
  playback(Permission.serverStatsRead),
  library(Permission.statsRead),
  leaderboard(Permission.statsRead);

  const _View(this.permission);

  final String permission;

  String label(AppLocalizations l) => switch (this) {
    activity => l.webStatsViewActivity,
    playback => l.webStatsViewPlayback,
    library => l.webStatsViewLibrary,
    leaderboard => l.webStatsViewLeaderboard,
  };
}

const statisticsPermissions = [
  Permission.serverStatsRead,
  Permission.statsRead,
];

typedef _Range = ({String range, String? timeZone});

final _serverStatsProvider = serverQueryFamily(
  (api, _Range query) =>
      api.stats.server(range: query.range, timeZone: query.timeZone),
);
final _libraryStatsProvider = serverQueryFamily(
  (api, _Range query) =>
      api.stats.library(range: query.range, timeZone: query.timeZone),
);
final _liveProvider = serverStream((api) => api.stats.live());

class StatisticsScreen extends ConsumerStatefulWidget {
  const StatisticsScreen({super.key});

  @override
  ConsumerState<StatisticsScreen> createState() => _StatisticsScreenState();
}

class _StatisticsScreenState extends ConsumerState<StatisticsScreen> {
  String _range = StatsRange.value30d;
  _View? _picked;

  void _pickRange(String range) => setState(() => _range = range);

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final auth = ref.watch(authStateProvider);
    final views = [
      if (auth case SignedIn(:final user))
        for (final view in _View.values)
          if (can(user, view.permission)) view,
    ];
    final view = views.contains(_picked)
        ? _picked
        : views.contains(_View.activity)
        ? _View.activity
        : views.lastOrNull;
    return PageFrame(
      title: l.webStatsTitle,
      backLabel: l.commonBack,
      onBack: () => context.canPop() ? context.pop() : context.go(Routes.home),
      child: view == null
          ? Center(
              child: EmptyState(
                icon: auth is Offline ? Lucide.cloudOff : Lucide.lock,
                title: auth is Offline
                    ? l.serverUnreachable
                    : l.adminAccessNotAllowed,
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 8,
              children: [
                if (views.length > 1)
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(
                      horizontal: CardMetrics.gutter,
                    ),
                    child: Row(
                      spacing: 6,
                      children: [
                        for (final option in views)
                          ChoiceChip(
                            label: option.label(l),
                            selected: option == view,
                            onPressed: () => setState(() => _picked = option),
                          ),
                      ],
                    ),
                  ),
                RangeChips(current: _range, onPick: _pickRange),
                Expanded(child: _body(context, view)),
              ],
            ),
    );
  }

  Widget _body(BuildContext context, _View view) {
    final l = AppLocalizations.of(context);
    final zone = ref.watch(deviceProvider).timeZone;
    final query = (range: _range, timeZone: zone.isEmpty ? null : zone);
    final showAll = _range == StatsRange.allValue
        ? null
        : () => _pickRange(StatsRange.allValue);
    final sections = switch (view) {
      _View.activity || _View.playback => [
        if (view == _View.activity)
          ..._read(
            context,
            _liveProvider,
            (activity) => [WatchingNow(data: activity)],
          ),
        ..._read(context, _serverStatsProvider(query), (stats) {
          if (stats.totals.plays == 0) {
            return [
              EmptyState(
                icon: Lucide.activity,
                title: showAll == null
                    ? l.webStatsServerEmpty
                    : l.webStatsServerNoPlays(rangePhrase(_range, l)),
                action: showAll == null ? null : _showAll(l, showAll),
              ),
            ];
          }
          return view == _View.activity
              ? activitySections(context, stats)
              : playbackSections(context, stats);
        }),
      ],
      _View.library => _read(context, _libraryStatsProvider(query), (stats) {
        if (stats.totals.files > 0) return librarySections(context, stats);
        final canAdd = ref.watch(canProvider(Permission.libraryCreate));
        return [
          EmptyState(
            icon: Lucide.folderPlus,
            title: l.webStatsLibraryEmpty,
            message: canAdd
                ? l.webStatsLibraryEmptyAdmin
                : l.webStatsLibraryEmptyUser,
            action: canAdd
                ? MatineeButton(
                    onPressed: () => context.push(Routes.libraryEditor()),
                    child: Text(l.webStatsLibraryAdd),
                  )
                : null,
          ),
        ];
      }),
      _View.leaderboard => _read(context, leaderboardProvider(query), (data) {
        if (data.boards.any((board) => board.entries.isNotEmpty)) {
          return leaderboardSections(context, data);
        }
        return [
          EmptyState(
            icon: Lucide.activity,
            title: showAll == null
                ? l.webStatsLeaderboardEmpty
                : l.webStatsLeaderboardNoPlays(rangePhrase(_range, l)),
            message: showAll == null ? l.webStatsLeaderboardEmptyHint : null,
            action: showAll == null ? null : _showAll(l, showAll),
          ),
        ];
      }),
    };
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 840),
        child: ListView.separated(
          key: ValueKey(view),
          padding: EdgeInsets.fromLTRB(
            CardMetrics.gutter,
            8,
            CardMetrics.gutter,
            24 + MediaQuery.paddingOf(context).bottom,
          ),
          itemCount: sections.length,
          separatorBuilder: (context, index) => const SizedBox(height: 16),
          itemBuilder: (context, index) => sections[index],
        ),
      ),
    );
  }

  List<Widget> _read<T>(
    BuildContext context,
    ProviderBase<AsyncValue<T>> provider,
    List<Widget> Function(T) loaded,
  ) {
    final l = AppLocalizations.of(context);
    return ref
        .watch(provider)
        .when(
          data: loaded,
          error: (error, _) => [
            FailureState(
              title: l.statisticsLoadFailed,
              error: error,
              onRetry: () => ref.invalidate(provider),
            ),
          ],
          loading: () => [
            SizedBox(
              height: 104,
              child: LoadingState(label: l.loadingInProgress),
            ),
          ],
        );
  }

  Widget _showAll(AppLocalizations l, VoidCallback onPressed) => MatineeButton(
    look: ButtonLook.outline,
    onPressed: onPressed,
    child: Text(l.webStatsShowAllTime),
  );
}
