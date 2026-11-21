import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/toasts.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/cards.dart';
import '../../media/format.dart';
import '../../router.dart';
import '../title/title_data.dart' show titleProvider;
import 'request_sheet.dart';
import 'request_words.dart';
import 'requests_hub.dart';

/// The catalog's cards and the marks and buttons a title the server lacks
/// carries, as the Kotlin app's `CatalogCards.kt`, `Ask.kt`, and the
/// buttons of `Admin.kt`: the state as a glass mark in a poster's corner,
/// the one thing the viewer may do as a button, and the card that turns
/// into the library's when the title arrives.

/// How long the badge takes to go when a title arrives, before the card
/// becomes the library's.
const _arrival = Duration(milliseconds: 200);

/// Says [text] at the bottom of the screen, in place of whatever said
/// something before, as the web's tooltips do.
void sayAtBottom(WidgetRef ref, String text) {
  final toasts = ref.read(toastProvider)..dismiss();
  unawaited(toasts.show(text));
}

/// The glyph a state's mark draws, [size] across.
class _Glyph extends StatelessWidget {
  const _Glyph({required this.badge, required this.size});

  final CardBadge badge;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return switch (badge.glyph) {
      Glyph.ring => ProgressRing(badge.progress, size: size * 1.3),
      Glyph.clock => KitIcon(Lucide.clock, size: size),
      Glyph.calendar => KitIcon(Lucide.calendar, size: size),
      Glyph.slash => KitIcon(
        Lucide.circleSlash,
        size: size,
        color: colors.mutedForeground,
      ),
    };
  }
}

/// The round glass mark in a catalog card's corner, where a library
/// title's watched check sits, once the title has a state; nothing before,
/// so a card carries no permanent plus. [leaving] fills the ring and lets
/// it go, for an arrival, then calls [onGone].
class CatalogBadge extends StatefulWidget {
  const CatalogBadge({
    super.key,
    required this.availability,
    this.leaving = false,
    this.onGone,
    this.size = 24,
  });

  final Availability availability;
  final bool leaving;
  final VoidCallback? onGone;
  final double size;

  @override
  State<CatalogBadge> createState() => _CatalogBadgeState();
}

class _CatalogBadgeState extends State<CatalogBadge>
    with SingleTickerProviderStateMixin {
  late final _fade = AnimationController(
    vsync: this,
    duration: _arrival,
    value: 1,
  );

  @override
  void initState() {
    super.initState();
    if (widget.leaving) _leave();
  }

  @override
  void didUpdateWidget(CatalogBadge old) {
    super.didUpdateWidget(old);
    if (widget.leaving && !old.leaving) _leave();
  }

  void _leave() => unawaited(
    _fade.reverse().whenComplete(() {
      if (mounted) widget.onGone?.call();
    }),
  );

  @override
  void dispose() {
    _fade.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final availability = widget.availability;
    final CardBadge? badge = widget.leaving
        ? (glyph: Glyph.ring, progress: 1)
        : badgeOf(availability);
    if (badge == null) return const SizedBox.shrink();
    final word = stateWord(availability, percent: true);
    final label = widget.leaving
        ? l.webCatalogBadgeHere
        : word == null
        ? ''
        : stateText(word, l);
    final size = widget.size;
    return Semantics(
      label: label,
      child: AnimatedBuilder(
        animation: _fade,
        builder: (context, child) => Opacity(
          opacity: _fade.value,
          child: Transform.scale(scale: .5 + _fade.value / 2, child: child),
        ),
        child: Container(
          width: size,
          height: size,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: colors.background.withValues(alpha: .7),
            border: Border.all(color: colors.foreground.withValues(alpha: .1)),
          ),
          child: ExcludeSemantics(
            child: _Glyph(badge: badge, size: size * .58),
          ),
        ),
      ),
    );
  }
}

/// The state as a glass pill in a poster's corner: the mark's glyph with
/// its word, and the share that's in while it's on its way. Nothing for a
/// title nobody requested. With [tip], for an admin who requested it, a
/// tap says it at the bottom of the screen, as the web's tooltip does, and
/// screen readers read it with the state.
class PosterBadge extends ConsumerWidget {
  const PosterBadge({super.key, required this.availability, this.tip});

