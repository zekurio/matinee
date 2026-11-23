import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart' show mediaChangesProvider;
import '../../media/cards.dart';
import '../../media/layout.dart';
import '../../query/failure_view.dart';
import 'favorite_cards.dart';
import 'profile_data.dart';

/// The signed-in account's username, which one's own lists are under.
String? _signedInUsername(WidgetRef ref) =>
    switch (ref.watch(authStateProvider)) {
      SignedIn(:final user) || Offline(:final user) => user.username,
      _ => null,
    };

/// A page over the tabs with Back and [title].
class _Page extends StatelessWidget {
  const _Page({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => PageFrame(
    title: title,
    backLabel: AppLocalizations.of(context).commonBack,
    onBack: () => context.pop(),
    child: child,
  );
}

/// A failure or an empty list, in the page's middle.
Widget _centered(Widget child) => Center(
  child: SingleChildScrollView(
    padding: const EdgeInsets.symmetric(vertical: 48),
    child: child,
  ),
);

/// Whether the page may read another person's lists, as the screen that
/// opens them asks for `profile.read`; a device with no server can't.
Widget? _notAllowed(BuildContext context, WidgetRef ref, String title) {
  if (ref.watch(canProvider(Permission.profileRead))) return null;
  final l = AppLocalizations.of(context);
  final offline = ref.watch(authStateProvider) is Offline;
  return _Page(
    title: title,
    child: _centered(
      EmptyState(
        icon: offline ? Lucide.cloudOff : Lucide.lock,
        title: offline ? l.serverUnreachable : l.adminAccessNotAllowed,
      ),
    ),
  );
}

/// What the person marked, a row for each kind: shows, seasons, episodes, and
/// movies, each newest first, and only the kinds that have any. [username] is
/// another person's, from their profile; null is the signed-in account's.
class FavoritesScreen extends ConsumerWidget {
  const FavoritesScreen({super.key, this.username});

  final String? username;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final own = this.username == null;
    final username = this.username ?? _signedInUsername(ref);
    if (username == null) {
      return _Page(title: l.favoritesTitle, child: const SizedBox());
    }
    if (!own) {
      final notAllowed = _notAllowed(context, ref, l.favoritesTitle);
      if (notAllowed != null) return notAllowed;
    }
    // The words for what isn't shared name the person, so another profile's
    // display name comes from the same read their page made.
    final name = own
        ? username
        : ref.watch(profileProvider(username)).value?.user.name ?? username;
    ref.listen(
      mediaChangesProvider,
      (_, _) => ref.invalidate(favoritesProvider(username)),
    );
    final result = ref.watch(favoritesProvider(username));
    final lists = result.value;
    Widget body;
    if (result.hasError && !result.isLoading) {
      body = _centered(
        FailureState(
          title: own
              ? l.favoritesLoadFailed
              : l.profileOtherFavoritesLoadFailed,
          error: result.error!,
          onRetry: () => ref.invalidate(favoritesProvider(username)),
        ),
      );
    } else if (!result.hasValue) {
      body = LoadingState(label: l.loadingInProgress);
    } else if (lists == null) {
      // The server sends null only for someone who doesn't share them; one's
      // own lists come as empty instead.
      body = _centered(
        own
            ? EmptyState(
                icon: Lucide.heart,
                title: l.favoritesEmpty,
                message: l.favoritesEmptyHint,
              )
            : EmptyState(
                icon: Lucide.lock,
                title: l.profileFavoritesHidden(name),
              ),
      );
    } else if (lists.isEmpty) {
      body = _centered(
        own
            ? EmptyState(
                icon: Lucide.heart,
                title: l.favoritesEmpty,
                message: l.favoritesEmptyHint,
              )
            : EmptyState(
                icon: Lucide.heart,
                title: l.profileFavoritesOtherEmpty(name),
              ),
      );
    } else {
      final poster = railCardSize(context, RailArt.poster);
      final wide = railCardSize(context, RailArt.wide);
      Rail rail(
        String title,
        int count,
        IndexedWidgetBuilder card,
        ({double width, double height}) size,
      ) => Rail(
        title: title,
        itemWidth: size.width,
        itemHeight: size.height,
        itemCount: count,
        itemBuilder: card,
      );
      final rails = [
        if (lists.shows.isNotEmpty)
          rail(l.favoritesShows, lists.shows.length, (context, i) {
            final title = lists.shows[i];
            return TitleCard(title: title, detail: title.year?.toString());
          }, poster),
        if (lists.seasons.isNotEmpty)
          rail(l.favoritesSeasons, lists.seasons.length, (context, i) {
            final entry = lists.seasons[i];
            return SeasonPosterCard(title: entry.title, season: entry.season);
          }, poster),
        if (lists.episodes.isNotEmpty)
          rail(
            l.favoritesEpisodes,
            lists.episodes.length,
            (context, i) => EpisodeCard(item: lists.episodes[i]),
            wide,
          ),
        if (lists.movies.isNotEmpty)
          rail(l.favoritesMovies, lists.movies.length, (context, i) {
            final title = lists.movies[i];
            return TitleCard(title: title, detail: title.year?.toString());
          }, poster),
      ];
      body = ListView.separated(
        padding: EdgeInsets.only(
          top: 8,
          bottom: MediaQuery.paddingOf(context).bottom + 32,
        ),
        itemCount: rails.length,
        separatorBuilder: (context, index) => const SizedBox(height: 32),
        itemBuilder: (context, index) => rails[index],
      );
    }
    return _Page(title: l.favoritesTitle, child: body);
  }
}

/// Everything the person watched last, the latest file of each title,
/// newest first: the whole list behind the profile's row. [username] is
/// another person's, from their profile; null is the signed-in account's.
class RecentScreen extends ConsumerWidget {
  const RecentScreen({super.key, this.username});

