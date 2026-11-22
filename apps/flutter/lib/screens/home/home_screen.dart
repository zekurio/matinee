import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart';
import '../../media/cards.dart';
import '../../media/layout.dart';
import '../../query/failure_view.dart';
import '../../query/refresh.dart';
import '../../router.dart';
import '../requests/asked_rail.dart';
import 'featured_carousel.dart';
import 'home_banner.dart';
import 'home_data.dart';
import 'home_layout.dart';
import 'offline_home.dart';

/// The Home tab, as the Kotlin app's: the featured titles on top, as cards
/// on a phone and the web's banner on a tablet, then Continue watching,
/// Next up, the recommendation rows, what the viewer asked for, and each
/// library's newest titles. A row that's loading or has nothing is left
/// out, and so is one that failed; Home is an error only when nothing on
/// it could show. [links] are debug tools that have no screen yet.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key, this.links = const []});

  final List<(String, String)> links;

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

/// Fetch again on return after this long, when nothing asked sooner.
const _refreshAfter = Duration(seconds: 30);

/// The recommendations change only when the server works them out again.
const _recommendationsAfter = Duration(minutes: 10);

class _HomeScreenState extends ConsumerState<HomeScreen> {
  var _fetched = DateTime.now();
  var _recommended = DateTime.now();

  /// Back on Home, what's in progress may have moved on, here or on another
  /// device. Featured stays, since it's picked at random, unless it failed.
  void _returned() {
    final now = DateTime.now();
    if (now.difference(_fetched) >= _refreshAfter) {
      _fetched = now;
      ref
        ..invalidate(librariesProvider)
        ..invalidate(continueWatchingProvider)
        ..invalidate(nextUpProvider)
        ..invalidate(shelfProvider)
        ..invalidate(askedProvider);
    }
    if (now.difference(_recommended) >= _recommendationsAfter ||
        ref.read(recommendationsProvider).hasError) {
      _recommended = now;
      ref.invalidate(recommendationsProvider);
    }
    if (ref.read(featuredProvider).hasError) ref.invalidate(featuredProvider);
  }

  void _retryAll() {
    _fetched = _recommended = DateTime.now();
    ref
      ..invalidate(librariesProvider)
      ..invalidate(continueWatchingProvider)
      ..invalidate(nextUpProvider)
      ..invalidate(featuredProvider)
      ..invalidate(recommendationsProvider)
      ..invalidate(shelfProvider)
      ..invalidate(askedProvider);
  }

  /// Something was marked, liked, or hidden from a menu here or on another
  /// page: what Home shows of it comes again.
  void _changed() {
    _fetched = DateTime.now();
    ref
      ..invalidate(continueWatchingProvider)
      ..invalidate(nextUpProvider)
      ..invalidate(recommendationsProvider)
      ..invalidate(shelfProvider);
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    ref.listen(mediaChangesProvider, (_, _) => _changed());
    if (ref.watch(authStateProvider) is Offline) {
      return ColoredBox(color: colors.background, child: const OfflineHome());
    }
    // What offline Home starts its rows from.
    final snapshot = ref.read(homeSnapshotProvider.notifier);
    ref
      ..listen(continueWatchingProvider, (_, next) {
        if (next.value case final items?) {
          snapshot.saveResume([for (final item in items) item.id]);
        }
      })
      ..listen(nextUpProvider, (_, next) {
        if (next.value case final items?) {
          snapshot.saveNextUp([for (final item in items) item.id]);
        }
      });
    final l = AppLocalizations.of(context);
    final libraries = ref.watch(librariesProvider);
    final resume = ref.watch(continueWatchingProvider);
    final nextUp = ref.watch(nextUpProvider);
    final featured = ref.watch(featuredProvider);
    final recommendations = ref.watch(recommendationsProvider);
    final asked = ref.watch(askedProvider).value?.items ?? const [];

    Widget body;
    if (failedOutright(libraries, [resume, nextUp, featured])) {
      body = Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(vertical: 32),
          child: FailureState(
            title: l.homeFailed,
            error: libraries.error!,
            onRetry: _retryAll,
          ),
        ),
      );
    } else {
      body = LayoutBuilder(
        builder: (context, constraints) {
          final box = constraints.biggest;
          final libs = libraries.value;
          final sections = <Widget>[
            _top(box, featured, resume, nextUp),
            if (libs != null && libs.isEmpty)
              const _NoLibraries()
            else ...[
              if (_rail(resume.value) case final items?)
                _EpisodeRail(title: l.browseContinueWatching, items: items),
              if (_rail(nextUp.value) case final items?)
                _EpisodeRail(title: l.browseNextUp, items: items),
              for (final rail
                  in recommendations.value?.rails ??
                      const <HomeRecommendationRail>[])
                if (rail.items.isNotEmpty) _RecommendationRail(rail: rail),
              if (asked.isNotEmpty) AskedRail(items: asked),
              if (libs == null && libraries.isLoading)
                RailSkeleton(
                  label: l.loadingInProgress,
                  itemWidth: railCardSize(context, RailArt.poster).width,
                  aspectRatio: CardMetrics.poster,
                ),
              for (final library in libs ?? const <Library>[])
                if (!_shelfFailed(library)) _LibraryShelf(library: library),
            ],
            if (widget.links.isNotEmpty) _Links(links: widget.links),
          ];
          return ListView.separated(
            padding: const EdgeInsets.only(bottom: 24),
            itemCount: sections.length,
            separatorBuilder: (context, index) => const SizedBox(height: 24),
            itemBuilder: (context, index) => sections[index],
          );
        },
      );
    }
    return ReturnWatcher(
      path: Routes.home,
      onReturn: _returned,
      child: ColoredBox(color: colors.background, child: body),
    );
  }

  /// A shelf that failed is left out, as on the web, and tries again when
  /// Home comes back.
  bool _shelfFailed(Library library) {
    final shelf = ref.watch(shelfProvider(library.id));
    return shelf.hasError && !shelf.hasValue;
  }

  /// The banner over a tablet's Home, the cards under a phone's header; or
  /// nothing, when there are no featured titles or they failed.
  Widget _top(
    Size box,
    AsyncValue<List<FeaturedTitle>> featured,
    AsyncValue<List<MediaItem>> resume,
    AsyncValue<List<MediaItem>> nextUp,
  ) {
    final banner = opensWithBanner(box.width);
    final rowsBelow = rowsFollowBanner(resume, nextUp);
    final slides = featured.value;
    if (slides == null) {
      if (featured.hasError) return const SizedBox.shrink();
      return banner
          ? HomeBannerSkeleton(box: box, rowsBelow: rowsBelow)
          : const Padding(
              padding: EdgeInsets.only(top: 8),
              child: FeaturedCarouselSkeleton(),
            );
    }
    if (slides.isEmpty) return const SizedBox.shrink();
    // Other titles start it at the first again.
    final key = ValueKey(Object.hashAll([for (final s in slides) s.title.id]));
    return banner
        ? HomeBanner(key: key, slides: slides, box: box, rowsBelow: rowsBelow)
        : Padding(
            padding: const EdgeInsets.only(top: 8),
            child: FeaturedCarouselView(key: key, slides: slides),
          );
  }

  /// Continue watching or Next up, once it has something. Loading and
  /// empty show nothing: empty is the usual case for someone in the middle
  /// of nothing, and a placeholder would only fold away.
  static List<MediaItem>? _rail(List<MediaItem>? items) =>
      items == null || items.isEmpty ? null : items;
}