  final Availability availability;
  final String? tip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final word = stateWord(availability);
    final badge = badgeOf(availability);
    if (word == null || badge == null) return const SizedBox.shrink();
    final progress = availability.progress;
    final percent =
        availability.state == AvailabilityState.coming && progress != null
        ? formatPercent(progress, l)
        : null;
    final text = KitText.xs.style(
      color: colors.foreground,
      weight: FontWeight.w500,
    );
    final pill = Container(
      constraints: const BoxConstraints(minHeight: 28),
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        borderRadius: KitRadius.pill,
        color: colors.background.withValues(alpha: .75),
        border: Border.all(color: colors.foreground.withValues(alpha: .1)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: 6,
        children: [
          _Glyph(badge: badge, size: 14),
          Flexible(
            child: Text(
              stateText(word, l),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: text,
            ),
          ),
          if (percent != null)
            Text(
              percent,
              maxLines: 1,
              style: text.copyWith(
                color: colors.foreground.withValues(alpha: .75),
              ),
            ),
        ],
      ),
    );
    final tip = this.tip;
    if (tip == null) return pill;
    return PressIndication(
      onPressed: () => sayAtBottom(ref, tip),
      shape: KitRadius.pill,
      label: stateText(word, l),
      value: tip,
      builder: (context, state) => ExcludeSemantics(child: pill),
    );
  }
}

/// The accent dot on a title that came through the viewer's own ask,
/// until they've watched it.
class FreshDot extends StatelessWidget {
  const FreshDot({super.key});

  @override
  Widget build(BuildContext context) => Semantics(
    label: AppLocalizations.of(context).webCatalogBadgeFresh,
    child: Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: MatineeTheme.of(context).accent,
      ),
    ),
  );
}

/// A title's availability as the hub has it now, else as it was loaded.
Availability liveAvailability(
  WidgetRef ref,
  CatalogRef title,
  Availability loaded,
) =>
    ref
        .watch(requestsProvider.select((state) => state.live[refKey(title)]))
        ?.availability ??
    loaded;

/// A title the server doesn't have, the size of a [PosterCard] so it sits
/// in the same rails and grids: the poster in full colour, the state in
/// the corner and on the second line. A tap opens its page. When it
/// arrives, the badge goes and the card becomes the library's, on the same
/// poster. [detail] stands in for the year and kind while there's no
/// state, as Coming soon's day or the score does.
class CatalogCard extends ConsumerStatefulWidget {
  const CatalogCard({
    super.key,
    required this.title,
    this.detail,
    this.hereAtFirst = false,
    this.fresh = false,
    this.library,
    this.onLongPress,
  });

  final CatalogTitleSummary title;
  final CardDetail? detail;

  /// Already here when the list loaded: the library's card at once,
  /// without the badge going.
  final bool hereAtFirst;
  final bool fresh;

  /// The library the page opens it for, as a request's.
  final String? library;

  /// A long press, as a recommendation's "Not interested".
  final VoidCallback? onLongPress;

  @override
  ConsumerState<CatalogCard> createState() => _CatalogCardState();
}

class _CatalogCardState extends ConsumerState<CatalogCard> {
  /// The badge went, so the card is the library's now.
  bool _arrived = false;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final title = widget.title;
    final availability = liveAvailability(ref, title.ref, title.availability);
    final here = availability.hereAs;
    if (here != null && (widget.hereAtFirst || _arrived)) {
      return ArrivedCard(
        title: title,
        titleId: here,
        fresh:
            widget.fresh || (!widget.hereAtFirst && availability.askedBySelf),
      );
    }
    final poster = title.poster;
    final onLongPress = widget.onLongPress;
    // The state, once there is one, takes the detail's place.
    final detail = stateWord(availability, percent: true) == null
        ? widget.detail
        : null;
    return PosterCard(
      name: title.name,
      toneKey: refKey(title.ref),
      detail: cardLineText(
        title.year,
        title.ref,
        availability,
        l,
        detail: widget.detail?.text,
        named: NamedKinds.of(context),
      ),
      detailIcon: detail?.icon,
      detailLabel: detail?.label,
      art: poster == null ? null : Picture([ArtSource(poster)]),
      badge: CatalogBadge(
        availability: availability,
        leaving: here != null,
        onGone: () => setState(() => _arrived = true),
      ),
      onPressed: () =>
          context.push(catalogRoute(title.ref, library: widget.library)),
      onLongPress: onLongPress,
      longPressLabel: onLongPress == null ? null : l.titleMoreActions,
    );
  }
}