  final String? username;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final own = this.username == null;
    final username = this.username ?? _signedInUsername(ref);
    if (username == null) {
      return _Page(title: l.profileRecent, child: const SizedBox());
    }
    if (!own) {
      final notAllowed = _notAllowed(context, ref, l.profileRecent);
      if (notAllowed != null) return notAllowed;
    }
    final name = own
        ? username
        : ref.watch(profileProvider(username)).value?.user.name ?? username;
    ref.listen(
      mediaChangesProvider,
      (_, _) => ref.invalidate(recentProvider(username)),
    );
    final result = ref.watch(recentProvider(username));
    final entries = result.value ?? const <WatchedEntry>[];
    Widget body;
    if (result.hasError && !result.isLoading) {
      body = _centered(
        FailureState(
          title: own
              ? l.profileRecentLoadFailed
              : l.profileOtherRecentLoadFailed,
          error: result.error!,
          onRetry: () => ref.invalidate(recentProvider(username)),
        ),
      );
    } else if (!result.hasValue) {
      body = LoadingState(label: l.loadingInProgress);
    } else if (result.value == null && !own) {
      // Their profile shares statistics, but this read says they stopped.
      body = _centered(
        EmptyState(icon: Lucide.lock, title: l.profileStoppedSharing(name)),
      );
    } else if (entries.isEmpty) {
      body = _centered(
        EmptyState(icon: Lucide.clock, title: l.profileRecentEmpty),
      );
    } else {
      body = CustomScrollView(
        slivers: [
          const SliverToBoxAdapter(child: SizedBox(height: 8)),
          CardGrid(
            columns: wideColumns,
            aspectRatio: CardMetrics.wide,
            itemCount: entries.length,
            itemBuilder: (context, index) =>
                EpisodeCard(item: entries[index].item),
          ),
          SliverToBoxAdapter(
            child: SizedBox(height: MediaQuery.paddingOf(context).bottom + 32),
          ),
        ],
      );
    }
    return _Page(title: l.profileRecent, child: body);
  }
}
