import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../core/device.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/avatar.dart';
import '../../media/cards.dart';
import '../../media/layout.dart';
import '../../query/failure_view.dart';
import 'favorite_cards.dart';
import 'profile_data.dart';
import 'stats.dart';

/// The parts a profile page is built of, so the signed-in account's page and
/// another person's show the same header, favorites, statistics, and recent
/// plays.

/// The page's sections in one column: the screen's width on a phone, and
/// on a tablet [maxWidth] in the middle, so the rails and the stats cards
/// all end where the column does and the cards' rows stay readable.
class ProfileColumn extends StatelessWidget {
  const ProfileColumn({super.key, required this.sections});

  static const maxWidth = 720.0;

  final List<Widget> sections;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final side = math.max(0.0, (constraints.maxWidth - maxWidth) / 2);
      return ListView.separated(
        padding: EdgeInsets.fromLTRB(
          side,
          8,
          side,
          MediaQuery.paddingOf(context).bottom + 24,
        ),
        itemCount: sections.length,
        separatorBuilder: (context, index) => const SizedBox(height: 32),
        itemBuilder: (context, index) => sections[index],
      );
    },
  );
}

/// The picture and name, the username under a display name, Admin, and
/// since when they're here.
class ProfileHeader extends StatelessWidget {
  const ProfileHeader({
    super.key,
    required this.name,
    required this.username,
    this.avatarUrl,
    this.isAdmin = false,
    this.joined,
  });

  /// Their display name, or the username when they have none.
  final String name;
  final String username;
  final String? avatarUrl;
  final bool isAdmin;

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
      if (name != username) '@$username',
      if (month != null) l.profileJoined(month),
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      child: Row(
        spacing: 16,
        children: [
          Avatar(url: avatarUrl, name: name, size: 64),
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
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: KitText.xl.style(
                            color: colors.foreground,
                            weight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                    if (isAdmin) _Badge(label: l.profileAdmin),
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
/// shows them; its heading opens the whole lists. With none yet, the
/// [emptyTitle] and [emptyHint] say how to make one, and without them the
/// section stays away, as another person's empty favorites do.
class ProfileFavoritesRail extends StatelessWidget {
  const ProfileFavoritesRail({
    super.key,
    required this.favorites,
    required this.onSeeAll,
    this.emptyTitle,
    this.emptyHint,
  });

  final List<Favorite> favorites;
  final VoidCallback onSeeAll;
  final String? emptyTitle;
  final String? emptyHint;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final emptyTitle = this.emptyTitle;
    if (favorites.isEmpty) {
      if (emptyTitle == null) return const SizedBox.shrink();
      final emptyHint = this.emptyHint;
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 16,
          children: [
            SectionTitle(title: l.favoritesTitle),
            ProfileNote(title: emptyTitle, message: emptyHint ?? ''),
          ],
        ),
      );
    }
    final size = railCardSize(context, RailArt.poster);
    // Favorites of every kind share the row, so a title says which it is.
    return NamedKinds(
      child: Rail(
        title: l.favoritesTitle,
        onSeeAll: onSeeAll,
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
class ProfileRecentRail extends StatelessWidget {
  const ProfileRecentRail({
    super.key,
    required this.entries,
    required this.onSeeAll,
  });

  final List<WatchedEntry> entries;
  final VoidCallback onSeeAll;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final size = railCardSize(context, RailArt.wide);
    return Rail(
      title: l.profileRecent,
      onSeeAll: onSeeAll,
      seeAllLabel: l.commonSeeAll,
      itemWidth: size.width,
      itemHeight: size.height,
      itemCount: entries.length,
      itemBuilder: (context, index) => EpisodeCard(item: entries[index].item),
    );
  }
}

/// What someone watched, in the range picked, with the chart and the
/// counts: on one's own profile the person's place on the boards too, and
/// on another's the words for what they chose not to share.
class ProfileStatistics extends ConsumerStatefulWidget {
  const ProfileStatistics({
    super.key,
    required this.username,
    required this.name,
    this.self = false,
  });

  final String username;

  /// Their display name, for the words about what they share.
  final String name;

  /// Whether it's the signed-in account's own statistics, which also show
  /// where the person stands.
  final bool self;

  @override
  ConsumerState<ProfileStatistics> createState() => _ProfileStatisticsState();
}

class _ProfileStatisticsState extends ConsumerState<ProfileStatistics> {
  String _range = StatsRange.allValue;

  /// The last range's figures, kept while the next range loads so the page
  /// doesn't jump.
  WatchStats? _lastStats;

  StatsQuery _query() {
    final zone = ref.read(deviceProvider).timeZone;
    return (
      username: widget.username,
      range: _range,
      timeZone: zone.isEmpty ? null : zone,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final query = _query();
    final result = ref.watch(statsProvider(query));
    if (result.value case final stats?) _lastStats = stats;
    final stats = result.value ?? (result.isLoading ? _lastStats : null);
    // A profile that says it shares statistics whose figures come back null
    // stopped sharing them.
    final notShared = result.hasValue && result.value == null;
    final neverWatched =
        stats != null &&
        _range == StatsRange.allValue &&
        stats.totals.plays == 0;
    Widget body;
    if (notShared) {
      body = _Gutters(
        child: EmptyState(
          icon: Lucide.lock,
          title: l.profileStoppedSharing(widget.name),
        ),
      );
    } else if (stats == null) {
      body = result.hasError && !result.isLoading
          ? Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: FailureState(
                title: widget.self
                    ? l.profileStatsFailed
                    : l.profileOtherStatsFailed,
                error: result.error!,
                onRetry: () => ref.invalidate(statsProvider(query)),
              ),
            )
          : SizedBox(
              height: 96,
              child: LoadingState(label: l.loadingInProgress),
            );
    } else if (neverWatched) {
      body = _Gutters(
        child: widget.self
            ? ProfileNote(
                title: l.profileSelfEmpty,
                message: l.profileSelfEmptyHint,
              )
            : ProfileNote(
                title: l.profileOtherEmpty(widget.name),
                message: l.profileOtherEmptyHint,
              ),
      );
    } else if (stats.totals.plays == 0) {
      body = _Gutters(
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
      body = _Gutters(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            WatchTimeCard(
              range: stats.range,
              unit: stats.unit,
              watchSeconds: stats.totals.watchSeconds,
              buckets: stats.buckets,
            ),
            const SizedBox(height: 28),
            StatList(totals: stats.totals),
            if (stats.titles.isNotEmpty) ...[
              const SizedBox(height: 28),
              TopTitles(titles: stats.titles),
            ],
            if (stats.genres.isNotEmpty) ...[
              const SizedBox(height: 28),
              Genres(genres: stats.genres),
            ],
            // The board is the viewer's, so only on their own profile.
            if (widget.self) Standing(range: _range, timeZone: query.timeZone),
            if (stats.activity.isNotEmpty) ...[
              const SizedBox(height: 28),
              Activity(activity: stats.activity),
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

/// Inside the gutters, as the rails' headings are.
class _Gutters extends StatelessWidget {
  const _Gutters({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
    child: child,
  );
}

/// A line and a muted line under it, for what isn't there yet.
class ProfileNote extends StatelessWidget {
  const ProfileNote({super.key, required this.title, required this.message});

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
        if (message.isNotEmpty)
          Text(message, style: KitText.sm.style(color: colors.mutedForeground)),
      ],
    );
  }
}