/// A title that came in through a request, as the library's card on the
/// poster the request had, so the picture doesn't change. While it's
/// [fresh], the accent dot until the viewer has watched it.
class ArrivedCard extends ConsumerWidget {
  const ArrivedCard({
    super.key,
    required this.title,
    required this.titleId,
    required this.fresh,
  });

  final CatalogTitleSummary title;
  final String titleId;
  final bool fresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(titleProvider(titleId)).value;
    final poster = title.poster;
    if (summary == null) {
      return PosterCard(
        name: title.name,
        toneKey: refKey(title.ref),
        detail: yearLine(context, title.year, title.ref.kind),
        art: poster == null ? null : Picture([ArtSource(poster)]),
        onPressed: () => context.push(Routes.title(titleId)),
      );
    }
    final card = TitleCard(
      title: summary.summary,
      detail: yearLine(context, summary.year, summary.kind),
      poster: poster ?? summary.images.poster,
    );
    if (!fresh || summary.watched) return card;
    return Stack(
      children: [
        card,
        const PositionedDirectional(top: 10, end: 10, child: FreshDot()),
      ],
    );
  }
}

/// A title from Discover, Browse, or a related row: the library's card
/// when the viewer can watch it, else a catalog card with what the stream
/// says now, which turns into the library's card in place when it
/// arrives. [recommended] offers "Not interested" on a long press.
class CatalogTitleCard extends ConsumerWidget {
  const CatalogTitleCard({
    super.key,
    required this.catalogRef,
    required this.name,
    required this.year,
    required this.poster,
    required this.availability,
    this.library,
    this.detail,
    this.recommended = false,
  });

  /// The catalog's [CatalogBrowseTitle] or [RelatedTitle], as one card.
  factory CatalogTitleCard.browse(
    CatalogBrowseTitle item, {
    CardDetail? detail,
    bool recommended = false,
  }) => CatalogTitleCard(
    catalogRef: item.ref,
    name: item.name,
    year: item.year,
    poster: item.poster,
    availability: item.availability,
    library: item.title,
    detail: detail,
    recommended: recommended,
  );

  factory CatalogTitleCard.related(RelatedTitle item) => CatalogTitleCard(
    catalogRef: item.ref,
    name: item.name,
    year: item.year,
    poster: item.poster,
    availability: item.availability,
    library: item.title,
  );

  final CatalogRef catalogRef;
  final String name;
  final int? year;
  final Artwork? poster;
  final Availability availability;

  /// The library's title, when the server has one.
  final TitleSummary? library;
  final CardDetail? detail;
  final bool recommended;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final now = liveAvailability(ref, catalogRef, availability);
    final library = this.library;
    if (library != null && now.hereAs == library.id) {
      return TitleCard.withDetail(
        title: library,
        detail:
            detail ??
            switch (yearLine(context, library.year, library.kind)) {
              final line? => CardDetail(line),
              null => null,
            },
      );
    }
    final summary = CatalogTitleSummary(
      ref: catalogRef,
      name: name,
      year: year,
      poster: poster,
      availability: availability,
    );
    return CatalogCard(
      title: summary,
      detail: detail,
      onLongPress: recommended
          ? () => showNotInterested(context, summary)
          : null,
    );
  }
}

/// A season of a show the server lacks, by its poster, with its own state
/// in the corner and on the second line. While it can be requested, a tap
/// calls [onRequest], which opens the request sheet with that season
/// ticked.
class CatalogSeasonCard extends StatelessWidget {
  const CatalogSeasonCard({
    super.key,
    required this.show,
    required this.showName,
    required this.showPoster,
    required this.season,
    required this.onRequest,
  });

  final CatalogRef show;
  final String showName;
  final Artwork? showPoster;
  final CatalogSeason season;
  final VoidCallback onRequest;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final availability = season.availability.asTitle();
    final poster = season.poster ?? showPoster;
    final requests = posterAction(availability) == PosterAction.request;
    return PosterCard(
      name: seasonName(season.number, l),
      toneKey: '${refKey(show)}:${season.number}',
      detail: seasonLineText(season, l),
      art: poster == null ? null : Picture([ArtSource(poster)]),
      badge: CatalogBadge(availability: availability),
      absentLabel: l.webCatalogNotHere,
      onPressed: requests ? onRequest : null,
    );
  }
}

/// One title the viewer asked for, as its state stands: the catalog card
/// while it isn't here, then the library's card, with the accent dot while
/// [fresh]. A show that's partly here and still waits for a season is the
/// library's poster with that season's state.
class AskedCard extends ConsumerStatefulWidget {
  const AskedCard({super.key, required this.item, this.fresh = false});

