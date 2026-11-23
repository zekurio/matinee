import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../downloads/downloads.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/avatar.dart';
import '../../media/cards.dart';
import '../../media/layout.dart';
import '../../query/failure_view.dart';
import '../../router.dart';
import '../home/home_data.dart' show librariesProvider;
import '../requests/catalog_cards.dart' show CatalogCard;
import '../requests/request_words.dart' show askable, refKey;
import '../requests/requests_data.dart' show catalogSearchProvider;
import '../requests/requests_hub.dart';
import 'offline_search.dart';
import 'search_data.dart';

/// Search across the library: the field at the top with Back in its magnifier's
/// place, and under it, once something's typed and typing pauses, the titles by
/// library in the order the server ranked them, then cast and crew, genres, and
/// studios, then the catalog's "Not here yet", which loads on its own. The last
/// answer stays while the next is out, with "Searching…" under it.
///
/// Offline it looks through the downloads instead: the movies and shows on
/// the device, by name, opening what the Downloads tab opens for them. Under
/// an empty field it only says what it searches; the Explore tab has the
/// catalog's rows.
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _field = TextEditingController();
  final _focus = FocusNode();
  Timer? _pause;

  /// The text the page searches for: the field's, trimmed, once typing
  /// paused. Empty shows what Search looks through.
  String _text = '';

  /// The last answer, kept on screen while the next one is out.
  ({String text, SearchResults results})? _last;

  void _typed(String value) {
    _pause?.cancel();
    final text = value.trim();
    // Clearing the field goes back to the hint at once.
    if (text.isEmpty) {
      setState(() => _text = '');
      return;
    }
    _pause = Timer(searchDebounce, () {
      if (mounted) setState(() => _text = text);
    });
  }

  @override
  void dispose() {
    _pause?.cancel();
    _field.dispose();
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final offline = ref.watch(authStateProvider) is Offline;
    return ColoredBox(
      color: colors.background,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SafeArea(
            bottom: false,
            child: SizedBox(
              height: PageFrame.barHeight,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                // On a tablet the field stays a field's width, not the
                // window's.
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 720),
                    child: SearchPill(
                      expanded: true,
                      searchLabel: l.searchField,
                      backLabel: l.commonBack,
                      clearLabel: l.searchClear,
                      controller: _field,
                      focusNode: _focus,
                      autofocus: true,
                      onOpen: _focus.requestFocus,
                      onClose: () => context.pop(),
                      onChanged: _typed,
                      // Search follows the typing; the key only puts the
                      // keyboard away.
                      onSubmitted: (_) => _focus.unfocus(),
                    ),
                  ),
                ),
              ),
            ),
          ),
          Expanded(
            child: MediaQuery.removePadding(
              context: context,
              removeTop: true,
              child: offline
                  ? _offline(l)
                  : _text.isEmpty
                  ? const _EmptySearchHint()
                  : _found(l),
            ),
          ),
        ],
      ),
    );
  }

  Widget _offline(AppLocalizations l) {
    final colors = MatineeTheme.of(context);
    final text = _text;
    final scope = Text(
      l.searchOfflineScope,
      style: KitText.sm.style(color: colors.mutedForeground),
    );
    if (text.isEmpty) {
      return Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
          child: Column(
            spacing: 12,
            children: [
              KitIcon(Lucide.download, size: 40, color: colors.mutedForeground),
              scope,
              Text(
                l.searchOfflineHint,
                textAlign: TextAlign.center,
                style: KitText.sm.style(color: colors.mutedForeground),
              ),
            ],
          ),
        ),
      );
    }
    final hits = searchDownloads(
      ref.watch(shownDownloadsProvider).values,
      text,
    );
    final gutter = CardMetrics.gutter;
    return ListView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: EdgeInsets.only(
        left: gutter,
        right: gutter,
        top: 4,
        bottom: MediaQuery.paddingOf(context).bottom + 24,
      ),
      children: [
        scope,
        if (hits.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 40),
            child: EmptyState(
              icon: Lucide.searchX,
              title: l.searchNoMatch(text),
              message: l.searchNoMatchHint,
            ),
          )
        else
          for (final hit in hits)
            _DownloadHitRow(
              hit: hit,
              onPressed: () {
                _focus.unfocus();
                unawaited(
                  context.push(
                    hit.isShow
                        ? Routes.downloadsShow(hit.id)
                        : Routes.play(hit.id),
                  ),
                );
              },
            ),
      ],
    );
  }

  Widget _found(AppLocalizations l) {
    final text = _text;
    final result = ref.watch(searchProvider(text));
    if (result.value case final results?) {
      _last = (text: text, results: results);
    }
    if (result.hasError && !result.isLoading) {
      return Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(vertical: 48),
          child: FailureState(
            title: l.searchFailedTitle,
            error: result.error!,
            onRetry: () => ref.invalidate(searchProvider(text)),
          ),
        ),
      );
    }
    final last = result.hasValue || result.isLoading ? _last : null;
    if (last == null) return LoadingState(label: l.searchSearching);
    final catalog = ref.watch(catalogSearchProvider(text));
    final page = catalog.value;
    final catalogFailed =
        page == null && catalog.hasError && !catalog.isLoading;
    // The titles the viewer may ask for: none while requests are off.
    final notHere = page == null
        ? null
        : askable(page.items, (item) => item.availability);
    final catalogPending = notHere == null && !catalogFailed;
    if (last.results.isEmpty && !catalogPending && (notHere?.isEmpty ?? true)) {
      return Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(vertical: 48),
          child: Column(
            spacing: 16,
            children: [
              EmptyState(
                icon: Lucide.searchX,
                title: l.searchNoMatch(last.text),
                message: l.searchNoMatchHint,
              ),
              if (catalogFailed)
                _CatalogFailed(
                  onRetry: () => ref.invalidate(catalogSearchProvider(text)),
                ),
            ],
          ),
        ),
      );
    }
    // Here rather than in the section, so its cards stay live while its
    // heading is scrolled away.
    return FollowTitles(
      titles: FollowedTitles([
        for (final item in notHere ?? const <CatalogTitleSummary>[])
          CatalogInput(ref: item.ref),
      ]),
      child: _Results(
        results: last.results,
        searching: result.isLoading,
        notHere: notHere,
        catalogFailed: catalogFailed,
        catalogStale: page?.stale ?? false,
        onCatalogRetry: () => ref.invalidate(catalogSearchProvider(text)),
      ),
    );
  }
}

