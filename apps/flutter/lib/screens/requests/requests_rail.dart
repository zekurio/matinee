import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/avatar.dart';
import '../../media/format.dart' show seasonName;
import '../../media/layout.dart';
import '../../router.dart';
import 'catalog_cards.dart';
import 'discover.dart' show QueueList, RailFailed;
import 'request_words.dart';
import 'requests_data.dart';
import 'requests_hub.dart';

/// Explore's first row, "Requests", as the web's `requests-rail.tsx`: an
/// admin's waiting requests with Add and Decline, or anyone else's own in
/// progress with Cancel, whichever `discover.rails` names in `requests`.
/// It follows its list even while that's empty and shows only once there
/// are cards, so the first request appears without a reload. Both lists
/// come from streams of their own, so the row stays when the catalog's
/// rows are down.

/// How many cards the row shows. Its heading leads to the rest.
const requestRowCards = 20;

/// How many askers' faces a waiting card shows; the count after the first
/// name says the rest.
const _faces = 3;

/// The row for [which], `"queue"` or `"mine"`, as `DiscoverRails.requests`
/// says. Nothing for anything else, as an older server's missing field.
class RequestsRail extends StatelessWidget {
  const RequestsRail({super.key, required this.which});

  final String? which;

  @override
  Widget build(BuildContext context) => switch (which) {
    DiscoverRequests.queue => const _WaitingRequests(),
    DiscoverRequests.mine => const _OwnRequests(),
    _ => const SizedBox.shrink(),
  };
}

/// What `DiscoverRails.requests` names.
abstract final class DiscoverRequests {
  static const queue = 'queue';
  static const mine = 'mine';
}

/// The requests that wait for an admin, from the queue the hub streams for
/// the whole app. One answered leaves at once, and the row with the last.
/// The heading opens the queue.
class _WaitingRequests extends ConsumerWidget {
  const _WaitingRequests();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queue = ref.watch(requestsProvider.select((state) => state.queue));
    final failed = ref.watch(
      requestsProvider.select((state) => state.queueFailed),
    );
    return _RequestsRow<AdminRequestItem>(
      items: queue?.waiting,
      id: (item) => item.id,
      onSeeAll: () => context.push(Routes.requests(QueueList.waiting)),
      error: failed && queue == null ? const _QueueDown() : null,
      onRetry: () => ref.read(requestsProvider.notifier).retryQueue(),
      card: (item) => _QueueCard(item: item),
    );
  }
}

/// Why the admin's row has no cards, for [RailFailed]'s words.
final class _QueueDown implements Exception {
  const _QueueDown();
}

/// The viewer's own requests in progress, live from `requests.mineLive`,
/// each as the server says it stands. The heading opens My requests.
class _OwnRequests extends ConsumerWidget {
  const _OwnRequests();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mine = ref.watch(myLiveRequestsProvider);
    return _RequestsRow<RequestItem>(
      items: mine.value?.items,
      id: (item) => item.id,
      onSeeAll: () => context.push(Routes.requests()),
      error: mine.hasError && !mine.hasValue ? mine.error : null,
      onRetry: () => ref.invalidate(myLiveRequestsProvider),
      card: (item) => _OwnCard(item: item),
    );
  }
}

/// The frame both rows share: the heading, which opens the full list, and
/// the cards, or blank ones while [items] load (null), or the heading over
/// why with Try again; nothing once no card is left. What's held for Undo
/// is out of the row, which stays built under Explore as long as Discover
/// names it, so the toast's Undo outlives the last card.
class _RequestsRow<T> extends ConsumerWidget {
  const _RequestsRow({
    required this.items,
    required this.id,
    required this.onSeeAll,
    required this.error,
    required this.onRetry,
    required this.card,
  });