  final RequestItem item;
  final bool fresh;

  @override
  ConsumerState<AskedCard> createState() => _AskedCardState();
}

class _AskedCardState extends ConsumerState<AskedCard> {
  /// Already here when the list loaded: the library's card at once.
  late final bool _hereAtFirst =
      widget.item.availability.state == AvailabilityState.here;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final item = widget.item;
    final title = item.title;
    final entry = ref.watch(
      requestsProvider.select((state) => state.live[refKey(title.ref)]),
    );
    final availability = entry?.availability ?? item.availability;
    final here = availability.hereAs;
    final waiting = item.season;
    final pending = waiting == null
        ? null
        : entry?.seasons.where((s) => s.number == waiting.number).firstOrNull ??
              waiting;
    if (here != null &&
        pending != null &&
        pending.state != AvailabilityState.here) {
      final state = pending.asTitle();
      final poster = title.poster;
      return PosterCard(
        name: title.name,
        toneKey: refKey(title.ref),
        detail: nextSeasonLine(pending.number, state, l),
        art: poster == null ? null : Picture([ArtSource(poster)]),
        badge: CatalogBadge(availability: state),
        onPressed: () => context.push(Routes.title(here)),
      );
    }
    return CatalogCard(
      title: title,
      hereAtFirst: _hereAtFirst,
      fresh: widget.fresh,
      library: item.library.id,
    );
  }
}

/// The title's one button: "Request" or "Cancel request", whichever the
/// server's action allows, else nothing. Cancelling happens here; a
/// request goes to [onRequest], which requests at once or opens the
/// request sheet. A Request the viewer can't make, out of requests, with
/// requests off, or declined, stays dimmed, and a tap says why at the
/// bottom of the screen ([dimmedText]). [plain] draws it off a picture, as
/// an ordinary button rather than glass; [page] draws it leading a catalog
/// page's row, as large as Play is in a library title's. [action] and
/// [label] stand in for the server's, for "Request more".
class RequestButton extends ConsumerWidget {
  const RequestButton({
    super.key,
    required this.availability,
    required this.name,
    required this.onRequest,
    this.busy = false,
    this.action,
    this.label,
    this.plain = false,
    this.page = false,
  });

  final Availability availability;
  final String name;
  final VoidCallback onRequest;
  final bool busy;
  final PosterAction? action;
  final String? label;
  final bool plain;
  final bool page;

