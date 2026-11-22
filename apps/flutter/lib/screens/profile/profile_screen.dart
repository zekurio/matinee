import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/device.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart' show mediaChangesProvider;
import '../../media/avatar.dart';
import '../../media/cards.dart';
import '../../media/layout.dart';
import '../../query/failure_view.dart';
import '../../query/refresh.dart';
import '../../router.dart';
import '../requests/asked_rail.dart';
import '../requests/discover.dart' show QueueList;
import '../requests/request_words.dart' show formatCount;
import '../requests/requests_data.dart' show profileAskedProvider;
import '../requests/requests_hub.dart' show requestsProvider;
import '../settings/settings_rows.dart';
import '../shell/offline_note.dart';
import '../sign_in/server_switcher.dart';
import 'favorite_cards.dart';
import 'profile_data.dart';
import 'stats.dart';

/// The profile tab: who's signed in, their favorites, their statistics, and
/// what they watched last, then the account: switching server or account, and
/// signing out, here with the account they act on. Offline it's the person and
/// the account rows, since the rest is the server's.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  String _range = StatsRange.allValue;

  /// The last range's figures, kept while the next range loads so the page
  /// doesn't jump.
  WatchStats? _lastStats;

  StatsQuery _statsQuery(String username) {
    final zone = ref.read(deviceProvider).timeZone;
    return (
      username: username,
      range: _range,
      timeZone: zone.isEmpty ? null : zone,
    );
  }

  /// Back on the tab, favorites, requests, and what was watched may have
  /// moved on.
  void _returned(String username) {
    ref
      ..invalidate(profileProvider(username))
      ..invalidate(profileAskedProvider)
      ..invalidate(statsProvider(_statsQuery(username)));
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final auth = ref.watch(authStateProvider);
    final user = switch (auth) {
      SignedIn(:final user) || Offline(:final user) => user,
      _ => null,
    };
    if (user == null) return ColoredBox(color: colors.background);
    ref.listen(mediaChangesProvider, (_, _) => _returned(user.username));
    final offline = auth is Offline;
    final sections = offline
        ? [
            _Header(user: user),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: OfflineNote(
                message: AppLocalizations.of(context).profileOffline,
              ),
            ),
            const _Account(),
          ]
        : _online(context, user);
    return ReturnWatcher(
      path: Routes.profile,
      onReturn: () => _returned(user.username),
      child: ColoredBox(
        color: colors.background,
        child: ListView.separated(
          padding: EdgeInsets.only(
            top: 8,
            bottom: MediaQuery.paddingOf(context).bottom + 24,
          ),
          itemCount: sections.length,
          separatorBuilder: (context, index) => const SizedBox(height: 32),
          itemBuilder: (context, index) => sections[index],
        ),
      ),
    );
  }

  List<Widget> _online(BuildContext context, User user) {
    final l = AppLocalizations.of(context);
    final profile = ref.watch(profileProvider(user.username));
    final loaded = profile.value;
    final header = _Header(user: user, joined: loaded?.user.createdAt);
    if (loaded == null) {
      return [
        header,
        if (runsQueue(user)) const _Requests(),
        if (profile.hasError && !profile.isLoading)
          FailureState(
            title: l.profileLoadFailed,
            error: profile.error!,
            onRetry: () => ref.invalidate(profileProvider(user.username)),
          )
        else
          SizedBox(
            height: 120,
            child: LoadingState(label: l.loadingInProgress),
          ),
        const _Account(),
      ];
    }
    final recent = loaded.recent ?? const <WatchedEntry>[];
    // What they asked for is theirs alone, and this is only their own
    // profile. A row that's loading, empty, or failed is left out.
    final asked = ref.watch(profileAskedProvider).value?.items ?? const [];
    return [
      header,
      if (runsQueue(user)) const _Requests(),
      _Favorites(favorites: loaded.favorites ?? const []),
      if (asked.isNotEmpty) AskedRail(items: asked, fresh: false),
      _statistics(context, user),
      if (recent.isNotEmpty) _RecentRail(entries: recent),
      const _Account(),
    ];
  }

  Widget _statistics(BuildContext context, User user) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final query = _statsQuery(user.username);
    final result = ref.watch(statsProvider(query));
    if (result.value case final stats?) _lastStats = stats;
    final stats = result.value ?? (result.isLoading ? _lastStats : null);
    final neverWatched =
        stats != null &&
        _range == StatsRange.allValue &&
        stats.totals.plays == 0;
    Widget body;
    if (stats == null) {
      body = result.hasError && !result.isLoading
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: FailureState(
                title: l.profileStatsFailed,
                error: result.error!,
                onRetry: () => ref.invalidate(statsProvider(query)),
              ),
            )
          : SizedBox(
              height: 96,
              child: LoadingState(label: l.loadingInProgress),
            );
    } else if (neverWatched) {
      body = _Narrow(
        child: _Note(
          title: l.profileSelfEmpty,
          message: l.profileSelfEmptyHint,
        ),
      );
    } else if (stats.totals.plays == 0) {
      body = _Narrow(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 12,
          children: [
            Text(
              l.profileNothingWatched(rangePhrase(_range, l)),
              style: KitText.base.style(color: colors.foreground),
            ),
            MatineeButton(
              look: ButtonLook.outline,
              onPressed: () => setState(() => _range = StatsRange.allValue),
              child: Text(l.profileShowAllTime),
            ),
          ],
        ),
      );
    } else {
      body = _Narrow(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            WatchTimeCard(stats: stats),
            const SizedBox(height: 28),
            StatList(stats: stats),
            if (stats.titles.isNotEmpty) ...[
              const SizedBox(height: 28),
              TopTitles(stats: stats),
            ],
            if (stats.genres.isNotEmpty) ...[
              const SizedBox(height: 28),
              Genres(stats: stats),
            ],
            Standing(range: _range, timeZone: query.timeZone),
            if (stats.activity.isNotEmpty) ...[
              const SizedBox(height: 28),
              Activity(stats: stats),
            ],
          ],
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 16,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
          child: SectionTitle(title: l.profileStatistics),
        ),
        // With nothing ever watched, picking a range changes nothing.
        if (!neverWatched)
          RangeChips(
            current: _range,
            onPick: (range) => setState(() => _range = range),
          ),
        body,
      ],
    );
  }
}