  final List<T>? items;
  final String Function(T item) id;
  final VoidCallback onSeeAll;
  final Object? error;
  final VoidCallback onRetry;
  final Widget Function(T item) card;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final title = l.webRequestsTitle;
    final width = requestCardWidth(MediaQuery.sizeOf(context));
    final held = ref.watch(requestsProvider.select((state) => state.held));
    final error = this.error;
    final items = this.items;
    final Widget child;
    if (error != null) {
      child = RailFailed(title: title, error: error, onRetry: onRetry);
    } else if (items == null) {
      child = _RowSkeleton(title: title, width: width);
    } else {
      final shown = [
        for (final item in items)
          if (!held.contains(id(item))) item,
      ].take(requestRowCards).toList();
      if (shown.isEmpty) return const SizedBox.shrink();
      child = Rail(
        title: title,
        onSeeAll: onSeeAll,
        seeAllLabel: l.commonSeeAll,
        itemWidth: width,
        itemHeight: null,
        itemCount: shown.length,
        itemBuilder: (context, index) => KeyedSubtree(
          key: ValueKey(id(shown[index])),
          child: card(shown[index]),
        ),
      );
    }
    return Padding(padding: const EdgeInsets.only(bottom: 24), child: child);
  }
}

/// The row while its list loads: the heading over three blank cards.
class _RowSkeleton extends StatelessWidget {
  const _RowSkeleton({required this.title, required this.width});