/// A row of files to start or resume. One that moved to the front starts
/// the row there again.
class _EpisodeRail extends StatelessWidget {
  const _EpisodeRail({required this.title, required this.items});

  final String title;
  final List<MediaItem> items;

  @override
  Widget build(BuildContext context) {
    final size = railCardSize(context, RailArt.wide);
    return Rail(
      key: ValueKey(items.first.id),
      title: title,
      itemWidth: size.width,
      itemHeight: size.height,
      itemCount: items.length,
      itemBuilder: (context, index) => EpisodeCard(item: items[index]),
    );
  }
}

/// "Recommended for you", or "Because you watched Dune": titles on the
/// server the viewer hasn't watched, as the server picked them.
class _RecommendationRail extends StatelessWidget {
  const _RecommendationRail({required this.rail});

  final HomeRecommendationRail rail;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final size = railCardSize(context, RailArt.poster);
    final items = rail.items;
    // The server mixes films and shows here, so each card says which.
    return NamedKinds(
      child: Rail(
        title: rail.id == RecommendationRailId.becauseWatched
            ? l.webDiscoverRailBecauseWatched(rail.seed?.name ?? '')
            : l.webDiscoverRailForYou,
        itemWidth: size.width,
        itemHeight: size.height,
        itemCount: items.length,
        itemBuilder: (context, index) {
          final item = items[index];
          final title = item.title;
          return TitleCard(
            title: title,
            detail: yearLine(context, title.year, title.kind),
            recommended: item.ref,
          );
        },
      ),
    );
  }
}

/// A library's newest titles: its heading over blank cards while they
/// load, "Nothing here yet" when it has none.
class _LibraryShelf extends ConsumerWidget {
  const _LibraryShelf({required this.library});

  final Library library;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final title = l.browseRecentlyAdded(library.name);
    final size = railCardSize(context, RailArt.poster);
    final entries = ref.watch(shelfProvider(library.id)).value;
    if (entries == null) {
      return RailSkeleton(
        label: l.loadingInProgress,
        title: title,
        itemWidth: size.width,
        aspectRatio: CardMetrics.poster,
      );
    }
    return Rail(
      title: title,
      itemWidth: size.width,
      itemHeight: size.height,
      itemCount: entries.length,
      empty: l.browseEmptyShelf,
      itemBuilder: (context, index) => ShelfCard(entry: entries[index]),
    );
  }
}

/// No library this account can open: for an admin, none exist; anyone
/// else may be in no group that opens one.
class _NoLibraries extends ConsumerWidget {
  const _NoLibraries();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final admin = switch (ref.watch(authStateProvider)) {
      // Whoever may add one is shown how.
      SignedIn(:final user) => can(user, Permission.libraryCreate),
      _ => false,
    };
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: EmptyState(
        icon: admin ? Lucide.folderPlus : Lucide.popcorn,
        title: admin ? l.browseHomeNoLibraries : l.browseHomeNothingYet,
        message: admin
            ? l.browseHomeNoLibrariesAdmin
            : l.browseHomeNothingYetDescription,
      ),
    );
  }
}

class _Links extends StatelessWidget {
  const _Links({required this.links});

  final List<(String, String)> links;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
    child: Wrap(
      spacing: 8,
      children: [
        for (final (label, path) in links)
          MatineeButton(
            look: ButtonLook.outline,
            size: ButtonSize.sm,
            onPressed: () => context.push(path),
            child: Text(label),
          ),
      ],
    ),
  );
}
