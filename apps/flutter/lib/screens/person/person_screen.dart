import 'dart:math' as math;

import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/cards.dart';
import '../../media/format.dart';
import '../../media/layout.dart';
import '../../query/failure_view.dart';
import '../../router.dart';
import '../requests/catalog_cards.dart';
import '../requests/request_words.dart';
import '../requests/requests_hub.dart';
import '../title/title_parts.dart';
import 'person_data.dart';

/// Someone in the cast or crew, as the Kotlin app's `PersonScreen`: who
/// they are, what they're in across the libraries, then their other titles
/// at TMDB, each card following its title's state live, to request.
class PersonScreen extends ConsumerStatefulWidget {
  const PersonScreen({super.key, required this.name, this.tmdbId});

  final String name;
  final String? tmdbId;

  @override
  ConsumerState<PersonScreen> createState() => _PersonScreenState();
}

class _PersonScreenState extends ConsumerState<PersonScreen> {
  /// The catalog cards built now, by their place in the list, which picks
  /// the ones the live stream follows.
  final _shown = FollowWindow();

  PersonKey get _key => (name: widget.name, tmdbId: widget.tmdbId);

  @override
  void dispose() {
    _shown.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final async = ref.watch(personProvider(_key));
    final person = async.value;
    return PageFrame(
      backLabel: l.commonBack,
      onBack: () => context.canPop() ? context.pop() : context.go(Routes.home),
      actions: [
        PageBarButton(
          icon: Lucide.house,
          label: l.shellHomeLink,
          onPressed: () => context.go(Routes.home),
        ),
      ],
      child: person == null
          ? Center(
              child: async.hasError
                  ? SingleChildScrollView(
                      padding: const EdgeInsets.symmetric(vertical: 48),
                      child: FailureState(
                        title: l.personLoadFailed,
                        error: async.error!,
                        onRetry: () => ref.invalidate(personProvider(_key)),
                        onHome: () => context.go(Routes.home),
                      ),
                    )
                  : LoadingState(label: l.loadingInProgress),
            )
          : _page(context, person),
    );
  }