/// Inside the gutters, and no wider than a phone's column on a tablet, so
/// the cards' rows stay readable.
class _Narrow extends StatelessWidget {
  const _Narrow({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
    child: Align(
      alignment: AlignmentDirectional.topStart,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 720),
        child: child,
      ),
    ),
  );
}

/// A line and a muted line under it, for what isn't there yet.
class _Note extends StatelessWidget {
  const _Note({required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: 4,
      children: [
        Text(title, style: KitText.base.style(color: colors.foreground)),
        Text(message, style: KitText.sm.style(color: colors.mutedForeground)),
      ],
    );
  }
}

/// The picture and name, the username under a display name, Admin, and
/// since when they're here.
class _Header extends StatelessWidget {
  const _Header({required this.user, this.joined});

  final User user;

  /// When the account was made, once the profile says.
  final String? joined;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final joined = this.joined;
    final month = joined == null ? null : joinedMonth(joined, locale);
    final facts = [
      if (user.displayName?.trim().isNotEmpty ?? false) '@${user.username}',
      if (month != null) l.profileJoined(month),
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      child: Row(
        spacing: 16,
        children: [
          Avatar(avatarId: user.avatarId, name: user.name, size: 64),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  spacing: 8,
                  children: [
                    Flexible(
                      child: Semantics(
                        header: true,
                        child: Text(
                          user.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: KitText.xl.style(
                            color: colors.foreground,
                            weight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                    if (user.isAdmin) _Badge(label: l.profileAdmin),
                  ],
                ),
                if (facts.isNotEmpty)
                  Text(
                    facts,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: KitText.sm.style(color: colors.mutedForeground),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// An outlined word beside the name.
class _Badge extends StatelessWidget {
  const _Badge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: KitRadius.pill,
        border: Border.all(color: colors.borderStrong),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        child: Text(
          label,
          style: KitText.xs.style(
            color: colors.foreground,
            weight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

/// Favorites of every kind in one row of posters, newest first, as the web
/// shows them; its heading opens the whole lists. With none yet, how to
/// make one.
class _Favorites extends StatelessWidget {
  const _Favorites({required this.favorites});

  final List<Favorite> favorites;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    if (favorites.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 16,
          children: [
            SectionTitle(title: l.favoritesTitle),
            _Note(title: l.favoritesEmpty, message: l.favoritesEmptyHint),
          ],
        ),
      );
    }
    final size = railCardSize(context, RailArt.poster);
    // Favorites of every kind share the row, so a title says which it is.
    return NamedKinds(
      child: Rail(
        title: l.favoritesTitle,
        onSeeAll: () => context.push(Routes.favorites),
        seeAllLabel: l.commonSeeAll,
        itemWidth: size.width,
        itemHeight: size.height,
        itemCount: favorites.length,
        itemBuilder: (context, index) => FavoriteCard(
          key: ValueKey(favoriteKey(favorites[index])),
          favorite: favorites[index],
        ),
      ),
    );
  }
}

/// What they watched last, its heading opening the whole list.
class _RecentRail extends StatelessWidget {
  const _RecentRail({required this.entries});

  final List<WatchedEntry> entries;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final size = railCardSize(context, RailArt.wide);
    return Rail(
      title: l.profileRecent,
      onSeeAll: () => context.push(Routes.recent),
      seeAllLabel: l.commonSeeAll,
      itemWidth: size.width,
      itemHeight: size.height,
      itemCount: entries.length,
      itemBuilder: (context, index) => EpisodeCard(item: entries[index].item),
    );
  }
}

/// An admin's way to the requests, with how many need them.
class _Requests extends ConsumerWidget {
  const _Requests();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final needsYou = ref.watch(
      requestsProvider.select((state) => state.needsYou),
    );
    return _Narrow(
      child: Panel(
        rows: [
          LinkRow(
            icon: Lucide.inbox,
            title: l.webRequestsTitle,
            value: needsYou > 0 ? formatCount(needsYou, l) : null,
            onPressed: () => context.push(Routes.requests(QueueList.waiting)),
          ),
        ],
      ),
    );
  }
}

/// The server this account is on, with the way to another server or
/// account through the server list, and signing out, in red, as it ends
/// the session.
class _Account extends ConsumerWidget {
  const _Account();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final server = activeServer(ref.watch(savedServersProvider));
    return _Narrow(
      child: SettingsSection(
        title: l.settingsPageAccount,
        child: Panel(
          rows: [
            LinkRow(
              icon: Lucide.server,
              title: l.profileSwitch,
              description: server == null ? null : serverTitle(server),
              onPressed: () => showServerSwitcher(context),
            ),
            LinkRow(
              icon: Lucide.logOut,
              title: l.shellSignOut,
              destructive: true,
              onPressed: () => ref.read(sessionProvider.notifier).signOut(),
            ),
          ],
        ),
      ),
    );
  }
}