  final String title;
  final double width;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    return Semantics(
      label: l.loadingInProgress,
      container: true,
      child: ExcludeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: CardMetrics.gutter,
              ),
              child: SectionTitle(title: title),
            ),
            const SizedBox(height: 12),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              physics: const NeverScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(
                horizontal: CardMetrics.gutter,
              ),
              child: Row(
                spacing: CardMetrics.gap,
                children: [
                  for (var i = 0; i < 3; i++)
                    Container(
                      width: width,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        borderRadius: const BorderRadius.all(
                          Radius.circular(KitRadius.xl),
                        ),
                        border: Border.all(color: colors.border),
                      ),
                      child: const Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        spacing: 12,
                        children: [
                          SkeletonBox(width: _poster, height: _poster * 1.5),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              spacing: 8,
                              children: [
                                SkeletonBox(width: 60, height: 12),
                                SkeletonBox(width: 150, height: 16),
                                SkeletonBox(width: 90, height: 16),
                                SkeletonBox(width: 110, height: 24),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The poster's width on a card, 2:3.
const _poster = 96.0;

/// A title's page from a request: the library's once it's here, the
/// catalog's while it isn't.
void _open(
  BuildContext context,
  CatalogTitleSummary title,
  String library,
  Availability availability,
) {
  final here = availability.libraryTitleId;
  unawaited(
    context.push(
      here != null
          ? Routes.title(here)
          : catalogRoute(title.ref, library: library),
    ),
  );
}

/// One request, as Seerr draws its request cards and the web's
/// `request-card.tsx` does: the poster, sharp, beside the request's
/// details, over the same poster blurred and darkened, so the card takes
/// its colours from the title. The picture is dark in either scheme, so
/// the card is drawn in the theme's dark half. The year and kind, the
/// name, and what a show's request covers open the title; then [state],
/// [who], and [actions], which each row fills with its own.
class RequestCard extends StatelessWidget {
  const RequestCard({
    super.key,
    required this.title,
    required this.library,
    required this.scope,
    required this.availability,
    required this.state,
    required this.who,
    this.actions,
  });

  final CatalogTitleSummary title;
  final String library;
  final ShowScope? scope;

  /// The title's, which says where its page is.
  final Availability availability;
  final List<Widget> state;
  final Widget who;
  final Widget? actions;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return MatineeTheme.alwaysDark(
      context,
      Builder(
        builder: (context) {
          final colors = MatineeTheme.of(context);
          final poster = title.poster;
          final scope = scopeText(this.scope, l);
          final facts = yearKind(title.year, title.ref.kind, l);
          final actions = this.actions;
          void open() => _open(context, title, library, availability);
          return ClipRRect(
            borderRadius: const BorderRadius.all(Radius.circular(KitRadius.xl)),
            child: Stack(
              children: [
                Positioned.fill(
                  child: ExcludeSemantics(
                    child: Tone(
                      toneKey: refKey(title.ref),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          if (poster != null)
                            ImageFiltered(
                              imageFilter: ImageFilter.blur(
                                sigmaX: 24,
                                sigmaY: 24,
                                tileMode: TileMode.decal,
                              ),
                              child: Transform.scale(
                                scale: 1.5,
                                child: Picture([ArtSource(poster)]),
                              ),
                            ),
                          ColoredBox(
                            color: colors.background.withValues(alpha: .65),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                Positioned.fill(
                  child: IgnorePointer(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        borderRadius: const BorderRadius.all(
                          Radius.circular(KitRadius.xl),
                        ),
                        border: Border.all(color: colors.border),
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 12,
                    children: [
                      SizedBox(
                        width: _poster,
                        child: ExcludeSemantics(
                          child: PressIndication(
                            onPressed: open,
                            shape: const BorderRadius.all(
                              Radius.circular(KitRadius.md),
                            ),
                            builder: (context, _) => ArtFrame(
                              toneKey: refKey(title.ref),
                              aspectRatio: CardMetrics.poster,
                              children: [
                                if (poster != null)
                                  Picture([ArtSource(poster)]),
                              ],
                            ),
                          ),
                        ),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            PressIndication(
                              onPressed: open,
                              label: [title.name, facts, ?scope].join(', '),
                              shape: const BorderRadius.all(Radius.circular(4)),
                              builder: (context, _) => ExcludeSemantics(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      facts,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: KitText.xs.style(
                                        color: colors.mutedForeground,
                                      ),
                                    ),
                                    Text(
                                      title.name,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: KitText.base.style(
                                        color: colors.foreground,
                                        weight: FontWeight.w600,
                                        leading: 20,
                                      ),
                                    ),
                                    if (scope != null)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 2),
                                        child: Text(
                                          scope,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: KitText.xs.style(
                                            color: colors.mutedForeground,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              spacing: 4,
                              children: state,
                            ),
                            const SizedBox(height: 8),
                            who,
                            if (actions != null) ...[
                              const Spacer(),
                              Padding(
                                padding: const EdgeInsets.only(top: 12),
                                child: actions,
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// A state's pill on a card: a mark and a word.
class _StatePill extends StatelessWidget {
  const _StatePill({required this.icon, required this.text});

  final Widget icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Container(
      height: 24,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: colors.secondary,
        borderRadius: KitRadius.pill,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: 6,
        children: [
          DefaultTextStyle.merge(
            style: TextStyle(color: colors.foreground),
            child: icon,
          ),
          Flexible(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: KitText.xs.style(
                color: colors.foreground,
                weight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A request nobody has answered yet, on either row.
class _WaitingPill extends StatelessWidget {
  const _WaitingPill();

  @override
  Widget build(BuildContext context) => _StatePill(
    icon: const KitIcon(Lucide.clock, size: 12),
    text: AppLocalizations.of(context).discoverRequestWaiting,
  );
}

/// Where a request stands, in the server's words: waiting, on its way
/// with how far along it is and how long it has left, when it's out,
/// declined, or here. Nothing for a title nobody asked for.
List<Widget> _stateOf(BuildContext context, Availability availability) {
  final l = AppLocalizations.of(context);
  final colors = MatineeTheme.of(context);
  if (availability.state == AvailabilityState.here) {
    return [
      _StatePill(
        icon: const KitIcon(Lucide.check, size: 12),
        text: l.webCatalogBadgeHere,
      ),
    ];
  }
  if (availability.state == AvailabilityState.asked) {
    return const [_WaitingPill()];
  }
  final badge = badgeOf(availability);
  final word = stateWord(availability, percent: true);
  if (badge == null || word == null) return const [];
  final eta = availability.etaSeconds;
  return [
    _StatePill(
      icon: StateGlyph(badge: badge, size: 12),
      text: stateText(word, l),
    ),
    if (availability.state == AvailabilityState.coming && eta != null)
      Text(
        l.webRequestsProgressLeft(formatSpan(eta, l)),
        style: KitText.px13.style(color: colors.mutedForeground),
      ),
  ];
}

/// Why a declined request isn't coming, and the note the admin left, each
/// with two lines of its own.
List<Widget> _declined(BuildContext context, Availability availability) {
  final reason = availability.reason;
  if (reason == null || availability.state != AvailabilityState.unavailable) {
    return const [];
  }
  final l = AppLocalizations.of(context);
  final colors = MatineeTheme.of(context);
  final note = reason.note?.trim();
  return [
    Text(
      declineText(reason, l),
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: KitText.px13.style(color: colors.mutedForeground),
    ),
    if (note != null && note.isNotEmpty)
      Text(
        note,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: KitText.px13
            .style(color: colors.foreground.withValues(alpha: .7))
            .copyWith(fontStyle: FontStyle.italic),
      ),
  ];
}

/// A waiting request: who asked and when, and Add and Decline.
class _QueueCard extends StatelessWidget {
  const _QueueCard({required this.item});

  final AdminRequestItem item;

  // In the card's dark theme, so its words read on the darkened poster.
  @override
  Widget build(BuildContext context) => _dark(
    context,
    (context) => RequestCard(
      title: item.title,
      library: item.library.id,
      scope: item.scope,
      availability: item.availability,
      state: const [_WaitingPill()],
      who: _Askers(item: item),
      actions: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          AddButton(item: item, small: true),
          DeclineButton(item: item, small: true),
        ],
      ),
    ),
  );
}

/// [build] under the theme's dark half, where a card draws, so what it
/// builds for the card takes the card's colours.
Widget _dark(BuildContext context, WidgetBuilder build) =>
    MatineeTheme.alwaysDark(context, Builder(builder: build));

/// The first few who asked, the first one's name, how many others, and
/// when the first asked.
class _Askers extends StatelessWidget {
  const _Askers({required this.item});

  final AdminRequestItem item;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final people = askers(item);
    final first = people.firstOrNull;
    if (first == null) return const SizedBox.shrink();
    final others = [for (final each in people.skip(1)) each.name];
    final faces = people.take(_faces).toList();
    final when = relativeTime(first.createdAt, l);
    return Semantics(
      container: true,
      label: [
        if (others.isEmpty)
          first.name
        else
          '${first.name}, ${l.webRequestsAlsoRequested(formatList(others, l))}',
        ?when,
      ].join(', '),
      child: ExcludeSemantics(
        child: Row(
          spacing: 10,
          children: [
            SizedBox(
              width: 24 + (faces.length - 1) * 18,
              height: 24,
              child: Stack(
                children: [
                  for (final (index, face) in faces.indexed)
                    PositionedDirectional(
                      start: index * 18,
                      child: Container(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: colors.background,
                            width: 2,
                          ),
                        ),
                        child: Avatar(
                          avatarId: face.avatarId,
                          name: face.name,
                          size: 20,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    spacing: 6,
                    children: [
                      Flexible(
                        child: Text(
                          first.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: KitText.px13.style(
                            color: colors.foreground.withValues(alpha: .9),
                          ),
                        ),
                      ),
                      if (others.isNotEmpty)
                        Text(
                          l.webRequestsOthersCount(
                            formatCount(others.length, l),
                          ),
                          style: KitText.px13.style(
                            color: colors.mutedForeground,
                          ),
                        ),
                    ],
                  ),
                  if (when != null)
                    Text(
                      when,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: KitText.px13.style(color: colors.mutedForeground),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One of the viewer's own requests, as the server says it stands: the
/// season it waits on, its state, under a declined one why, when they
/// asked, and Cancel while the server allows it. Cancel is held for Undo,
/// as an admin's answers are, rather than sent from the poster's button.
class _OwnCard extends ConsumerWidget {
  const _OwnCard({required this.item});

  final RequestItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      _dark(context, (context) => _card(context, ref));

  Widget _card(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final season = item.season;
    final availability = season?.asTitle() ?? item.availability;
    final when = relativeTime(item.createdAt, l);
    final cancels =
        item.availability.action == AvailabilityAction.cancel ||
        availability.action == AvailabilityAction.cancel;
    return RequestCard(
      title: item.title,
      library: item.library.id,
      scope: item.scope,
      availability: item.availability,
      state: [
        if (season != null)
          Text(
            seasonName(season.number, l),
            style: KitText.xs.style(color: colors.mutedForeground),
          ),
        ..._stateOf(context, availability),
        ..._declined(context, availability),
      ],
      who: when == null
          ? const SizedBox.shrink()
          : Text(
              l.discoverRequestAskedWhen(when),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: KitText.px13.style(color: colors.mutedForeground),
            ),
      actions: cancels
          ? MatineeButton(
              look: ButtonLook.secondary,
              size: ButtonSize.sm,
              leading: Lucide.x,
              label: '${l.webAskCancel}, ${item.title.name}',
              onPressed: () => unawaited(
                ref
                    .read(requestsProvider.notifier)
                    .withdraw(l, item.id, item.title.name),
              ),
              child: Text(
                l.webAskCancel,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            )
          : null,
    );
  }
}
