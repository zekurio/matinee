import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/cards.dart';
import '../../media/layout.dart';
import '../../query/failure_view.dart';
import '../../router.dart';
import '../home/home_data.dart' show librariesProvider;
import 'search_data.dart';

/// Search across the library, as the Kotlin app's (search/Search.kt): the
/// field at the top with Back in its magnifier's place, and under it, once
/// something's typed and typing pauses, the titles by library in the order
/// the server ranked them, then cast and crew, genres, and studios. The
/// last answer stays while the next is out, with "Searching…" under it.
/// Under the empty field is where Explore goes, which comes later.
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
  /// paused. Empty shows Explore.
  String _text = '';

  /// The last answer, kept on screen while the next one is out.
  ({String text, SearchResults results})? _last;

  void _typed(String value) {
    _pause?.cancel();
    final text = value.trim();
    // Clearing the field goes back to Explore at once.
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
              child: _text.isEmpty ? const _Explore() : _found(l),
            ),
          ),
        ],
      ),
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
    if (last.results.isEmpty) {
      return Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(vertical: 48),
          child: EmptyState(
            icon: Lucide.searchX,
            title: l.searchNoMatch(last.text),
            message: l.searchNoMatchHint,
          ),
        ),
      );
    }
    return _Results(results: last.results, searching: result.isLoading);
  }
}

/// Under the empty field: Explore's rails, the catalog's, Discover's, and
/// an admin's waiting requests, once they come. Until then it's empty, as
/// the Kotlin app leaves it while Discover is off; the field's placeholder
/// says what search finds.
class _Explore extends StatelessWidget {
  const _Explore();

  @override
  Widget build(BuildContext context) => const CustomScrollView(
    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
    slivers: [],
  );
}

/// What matched, grouped. Scrolling puts the keyboard away, so the rest can
/// be seen; the field keeps its text.
class _Results extends ConsumerWidget {
  const _Results({required this.results, required this.searching});

  final SearchResults results;

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
    const gap = SliverToBoxAdapter(child: SizedBox(height: 28));
    return CustomScrollView(
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      slivers: [
        const SliverToBoxAdapter(child: SizedBox(height: 8)),
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
}

/// A library's name over its matches, with how many on the same baseline.
class _GroupHeading extends StatelessWidget {
  const _GroupHeading({required this.title, required this.count});

  final String title;
  final String count;

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
          Text(count, style: KitText.sm.style(color: colors.mutedForeground)),
        ],
      ),
    );
  }
}

/// Someone in the cast or crew of what matched, as the cast's round photo
/// on a title's page and the Kotlin app's search have them, opening their
/// page.
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