  Widget _page(BuildContext context, Person person) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final catalog = person.catalog;
    return ListenableBuilder(
      listenable: _shown,
      builder: (context, child) {
        final followed = FollowedTitles([
          for (final credit in _shown.slice(catalog))
            CatalogInput(ref: credit.ref),
        ]);
        return FollowTitles(
          titles: followed,
          child: CustomScrollView(
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(
                  CardMetrics.gutter,
                  8,
                  CardMetrics.gutter,
                  12,
                ),
                sliver: SliverToBoxAdapter(child: _Header(person: person)),
              ),
              if (person.profile?.biography case final biography?)
                SliverPadding(
                  padding: const EdgeInsets.only(top: 4, bottom: 20),
                  sliver: SliverToBoxAdapter(child: Overview(text: biography)),
                ),
              CardGrid(
                columns: posterColumns,
                aspectRatio: CardMetrics.poster,
                itemCount: person.credits.length,
                itemBuilder: (context, index) {
                  final credit = person.credits[index];
                  return TitleCard(
                    title: credit.title,
                    detail:
                        credit.role ??
                        credit.title.year?.toString() ??
                        creditKindWord(credit.kind, l, 1),
                  );
                },
              ),
              if (catalog.isNotEmpty) ...[
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    CardMetrics.gutter,
                    person.credits.isEmpty ? 0 : 32,
                    CardMetrics.gutter,
                    20,
                  ),
                  sliver: SliverToBoxAdapter(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      spacing: 6,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.baseline,
                          textBaseline: TextBaseline.alphabetic,
                          spacing: 10,
                          children: [
                            Flexible(
                              child: SectionTitle(title: l.webCatalogNotHere),
                            ),
                            Text(
                              l.browseTitleCount(catalog.length),
                              style: KitText.sm.style(
                                color: colors.mutedForeground,
                              ),
                            ),
                          ],
                        ),
                        if (person.stale)
                          Text(
                            l.webDiscoverStale,
                            style: KitText.sm.style(
                              color: colors.mutedForeground,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                CardGrid(
                  columns: posterColumns,
                  aspectRatio: CardMetrics.poster,
                  itemCount: catalog.length,
                  itemBuilder: (context, index) => _Followed(
                    window: _shown,
                    index: index,
                    child: CatalogCreditCard(credit: catalog[index]),
                  ),
                ),
              ],
              SliverToBoxAdapter(
                child: SizedBox(
                  height: 32 + MediaQuery.paddingOf(context).bottom,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// The photo, the name, and what they're known for, or with nothing from
/// TMDB, what they do here and in how many titles.
class _Header extends StatelessWidget {
  const _Header({required this.person});

  final Person person;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final photo = person.photo;
    final profile = person.profile;
    final line = profile != null
        ? profileLine(profile, l)
        : [
            creditKindWord(person.kind, l, 1),
            l.browseTitleCount(person.titleCount),
          ].join(' · ');
    return Row(
      spacing: 20,
      children: [
        SizedBox.square(
          dimension: 112,
          child: ClipOval(
            child: ColoredBox(
              color: colors.secondary,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Center(
                    child: Text(
                      PersonCard.initials(person.name),
                      style: KitText.px26.style(
                        color: colors.mutedForeground,
                        weight: FontWeight.w700,
                      ),
                    ),
                  ),
                  if (photo != null)
                    Picture([ArtSource(photo, largest: ArtworkSize.small)]),
                ],
              ),
            ),
          ),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 4,
            children: [
              Semantics(
                header: true,
                child: Text(
                  person.name,
                  style: KitText.px26
                      .style(color: colors.foreground, weight: FontWeight.w700)
                      .copyWith(letterSpacing: KitText.px26.size * -.025),
                ),
              ),
              if (line.isNotEmpty)
                Text(
                  line,
                  style: KitText.sm.style(color: colors.mutedForeground),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

/// One of their titles at TMDB that isn't here, as the catalog's card:
/// the poster with the state of a request for it, opening the catalog's
/// page, and turning into the library's card once it arrives.
class CatalogCreditCard extends StatelessWidget {
  const CatalogCreditCard({super.key, required this.credit});

  final PersonCatalogCredit credit;

  @override
  Widget build(BuildContext context) {
    final detail = [?credit.year?.toString(), ?credit.role].join(' · ');
    return CatalogCard(
      title: CatalogTitleSummary(
        ref: credit.ref,
        name: credit.name,
        year: credit.year,
        poster: credit.poster,
        availability: credit.availability,
      ),
      detail: detail.isEmpty ? null : CardDetail(detail),
      hereAtFirst: credit.availability.hereAs != null,
    );
  }
}

/// "Acting · Born Sep 2, 1964", each part TMDB knows.
String profileLine(PersonProfile profile, AppLocalizations l) => [
  ?switch (profile.knownFor) {
    final id? => departmentWord(id, l),
    null => null,
  },
  ?switch (formatDay(profile.birthday, l)) {
    final day? => l.personBorn(day),
    null => null,
  },
  ?switch (formatDay(profile.deathday, l)) {
    final day? => l.personDied(day),
    null => null,
  },
].join(' · ');

/// What TMDB says someone is known for, in the app's language, or null for
/// a department it doesn't name.
String? departmentWord(String id, AppLocalizations l) => switch (id) {
  PersonDepartment.acting => l.personDepartmentActing,
  PersonDepartment.directing => l.personDepartmentDirecting,
  PersonDepartment.writing => l.personDepartmentWriting,
  PersonDepartment.creator => l.personDepartmentCreator,
  PersonDepartment.production => l.personDepartmentProduction,
  PersonDepartment.editing => l.personDepartmentEditing,
  PersonDepartment.camera => l.personDepartmentCamera,
  PersonDepartment.sound => l.personDepartmentSound,
  PersonDepartment.art => l.personDepartmentArt,
  PersonDepartment.costume => l.personDepartmentCostume,
  PersonDepartment.visualEffects => l.personDepartmentVisualEffects,
  PersonDepartment.lighting => l.personDepartmentLighting,
  PersonDepartment.crew => l.personDepartmentCrew,
  _ => null,
};

/// "Director", or "Directors" for [count] above one.
String creditKindWord(String kind, AppLocalizations l, int count) =>
    switch (kind) {
      CreditKind.creator => l.peopleCreditCreator(count),
      CreditKind.director => l.peopleCreditDirector(count),
      CreditKind.writer => l.peopleCreditWriter(count),
      _ => l.peopleCreditActor(count),
    };

/// Which catalog cards are built, by their place in the list, and from
/// that the ones to follow: the blocks of [block] around them, at most
/// [blocks] of them, as the Kotlin app follows the cards around the screen.
/// The live stream takes a hundred titles at most and opens again on a
/// change, so it follows a window rather than the whole list.
final class FollowWindow extends ChangeNotifier {
  FollowWindow({this.block = 12, this.blocks = 6});

  final int block;
  final int blocks;
  final _built = <int>{};
  var _window = (0, 0);
  var _scheduled = false;
  var _disposed = false;

  (int, int) get window => _window;

  void add(int index) {
    _built.add(index);
    _schedule();
  }

  void remove(int index) {
    _built.remove(index);
    _schedule();
  }

  /// The part of [items] in the window.
  List<T> slice<T>(List<T> items) {
    final (from, to) = _window;
    return items.sublist(
      math.min(from, items.length),
      math.min(to, items.length),
    );
  }

  /// The window for the cards at [built]: from the block before the first
  /// to the block after the last, no more than [blocks] blocks.
  static (int, int) windowFor(
    Iterable<int> built, {
    required int block,
    required int blocks,
  }) {
    if (built.isEmpty) return (0, 0);
    final first = built.reduce(math.min);
    final last = built.reduce(math.max);
    final from = math.max(0, first ~/ block - 1);
    final to = math.min(last ~/ block + 1, from + blocks - 1);
    return (from * block, (to + 1) * block);
  }

  // Cards come and go while the grid lays out, so the window moves once
  // the frame is done.
  void _schedule() {
    if (_scheduled) return;
    _scheduled = true;
    SchedulerBinding.instance.addPostFrameCallback((_) {
      _scheduled = false;
      if (_disposed) return;
      final next = windowFor(_built, block: block, blocks: blocks);
      if (next == _window) return;
      _window = next;
      notifyListeners();
    });
    SchedulerBinding.instance.ensureVisualUpdate();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

/// Tells [window] while its card is built.
class _Followed extends StatefulWidget {
  const _Followed({
    required this.window,
    required this.index,
    required this.child,
  });

  final FollowWindow window;
  final int index;
  final Widget child;

  @override
  State<_Followed> createState() => _FollowedState();
}

class _FollowedState extends State<_Followed> {
  @override
  void initState() {
    super.initState();
    widget.window.add(widget.index);
  }

  @override
  void didUpdateWidget(_Followed old) {
    super.didUpdateWidget(old);
    if (old.index != widget.index || old.window != widget.window) {
      old.window.remove(old.index);
      widget.window.add(widget.index);
    }
  }

  @override
  void dispose() {
    widget.window.remove(widget.index);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
