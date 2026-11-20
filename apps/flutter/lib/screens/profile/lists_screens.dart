import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart' show mediaChangesProvider;
import '../../media/cards.dart';
import '../../media/layout.dart';
import '../../query/failure_view.dart';
import 'favorite_cards.dart';
import 'profile_data.dart';

/// The signed-in account's username, which the profile's lists are under.
String? _username(WidgetRef ref) => switch (ref.watch(authStateProvider)) {
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

/// What the person marked, a row for each kind, as the Kotlin app's
/// Favorites: shows, seasons, episodes, and movies, each newest first, and
/// only the kinds that have any.
class FavoritesScreen extends ConsumerWidget {
  const FavoritesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final username = _username(ref);
    if (username == null) {
      return _Page(title: l.favoritesTitle, child: const SizedBox());
    }
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
          title: l.favoritesLoadFailed,
          error: result.error!,
          onRetry: () => ref.invalidate(favoritesProvider(username)),
        ),
      );
    } else if (!result.hasValue) {
      body = LoadingState(label: l.loadingInProgress);
    } else if (lists == null || lists.isEmpty) {
      // The server sends null only for someone who doesn't share them,
      // never for one's own; it reads as none.
      body = _centered(
        EmptyState(
          icon: Lucide.heart,
          title: l.favoritesEmpty,
          message: l.favoritesEmptyHint,
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
/// newest first: the whole list behind the profile's row.
class RecentScreen extends ConsumerWidget {
  const RecentScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final username = _username(ref);
    if (username == null) {
      return _Page(title: l.profileRecent, child: const SizedBox());
    }
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
          title: l.profileRecentLoadFailed,
          error: result.error!,
          onRetry: () => ref.invalidate(recentProvider(username)),
        ),
      );
    } else if (!result.hasValue) {
      body = LoadingState(label: l.loadingInProgress);
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