/// Search's empty field: a quiet line saying where typing looks, since
/// Discover's rows now have the Explore tab.
class _EmptySearchHint extends StatelessWidget {
  const _EmptySearchHint();

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
        child: Text(
          l.searchEmptyHint,
          textAlign: TextAlign.center,
          style: KitText.sm.style(
            color: MatineeTheme.of(context).mutedForeground,
          ),
        ),
      ),
    );
  }
}

/// A downloaded title Search found offline: a tap opens what the Downloads
/// tab opens for it.
class _DownloadHitRow extends StatelessWidget {
  const _DownloadHitRow({required this.hit, required this.onPressed});

  final DownloadHit hit;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final detail = hit.isShow
        ? l.mediaEpisodeCount(hit.count)
        : hit.year?.toString();
    return PressIndication(
      onPressed: onPressed,
      label: [hit.name, ?detail].join(', '),
      shape: KitRadius.control,
      builder: (context, state) => ColoredBox(
        color: colors.foreground.withValues(
          alpha: state == PressState.idle ? 0 : .04,
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            spacing: 14,
            children: [
              KitIcon(
                hit.isShow ? Lucide.tv : Lucide.film,
                size: 22,
                color: colors.mutedForeground,
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      hit.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: KitText.sm.style(color: colors.foreground),
                    ),
                    if (detail != null)
                      Text(
                        detail,
                        maxLines: 1,
                        style: KitText.xs.style(color: colors.mutedForeground),
                      ),
                  ],
                ),
              ),
              KitIcon(
                Lucide.chevronRight,
                size: 18,
                color: colors.mutedForeground,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The catalog couldn't be searched, with Try again.
class _CatalogFailed extends StatelessWidget {
  const _CatalogFailed({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      child: Row(
        spacing: 12,
        children: [
          Expanded(
            child: Text(
              l.catalogSearchFailed,
              style: KitText.sm.style(
                color: MatineeTheme.of(context).mutedForeground,
              ),
            ),
          ),
          MatineeButton(
            look: ButtonLook.outline,
            size: ButtonSize.sm,
            onPressed: onRetry,
            child: Text(l.commonRetry),
          ),
        ],
      ),
    );
  }
}

/// What matched, grouped. Scrolling puts the keyboard away, so the rest can
/// be seen; the field keeps its text.
class _Results extends ConsumerWidget {
  const _Results({
    required this.results,
    required this.searching,
    required this.notHere,
    required this.catalogFailed,
    required this.catalogStale,
    required this.onCatalogRetry,
  });

  final SearchResults results;

  /// What the catalog found that isn't here, null while it's out.
  final List<CatalogTitleSummary>? notHere;
  final bool catalogFailed;
  final bool catalogStale;
  final VoidCallback onCatalogRetry;

  /// A newer search is out, so these may be for the text before.
  final bool searching;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final names = {
      for (final library in ref.watch(librariesProvider).value ?? <Library>[])
        library.id: library.name,
    };
    final scaler = MediaQuery.textScalerOf(context);
    final personWidth = railItemWidth(
      RailArt.person,
      MediaQuery.sizeOf(context),
    );
    // Whose username is the signed-in account's, so their card opens the
    // profile tab's page rather than another person's.
    final ownUsername = switch (ref.watch(authStateProvider)) {
      SignedIn(:final user) => user.username,
      _ => null,
    };
    final canSeeProfiles = ref.watch(canProvider(Permission.profileRead));
    const gap = SliverToBoxAdapter(child: SizedBox(height: 28));
    return CustomScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      slivers: [
        const SliverToBoxAdapter(child: SizedBox(height: 8)),
        if (results.users.isNotEmpty && canSeeProfiles) ...[
          SliverToBoxAdapter(
            child: Rail(
              title: l.searchSectionProfiles,
              itemWidth: personWidth,
              itemHeight: PersonCard.height(personWidth, scaler),
              itemCount: results.users.length,
              itemBuilder: (context, index) => _UserResult(
                user: results.users[index],
                own: results.users[index].username == ownUsername,
              ),
            ),
          ),
          gap,
        ],
        for (final MapEntry(key: library, value: titles)
            in results.titlesByLibrary.entries) ...[
          SliverToBoxAdapter(
            child: _GroupHeading(
              title: names[library] ?? l.searchTitlesHeading,
              count: l.browseTitleCount(titles.length),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 12)),
          CardGrid(
            columns: posterColumns,
            aspectRatio: CardMetrics.poster,
            itemCount: titles.length,
            itemBuilder: (context, index) => TitleCard(
              title: titles[index],
              detail: titles[index].year?.toString(),
            ),
          ),
          gap,
        ],
        if (results.people.isNotEmpty) ...[
          SliverToBoxAdapter(
            child: Rail(
              title: l.searchSectionCast,
              itemWidth: personWidth,
              itemHeight: PersonCard.height(personWidth, scaler),
              itemCount: results.people.length,
              itemBuilder: (context, index) =>
                  _Person(person: results.people[index]),
            ),
          ),
          gap,
        ],
        if (results.genres.isNotEmpty) ...[
          SliverToBoxAdapter(
            child: _Facets(
              title: l.searchSectionGenres,
              facets: results.genres,
              route: (name) => Routes.browse(genre: name),
            ),
          ),
          gap,
        ],
        if (results.studios.isNotEmpty) ...[
          SliverToBoxAdapter(
            child: _Facets(
              title: l.searchSectionStudios,
              facets: results.studios,
              route: (name) => Routes.browse(studio: name),
            ),
          ),
          gap,
        ],
        ..._notHere(context, l, colors),
        if (searching)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: CardMetrics.gutter,
              ),
              child: Text(
                l.searchSearching,
                style: KitText.xs.style(color: colors.mutedForeground),
              ),
            ),
          ),
        SliverToBoxAdapter(
          child: SizedBox(height: MediaQuery.paddingOf(context).bottom + 24),
        ),
      ],
    );
  }

  /// "Not here yet": titles the catalog found that no library here has,
  /// under the library's own results with that heading, or first and
  /// unheaded when the library has none.
  List<Widget> _notHere(
    BuildContext context,
    AppLocalizations l,
    KitColors colors,
  ) {
    final items = notHere;
    if (items != null && items.isEmpty) return const [];
    final first = results.isEmpty;
    return [
      if (!first)
        SliverToBoxAdapter(
          child: _GroupHeading(
            title: l.webCatalogNotHere,
            count: items == null || items.isEmpty
                ? null
                : l.browseTitleCount(items.length),
          ),
        ),
      if (catalogFailed)
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.only(top: 12),
            child: _CatalogFailed(onRetry: onCatalogRetry),
          ),
        )
      else if (items == null)
        const SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: Spinner(size: 32)),
          ),
        )
      else if (catalogStale)
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              CardMetrics.gutter,
              6,
              CardMetrics.gutter,
              0,
            ),
            child: Text(
              l.webCatalogSearchStale,
              style: KitText.sm.style(color: colors.mutedForeground),
            ),
          ),
        ),
      if (items != null) ...[
        const SliverToBoxAdapter(child: SizedBox(height: 12)),
        CardGrid(
          columns: posterColumns,
          aspectRatio: CardMetrics.poster,
          itemCount: items.length,
          // The catalog's matches are films and shows together.
          itemBuilder: (context, index) => NamedKinds(
            key: ValueKey(refKey(items[index].ref)),
            child: CatalogCard(title: items[index]),
          ),
        ),
      ],
      const SliverToBoxAdapter(child: SizedBox(height: 28)),
    ];
  }
}