  /// Whether it draws anything for [availability].
  static bool shows(Availability availability) => hasPosterButton(availability);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final blocked = action == null && requestBlocked(availability) != null;
    final act =
        action ??
        posterAction(availability) ??
        (blocked ? PosterAction.request : null);
    if (act == null) return const SizedBox.shrink();
    final why = blocked
        ? dimmedText(availability, l, admin: ref.watch(isAdminProvider))
        : null;
    final words = act == PosterAction.request && label != null
        ? label!
        : posterActionText(act, l);
    return MatineeButton(
      size: page ? ButtonSize.xl : ButtonSize.standard,
      look: act == PosterAction.request
          ? ButtonLook.primary
          : plain || page
          ? ButtonLook.secondary
          : ButtonLook.glass,
      leading: act == PosterAction.request ? Lucide.plus : Lucide.x,
      dimmed: busy || blocked,
      label: why == null ? words : '$words. $why',
      onPressed: busy
          ? null
          : () {
              if (blocked) {
                if (why != null && why.trim().isNotEmpty) sayAtBottom(ref, why);
                return;
              }
              switch (act) {
                case PosterAction.request:
                  onRequest();
                case PosterAction.cancel:
                  final id = availability.requestId;
                  if (id != null) {
                    unawaited(
                      ref.read(requestsProvider.notifier).cancel(l, id, name),
                    );
                  }
              }
            },
      child: Text(
        words,
        textAlign: TextAlign.center,
        maxLines: page ? 1 : 2,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// For an admin, the waiting request behind a title's or a season's
/// "Requested", from the queue the whole app streams. Null for anyone else
/// and while nothing waits; still there while an answer waits out its
/// Undo, so check [RequestsState.held] before offering Add and Decline.
AdminRequestItem? waitingRequest(WidgetRef ref, Availability availability) {
  if (!ref.watch(isAdminProvider)) return null;
  final id = availability.requestId;
  if (id == null || availability.state != AvailabilityState.asked) return null;
  final queue = ref.watch(requestsProvider.select((state) => state.queue));
  return queue?.waiting.where((item) => item.id == id).firstOrNull;
}

/// Who requested it, first, and everyone else after.
List<AdminRequestItemFollower> askers(AdminRequestItem item) =>
    [...item.followers]..sort((a, b) => a.createdAt.compareTo(b.createdAt));

/// Who requested it, for a tap on the poster's badge: "anna requested this
/// 2 days ago", or "anna and ben requested this", with what a show's
/// request covers on a line under it.
String requestedText(AdminRequestItem item, AppLocalizations l) {
  final people = askers(item);
  final who = switch (people) {
    [] => l.webRequestsBadgeWaiting,
    [final one] => l.webRequestsBadgeRequested(
      one.name,
      relativeTime(one.createdAt, l) ?? '',
    ),
    _ => l.webRequestsBadgeRequestedMany(
      formatList([for (final each in people) each.name], l),
    ),
  };
  return [who, ?scopeText(item.scope, l)].join('\n');
}

/// An admin's Add for a waiting request, where everyone else's Request
/// sits and in its style, held for the toast's Undo as the queue holds it.
/// [page] draws it leading a catalog page's row, as large as Play. When
/// the request could go to another library, it says "Add to Films" and
/// has the "Goes to" menu beside it, as the web's.
class AddButton extends ConsumerWidget {
  const AddButton({super.key, required this.item, this.page = false});

  final AdminRequestItem item;
  final bool page;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final size = page ? ButtonSize.xl : ButtonSize.standard;
    final choice = choosesLibrary(item);
    final library = ref.watch(
      requestsProvider.select((state) => state.goesTo(item).name),
    );
    final radius = Radius.circular(size.radius);
    final add = MatineeButton(
      size: size,
      leading: Lucide.check,
      label: choice
          ? l.webRequestsAddTo(library)
          : l.webRequestsAddNamed(item.title.name),
      shape: choice ? BorderRadiusDirectional.horizontal(start: radius) : null,
      onPressed: () => unawaited(
        ref.read(requestsProvider.notifier).answer(l, item, const AddAnswer()),
      ),
      child: Text(
        choice ? l.webRequestsAddTo(library) : l.webRequestsAdd,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w600),
      ),
    );
    if (!choice) return add;
    return Row(
      mainAxisSize: page ? MainAxisSize.max : MainAxisSize.min,
      spacing: 1,
      children: [
        if (page) Expanded(child: add) else Flexible(child: add),
        MatineeButton(
          size: size,
          leading: Lucide.chevronDown,
          label: l.webRequestsGoesToChange(item.title.name, library),
          shape: BorderRadiusDirectional.horizontal(end: radius),
          onPressed: () => unawaited(showGoesToSheet(context, item)),
        ),
      ],
    );
  }
}

/// "Goes to": the libraries a waiting request could go to, the one it
/// goes to now ticked, each with the connection that fills it. The choice
/// is kept by request and only sent with Add.
Future<void> showGoesToSheet(BuildContext context, AdminRequestItem item) {
  final l = AppLocalizations.of(context);
  return Sheet.show<void>(
    context,
    dismissLabel: l.commonCancel,
    builder: (sheet) => Consumer(
      builder: (context, ref, _) {
        final current = ref.watch(
          requestsProvider.select((state) => state.goesTo(item).id),
        );
        return Sheet(
          title: l.webRequestsGoesToTitle,
          description: item.title.name,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final library in item.destinations)
                RadioRow(
                  label: library.name,
                  detail: library.connection ?? l.webRequestsNoConnection,
                  selected: library.id == current,
                  onPressed: () {
                    ref
                        .read(requestsProvider.notifier)
                        .move(item.id, library.selected ? null : library.id);
                    Navigator.of(sheet).pop();
                  },
                ),
            ],
          ),
        );
      },
    ),
  );
}

/// The quiet button beside [AddButton], opening the Decline sheet.
class DeclineButton extends ConsumerWidget {
  const DeclineButton({super.key, required this.item, this.page = false});

  final AdminRequestItem item;
  final bool page;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    return MatineeButton(
      size: page ? ButtonSize.xl : ButtonSize.standard,
      look: ButtonLook.ghost,
      onPressed: () => unawaited(showDeclineSheet(context, item)),
      child: Text(
        l.webRequestsDecline,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w600),
      ),
    );
  }
}
