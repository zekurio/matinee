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
import '../requests/follow_window.dart';
import '../requests/request_words.dart';
import '../requests/requests_hub.dart';
import '../title/title_parts.dart';
import 'person_data.dart';

/// Someone in the cast or crew: who they are, what they're in across the
/// libraries, then their other titles at TMDB, each card following its title's
/// state live, to request.
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
      child: FadeSwitcher(
        value: person != null ? 'person' : async.hasError,
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
      ),
    );
  }

  Widget _page(BuildContext context, Person person) {
    final l = AppLocalizations.of(context);
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
              for (final (index, kind) in creditKinds(person).indexed) ...[
                _sectionHeading(
                  title: creditSectionWord(kind, l),
                  count: _credits(person, kind).length,
                  top: index == 0 ? 0 : 32,
                ),
                CardGrid(
                  columns: posterColumns,
                  aspectRatio: CardMetrics.poster,
                  itemCount: _credits(person, kind).length,
                  itemBuilder: (context, index) {
                    final credit = _credits(person, kind)[index];
                    final detail = [
                      ?credit.title.year?.toString(),
                      ?credit.role,
                    ].join(' · ');
                    return TitleCard(
                      title: credit.title,
                      detail: detail.isEmpty ? null : detail,
                    );
                  },
                ),
              ],
              if (catalog.isNotEmpty) ...[
                _sectionHeading(
                  title: l.webCatalogNotHere,
                  count: catalog.length,
                  top: person.credits.isEmpty ? 0 : 32,
                  note: person.stale ? l.webDiscoverStale : null,
                ),
                CardGrid(
                  columns: posterColumns,
                  aspectRatio: CardMetrics.poster,
                  itemCount: catalog.length,
                  itemBuilder: (context, index) => FollowedCard(
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

  List<PersonCredit> _credits(Person person, String kind) => [
    for (final credit in person.credits)
      if (credit.kind == kind) credit,
  ];

  /// A section's heading, "Acting" or "Not here yet", with how many
  /// titles it holds beside it, as the web's person page.
  Widget _sectionHeading({
    required String title,
    required int count,
    required double top,
    String? note,
  }) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    return SliverPadding(
      padding: EdgeInsets.fromLTRB(
        CardMetrics.gutter,
        top,
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
                Flexible(child: SectionTitle(title: title)),
                Text(
                  l.browseTitleCount(count),
                  style: KitText.sm.style(color: colors.mutedForeground),
                ),
              ],
            ),
            if (note != null)
              Text(
                note,
                style: KitText.sm.style(color: colors.mutedForeground),
              ),
          ],
        ),
      ),
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

/// The kinds of credit someone has here, what they're known for first,
/// as the web orders its sections.
List<String> creditKinds(Person person) {
  final present = {for (final credit in person.credits) credit.kind};
  return [
    person.kind,
    ...CreditKind.all.where((kind) => kind != person.kind),
  ].where(present.contains).toList();
}

/// The heading over someone's titles of one kind of credit: "Acting".
String creditSectionWord(String kind, AppLocalizations l) => switch (kind) {
  CreditKind.creator => l.personSectionCreator,
  CreditKind.director => l.personSectionDirector,
  CreditKind.writer => l.personSectionWriter,
  _ => l.personSectionActor,
};