/// A library's name over its matches, with how many on the same baseline.
class _GroupHeading extends StatelessWidget {
  const _GroupHeading({required this.title, this.count});

  final String title;
  final String? count;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        spacing: 10,
        children: [
          Flexible(child: SectionTitle(title: title)),
          if (count case final count?)
            Text(count, style: KitText.sm.style(color: colors.mutedForeground)),
        ],
      ),
    );
  }
}

/// Someone in the cast or crew of what matched, as the cast's round photo on a
/// title's page has them, opening their page.
class _Person extends StatelessWidget {
  const _Person({required this.person});

  final PersonSummary person;

  @override
  Widget build(BuildContext context) {
    final photo = person.photo;
    return PersonCard(
      name: person.name,
      role: creditKind(person.kind, AppLocalizations.of(context)),
      photo: photo == null
          ? null
          : Picture([ArtSource(photo, largest: ArtworkSize.small)]),
      onPressed: () => context.push(Routes.person(person.name)),
    );
  }
}

/// Someone on the server whose name matched, their picture and display name
/// over their username, opening their profile. One's own opens the profile
/// tab's page.
class _UserResult extends StatelessWidget {
  const _UserResult({required this.user, required this.own});

  final ProfileUser user;
  final bool own;

  @override
  Widget build(BuildContext context) {
    final avatarUrl = user.avatarUrl;
    return PersonCard(
      name: user.name,
      role: '@${user.username}',
      photo: avatarUrl == null
          ? null
          : LayoutBuilder(
              builder: (context, constraints) => Avatar(
                url: avatarUrl,
                name: user.name,
                size: constraints.maxWidth,
              ),
            ),
      onPressed: () => context.push(
        own ? Routes.profile : Routes.userProfile(user.username),
      ),
    );
  }
}

/// Genres or studios that matched, as chips opening Browse.
class _Facets extends StatelessWidget {
  const _Facets({
    required this.title,
    required this.facets,
    required this.route,
  });

  final String title;
  final List<Facet> facets;
  final String Function(String name) route;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: 12,
      children: [
        SectionTitle(title: title),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final facet in facets)
              ChoiceChip(
                label: facet.name,
                selected: false,
                onPressed: () => context.push(route(facet.name)),
              ),
          ],
        ),
      ],
    ),
  );
}
