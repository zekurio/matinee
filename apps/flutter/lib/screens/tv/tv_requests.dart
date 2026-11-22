import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/failure_text.dart';
import '../../core/permissions.dart';
import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/server_text.dart';
import '../../media/artwork.dart';
import '../../media/avatar.dart';
import '../../media/format.dart' show seasonName;
import '../../router.dart';
import '../requests/catalog_cards.dart';
import '../requests/request_cards.dart'
    show requestStateIcon, requestStateLook, requestStateText;
import '../requests/request_words.dart';
import '../requests/requests_data.dart';
import '../requests/requests_hub.dart';
import 'tv_browse.dart' show TvGridHeader;
import 'tv_media.dart';

/// Requests on a TV: the questions the TV asks where the phone offers Undo,
/// since a TV's toast can't take focus, what Select on a request offers, the
/// request card with its state, and the overview.

// ---------------------------------------------------------------------------
// The questions.

/// Asks before the viewer takes back their own request for [name], focus
/// on Keep request so a stray Select keeps it. True to cancel.
Future<bool> confirmTvCancel(BuildContext context, String name) async {
  final l = AppLocalizations.of(context);
  final sure = await showTvPanel<bool>(
    context,
    title: l.tvRequestsCancelTitle(name),
    description: l.tvRequestsCancelDescription,
    builder: (panel) => [
      TvListItem(
        title: l.webAskCancel,
        icon: Lucide.x,
        quiet: true,
        destructive: true,
        onPressed: () => Navigator.of(panel).pop(true),
      ),
      TvListItem(
        title: l.tvRequestsKeep,
        icon: Lucide.check,
        quiet: true,
        autofocus: true,
        onPressed: () => Navigator.of(panel).pop(false),
      ),
    ],
  );
  return sure ?? false;
}

/// Decline [item], with why: one of the server's reasons, which has focus
/// first, and a note for whoever asked, which the remote can pass by. With
/// [giveUp], the same question gives up on an accepted request, its reason
/// fixed, with focus on Cancel. The answer goes at once, since the
/// question stands in for Undo. True once it's given.
Future<bool> showTvDecline(
  BuildContext context,
  AdminRequestItem item, {
  bool giveUp = false,
}) async {
  final l = AppLocalizations.of(context);
  final keeps = item.connection;
  final answered = await showTvPanel<bool>(
    context,
    title: giveUp
        ? l.webRequestsGiveUpTitle(item.title.name)
        : l.webRequestsDeclineTitle(item.title.name),
    description: giveUp
        // A by-hand connection holds nothing to keep.
        ? keeps != null && keeps.reportsProgress
              ? l.webRequestsGiveUpKeeps(keeps.name)
              : l.webRequestsGiveUpTurnsUp
        : null,
    builder: (panel) => [_DeclineBody(item: item, giveUp: giveUp)],
  );
  return answered ?? false;
}

class _DeclineBody extends ConsumerStatefulWidget {
  const _DeclineBody({required this.item, required this.giveUp});

  final AdminRequestItem item;
  final bool giveUp;

  @override
  ConsumerState<_DeclineBody> createState() => _DeclineBodyState();
}

class _DeclineBodyState extends ConsumerState<_DeclineBody> {
  String? _reason;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  void _submit(AppLocalizations l) {
    final text = _note.text.trim();
    final note = text.isEmpty ? null : text;
    final QueueAnswer answer;
    if (widget.giveUp) {
      answer = GiveUpAnswer(note);
    } else {
      final reason = _reason;
      if (reason == null) return;
      answer = DeclineAnswer(reason, note);
    }
    final hub = ref.read(requestsProvider.notifier);
    Navigator.of(context).pop(true);
    unawaited(hub.answer(l, widget.item, answer, undo: false));
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final item = widget.item;
    final giveUp = widget.giveUp;
    final askedBy = [for (final each in item.followers) each.name];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 4,
      children: [
        TvListHeading(l.webRequestsDeclineReason),
        // Only one reason fits giving up, so it's said, not offered.
        if (giveUp)
          TvListItem(
            title: adminReasonText(DeclineReason.notFound, l),
            quiet: true,
            checked: true,
            enabled: false,
            onPressed: null,
          )
        else
          for (final (index, code) in WaitingDeclineReason.all.indexed)
            TvListItem(
              title: adminReasonText(code, l),
              quiet: true,
              checked: _reason == code,
              autofocus: index == 0,
              onPressed: () => setState(() => _reason = code),
            ),
        TvListHeading(
          askedBy.isEmpty
              ? l.webRequestsDeclineNote
              : l.webRequestsDeclineNoteFor(formatList(askedBy, l)),
        ),
        TvTextField(
          controller: _note,
          placeholder: l.webRequestsDeclineNotePlaceholder,
        ),
        const SizedBox(height: 12),
        TvListItem(
          title: giveUp
              ? l.webRequestsGiveUpSubmit
              : l.webRequestsDeclineSubmit,
          icon: giveUp ? Lucide.circleSlash : Lucide.x,
          destructive: true,
          enabled: giveUp || _reason != null,
          onPressed: () => _submit(l),
        ),
        TvListItem(
          title: l.webRequestsDeclineCancel,
          icon: Lucide.arrowLeft,
          quiet: true,
          autofocus: giveUp,
          onPressed: () => Navigator.of(context).pop(false),
        ),
      ],
    );
  }
}

/// "Goes to": the libraries a waiting request could go to, the one it goes
/// to now ticked, each with what fills it. Kept by request, and only sent
/// with Add.
Future<void> showTvGoesTo(BuildContext context, AdminRequestItem item) async {
  final l = AppLocalizations.of(context);
  final container = ProviderScope.containerOf(context, listen: false);
  final current = container.read(requestsProvider).goesTo(item).id;
  final picked = await showTvPicker<String>(
    context,
    title: l.webRequestsGoesToTitle,
    description: item.title.name,
    current: current,
    options: [
      for (final library in item.destinations)
        TvOption(
          library.id,
          library.name,
          detail: library.connection ?? l.webRequestsNoConnection,
        ),
    ],
  );
  if (picked == null) return;
  final selected = item.destinations.any(
    (each) => each.id == picked && each.selected,
  );
  container
      .read(requestsProvider.notifier)
      .move(item.id, selected ? null : picked);
}

/// What the connection reported about [item], label over value as the
/// server words them, each a row focus can rest on to read the rest.
Future<void> showTvDiagnostics(BuildContext context, AdminRequestItem item) {
  final l = AppLocalizations.of(context);
  return showTvPanel<void>(
    context,
    title: l.webRequestsDiagnostics,
    description: [item.title.name, ?item.connection?.name].join(' · '),
    builder: (panel) => [
      for (final entry in item.diagnostics)
        TvListItem(
          title: entry.label,
          subtitle: entry.value,
          subtitleLines: 4,
          quiet: true,
          onPressed: null,
        ),
    ],
  );
}
// ---------------------------------------------------------------------------
// What Select on a request offers.

/// A request's title: its library page once it's here, its catalog page
/// while it isn't.
String requestRoute(
  CatalogTitleSummary title,
  String library,
  Availability availability,
) {
  final here = availability.libraryTitleId;
  return here != null
      ? Routes.title(here)
      : catalogRoute(title.ref, library: library);
}

/// Whether the viewer may still take [item] back, as the server says.
bool cancels(RequestItem item, Availability now) =>
    now.action == AvailabilityAction.cancel ||
    item.season?.action == AvailabilityAction.cancel;

/// What a card's panel goes on from once it closes: the root navigator's
/// overlay, which outlives the card. A live list can rebuild the card
/// under an open panel, and the next question shouldn't fail for it.
BuildContext _host(BuildContext context) =>
    Navigator.of(context, rootNavigator: true).overlay!.context;

/// One of the viewer's own requests: with nothing to take back, its title
/// at once; else a panel with Open title and Cancel request, which asks
/// first. A cancel leaves the lists at once.
Future<void> openTvMine(
  BuildContext context,
  RequestItem item,
  Availability now,
) async {
  final route = requestRoute(item.title, item.library.id, now);
  if (!cancels(item, now)) {
    unawaited(context.push(route));
    return;
  }
  final l = AppLocalizations.of(context);
  final container = ProviderScope.containerOf(context, listen: false);
  final router = GoRouter.of(context);
  final host = _host(context);
  final picked = await showTvPanel<_Pick>(
    context,
    title: item.title.name,
    description: yearKind(item.title.year, item.title.ref.kind, l),
    builder: (panel) => [
      TvListItem(
        title: l.webRequestsOpenTitle,
        icon: Lucide.info,
        quiet: true,
        autofocus: true,
        onPressed: () => Navigator.of(panel).pop(_Pick.open),
      ),
      TvListItem(
        title: l.webAskCancel,
        icon: Lucide.x,
        quiet: true,
        onPressed: () => Navigator.of(panel).pop(_Pick.cancel),
      ),
    ],
  );
  if (!host.mounted) return;
  switch (picked) {
    case _Pick.open:
      unawaited(router.push(route));
    case _Pick.cancel:
      if (!await confirmTvCancel(host, item.title.name)) return;
      unawaited(
        container
            .read(requestsProvider.notifier)
            .withdraw(l, item.id, item.title.name, undo: false),
      );
    default:
  }
}

enum _Pick {
  open,
  cancel,
  add,
  goesTo,
  decline,
  retry,
  giveUp,
  addAfterAll,
  allowAgain,
  diagnostics,
}

/// A request of an admin's queue in [state]: what that state allows, its
/// title's page, and what the connection reports. Add and the answers to a
/// declined request go at once; Decline and Give up ask first. [onAnswered]
/// runs once an answer is given, as an answered one leaving Done's pages.
Future<void> openTvQueued(
  BuildContext context,
  AdminRequestItem item,
  RequestState state, {
  VoidCallback? onAnswered,
}) async {
  final l = AppLocalizations.of(context);
  final container = ProviderScope.containerOf(context, listen: false);
  final hub = container.read(requestsProvider.notifier);
  final requests = container.read(requestsProvider);
  final router = GoRouter.of(context);
  final host = _host(context);
  Widget row(_Pick pick, String icon, String title, {String? value}) => Builder(
    builder: (panel) => TvListItem(
      title: title,
      icon: icon,
      quiet: true,
      trailing: value == null ? null : TvListValue(value),
      onPressed: () => Navigator.of(panel).pop(pick),
    ),
  );
  final goes = requests.goesTo(item);
  final picked = await showTvPanel<_Pick>(
    context,
    title: item.title.name,
    description: [
      requestStateText(state, l, progress: _progressOf(item, state)),
      goes.name,
      goes.connection ?? l.webRequestsNoConnection,
    ].join(' · '),
    builder: (panel) => [
      ...switch (state) {
        RequestState.waiting => [
          row(_Pick.add, Lucide.check, l.webRequestsAdd),
          if (choosesLibrary(item))
            row(
              _Pick.goesTo,
              Lucide.libraryBig,
              l.webRequestsGoesToTitle,
              value: goes.name,
            ),
          row(_Pick.decline, Lucide.x, l.webRequestsDecline),
        ],
        RequestState.needsAttention => [
          row(_Pick.retry, Lucide.rotateCw, l.webRequestsRetry),
          row(_Pick.giveUp, Lucide.circleSlash, l.webRequestsGiveUp),
        ],
        RequestState.onTheWay => [
          row(_Pick.giveUp, Lucide.circleSlash, l.webRequestsGiveUp),
        ],
        RequestState.declined => [
          row(_Pick.addAfterAll, Lucide.check, l.webRequestsAddAfterAll),
          row(_Pick.allowAgain, Lucide.lockOpen, l.webRequestsAllowAgain),
        ],
        RequestState.here => const <Widget>[],
      },
      row(_Pick.open, Lucide.info, l.webRequestsOpenTitle),
      if (item.diagnostics.isNotEmpty)
        row(_Pick.diagnostics, Lucide.activity, l.webRequestsDiagnostics),
    ],
  );
  if (picked == null || !host.mounted) return;
  void answer(QueueAnswer answer) {
    onAnswered?.call();
    unawaited(hub.answer(l, item, answer, undo: false));
  }

  switch (picked) {
    case _Pick.add:
      answer(const AddAnswer());
    case _Pick.goesTo:
      await showTvGoesTo(host, item);
    case _Pick.decline:
      if (await showTvDecline(host, item)) onAnswered?.call();
    case _Pick.retry:
      unawaited(hub.retry(l, item));
    case _Pick.giveUp:
      if (await showTvDecline(host, item, giveUp: true)) {
        onAnswered?.call();
      }
    case _Pick.addAfterAll:
      answer(const AddAfterAllAnswer());
    case _Pick.allowAgain:
      answer(const AllowAgainAnswer());
    case _Pick.open:
      unawaited(
        router.push(
          requestRoute(item.title, item.library.id, item.availability),
        ),
      );
    case _Pick.diagnostics:
      await showTvDiagnostics(host, item);
    case _Pick.cancel:
  }
}

// ---------------------------------------------------------------------------
// The words a request's card says.

/// The share that's in, for a request on its way whose server knows it.
double? _progressOf(AdminRequestItem item, RequestState state) =>
    state == RequestState.onTheWay ? item.availability.progress : null;

/// How far along a request on its way is, in the server's words, past the
/// share its badge has: the time left, when it's out, or what it waits on.
String? _progressText(AdminRequestItem item, AppLocalizations l) {
  final availability = item.availability;
  final eta = availability.etaSeconds;
  if (availability.state == AvailabilityState.release) {
    final day = parseDay(availability.releaseDate);
    return day == null
        ? l.webRequestsProgressNotOut
        : l.webRequestsProgressRelease(formatShortDay(day, l));
  } else if (availability.progress != null) {
    return eta == null ? null : l.webRequestsProgressLeft(formatSpan(eta, l));
  } else if (availability.stillLooking) {
    return l.webRequestsProgressLooking;
  } else if (item.fulfilmentState == FulfilmentState.queued) {
    return l.webRequestsProgressQueued;
  } else if (item.connection?.reportsProgress == false) {
    return l.webRequestsProgressByHand;
  }
  return l.webRequestsProgressSent;
}

/// What a queue card says under its badge, and whether it's a problem:
/// where a waiting one goes, why one needs attention, how far one on its
/// way is, or what became of a done one, with the admin's note.
({String text, bool problem}) queueLine(
  RequestsState requests,
  AdminRequestItem item,
  RequestState state,
  AppLocalizations l,
) {
  switch (state) {
    case RequestState.waiting:
      final goes = requests.goesTo(item);
      final connection = goes.connection;
      return (
        text: [goes.name, connection ?? l.webRequestsNoConnection].join(' · '),
        problem: connection == null,
      );
    case RequestState.needsAttention:
      return (
        text: item.error?.serverWords(l) ?? l.webRequestsAttentionUnknown,
        problem: true,
      );
    case RequestState.onTheWay:
      return (
        text: [?_progressText(item, l), item.library.name].join(' · '),
        problem: false,
      );
    case RequestState.declined:
      final gaveUp = item.reason == DeclineReason.notFound;
      final at = relativeTime(item.declinedAt, l);
      final reason = item.reason;
      final note = item.note?.trim();
      return (
        text: [
          [
            switch ((gaveUp, at)) {
              (true, final at?) => l.webRequestsDoneGaveUp(at),
              (false, final at?) => l.webRequestsDoneDeclined(at),
              (true, null) => l.webRequestsDoneGaveUpUndated,
              (false, null) => l.webRequestsDoneDeclinedUndated,
            },
            if (reason != null && !gaveUp) adminReasonText(reason, l),
          ].join(' · '),
          if (note != null && note.isNotEmpty) '“$note”',
        ].join(' '),
        problem: false,
      );
    case RequestState.here:
      final arrived = relativeTime(item.arrivedAt, l);
      return (
        text: [
          if (arrived != null) l.webRequestsDoneArrived(arrived),
          item.library.name,
        ].join(' · '),
        problem: false,
      );
  }
}

/// Who asked for [item], the first and how many more, and when the first
/// did: nothing when nobody's left asking.
List<String> askedText(AdminRequestItem item, AppLocalizations l) {
  final people = askers(item);
  final first = people.firstOrNull;
  if (first == null) return const [];
  return [
    people.length > 1
        ? '${first.name} ${l.webRequestsOthersCount(formatCount(people.length - 1, l))}'
        : first.name,
    ?relativeTime(first.createdAt, l),
  ];
}

/// What one of the viewer's own requests says under its badge: when it's
/// out, how long is left, when it arrived, or why it was declined, with
/// the admin's note.
String? mineLine(
  RequestItem item,
  Availability availability,
  AppLocalizations l,
) {
  switch (availability.state) {
    case AvailabilityState.release:
      final word = stateWord(availability);
      return word == null ? null : stateText(word, l);
    case AvailabilityState.coming:
      final eta = availability.etaSeconds;
      return eta == null ? null : l.webRequestsProgressLeft(formatSpan(eta, l));
    case AvailabilityState.here:
      final arrived = relativeTime(item.arrivedAt, l);
      return arrived == null ? null : l.webRequestsDoneArrived(arrived);
    case AvailabilityState.unavailable:
      return declinedText(availability, l);
    default:
      return null;
  }
}

/// Why a declined request isn't coming, and the note the admin left.
String? declinedText(Availability availability, AppLocalizations l) {
  final reason = availability.reason;
  if (reason == null || availability.state != AvailabilityState.unavailable) {
    return null;
  }
  final note = reason.note?.trim();
  return [
    declineText(reason, l),
    if (note != null && note.isNotEmpty) '“$note”',
  ].join(' ');
}

// ---------------------------------------------------------------------------
// A request's card.

/// A request's state as its badge, at a TV's size, in the phone's words
/// and colours.
class TvRequestBadge extends StatelessWidget {
  const TvRequestBadge({super.key, required this.state, this.progress});

  final RequestState state;
  final double? progress;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final (:fill, :edge, :mark, :ink) = requestStateLook(
      state,
      MatineeTheme.of(context),
    );
    final icon = requestStateIcon(state);
    return TvBadge(
      text: requestStateText(state, l, progress: progress),
      icon: icon,
      glyph: icon == null
          ? ProgressRing(progress, size: TvBadge.iconSize + 2)
          : null,
      mark: mark,
      ink: ink,
      fill: fill,
      edge: edge,
    );
  }
}

/// A request as a wide card, in Discover's Recent requests row and the
/// requests overview, as Seerr has them: the poster beside the year and
/// kind, the name, the state's badge, the state's own line, and who asked.
/// One of the queue's in its [RequestState], or one of the viewer's own.
/// Focus tells [onFocus] its name and the rest for the page's focus line;
/// Select opens what can be done about it.
class TvRequestCard extends ConsumerWidget {
  const TvRequestCard.queued(
    QueuedRequest this.queued, {
    super.key,
    this.onAnswered,
    this.width = TvInfoCards.rowWidth,
    this.focusNode,
    this.onFocus,
  }) : mine = null;

  const TvRequestCard.mine(
    RequestItem this.mine, {
    super.key,
    this.width = TvInfoCards.rowWidth,
    this.focusNode,
    this.onFocus,
  }) : queued = null,
       onAnswered = null;

  final QueuedRequest? queued;
  final RequestItem? mine;

  /// Runs once an answer is given, as one leaving Done's pages.
  final VoidCallback? onAnswered;

  /// A row's card width; null fills a grid's cell.
  final double? width;
  final FocusNode? focusNode;
  final ValueChanged<FocusedItem>? onFocus;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (queued case (:final item, :final state)) {
      return _queued(context, ref, item, state);
    }
    return _mine(context, ref, mine!);
  }

  Widget _queued(
    BuildContext context,
    WidgetRef ref,
    AdminRequestItem item,
    RequestState state,
  ) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final title = item.title;
    final requests = ref.watch(requestsProvider);
    final line = queueLine(requests, item, state, l);
    final asked = askedText(item, l);
    final first = askers(item).firstOrNull;
    final heading = [
      yearKind(title.year, title.ref.kind, l),
      ?scopeText(item.scope, l),
    ];
    final progress = _progressOf(item, state);
    final badge = requestStateText(state, l, progress: progress);
    final onFocus = this.onFocus;
    return _Card(
      title: title,
      width: width,
      focusNode: focusNode,
      label: [title.name, ...heading, badge, line.text, ...asked].join(', '),
      onPressed: () =>
          unawaited(openTvQueued(context, item, state, onAnswered: onAnswered)),
      onFocused: onFocus == null
          ? null
          : () => onFocus(
              FocusedItem(
                name: title.name,
                facts: [...heading, badge, ...asked],
              ),
            ),
      heading: heading.join(' · '),
      badge: TvRequestBadge(state: state, progress: progress),
      line: line.text,
      lineColor: line.problem ? colors.danger : null,
      who: asked.isEmpty
          ? null
          : Row(
              spacing: 8,
              children: [
                if (first != null)
                  Avatar(avatarId: first.avatarId, name: first.name, size: 22),
                Flexible(child: _CardText(asked.join(' · '))),
              ],
            ),
    );
  }

  Widget _mine(BuildContext context, WidgetRef ref, RequestItem item) {
    final l = AppLocalizations.of(context);
    final title = item.title;
    final now = liveAvailability(ref, title.ref, item.availability);
    final season = item.season;
    final availability = season?.asTitle() ?? now;
    final state = ownState(availability);
    final progress = state == RequestState.onTheWay
        ? availability.progress
        : null;
    final heading = [
      yearKind(title.year, title.ref.kind, l),
      ?scopeText(item.scope, l),
      if (season != null) seasonName(season.number, l),
    ];
    final badge = state == null
        ? null
        : requestStateText(state, l, progress: progress);
    final line = mineLine(item, availability, l);
    final when = relativeTime(item.createdAt, l);
    final asked = when == null ? null : l.discoverRequestAskedWhen(when);
    final onFocus = this.onFocus;
    return _Card(
      title: title,
      width: width,
      focusNode: focusNode,
      label: [title.name, ...heading, ?badge, ?line, ?asked].join(', '),
      onPressed: () => unawaited(openTvMine(context, item, now)),
      onFocused: onFocus == null
          ? null
          : () => onFocus(
              FocusedItem(name: title.name, facts: [...heading, ?badge, ?line]),
            ),
      heading: heading.join(' · '),
      badge: state == null
          ? null
          : TvRequestBadge(state: state, progress: progress),
      line: line,
      who: asked == null ? null : _CardText(asked),
    );
  }
}

/// A request card's frame: [heading], the name, [badge], [line], and
/// [who] at the foot.
class _Card extends StatelessWidget {
  const _Card({
    required this.title,
    required this.width,
    required this.focusNode,
    required this.label,
    required this.onPressed,
    required this.onFocused,
    required this.heading,
    required this.badge,
    required this.line,
    required this.who,
    this.lineColor,
  });

  final CatalogTitleSummary title;
  final double? width;
  final FocusNode? focusNode;
  final String label;
  final VoidCallback onPressed;
  final VoidCallback? onFocused;
  final String heading;
  final Widget? badge;
  final String? line;
  final Color? lineColor;
  final Widget? who;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final poster = title.poster;
    final badge = this.badge;
    final line = this.line;
    final who = this.who;
    return TvInfoCard(
      toneKey: refKey(title.ref),
      width: width,
      focusNode: focusNode,
      label: label,
      onPressed: onPressed,
      onFocused: onFocused,
      poster: poster == null ? null : Picture([ArtSource(poster)]),
      // The smallest size, stretched, reads as the poster's colours
      // without a blur for the TV to draw.
      backdrop: poster == null
          ? null
          : Picture([ArtSource(poster, largest: ArtworkSize.thumb)]),
      children: [
        _CardText(heading),
        Text(
          title.name,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TvType.facts
              .style(color: colors.foreground)
              .copyWith(
                fontWeight: FontWeight.w700,
                fontVariations: const [FontVariation('wght', 700)],
              ),
        ),
        if (badge != null)
          Padding(padding: const EdgeInsets.only(top: 8), child: badge),
        if (line != null && line.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: _CardText(line, color: lineColor),
          ),
        if (who != null) ...[const Spacer(), who],
      ],
    );
  }
}

/// One line of a request card, muted unless [color] says otherwise.
class _CardText extends StatelessWidget {
  const _CardText(this.text, {this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) => Text(
    text,
    maxLines: 1,
    overflow: TextOverflow.ellipsis,
    style: TvType.caption.style(
      color: color ?? MatineeTheme.of(context).mutedForeground,
    ),
  );
}

// ---------------------------------------------------------------------------
// The overview.

/// The rows of the overview in its focus memory, beside the grid's own
/// [TvGrid.row].
abstract final class _Rows {
  static const header = 'header';
  static const addAll = 'add-all';
  static const empty = 'empty';
  static const search = 'search';
}

/// The requests overview on a TV, from the Recent requests row's See all
/// card. With [queue], for whoever runs it, everyone's requests in one grid,
/// in the order the shared code gives them: waiting, needs attention, on
/// the way, then done, read on a page at a time as focus moves down. Anyone
/// else, whatever the path, gets their own: in progress first, then the
/// rest. Each card carries its state; the header says how many are in each
/// state that has any, in plain words, and offers Add all while more than
/// one waits; the line under it names the focused card. Select opens what
/// the card's state allows. Focus starts on the first card, Down from the
/// header lands there, and a card that leaves hands focus to its
/// neighbour. An empty overview says so and offers Search.
class TvRequestsScreen extends ConsumerStatefulWidget {
  const TvRequestsScreen({super.key, this.queue = false});

  final bool queue;

  @override
  ConsumerState<TvRequestsScreen> createState() => _TvRequestsScreenState();
}

class _TvRequestsScreenState extends ConsumerState<TvRequestsScreen> {
  final _memory = TvFocusMemory();
  FocusedItem? _focused;

  /// The pages of the viewer's own last loaded, shown while a change reads
  /// them again, so the grid doesn't blink to a spinner.
  CursorPages<RequestItem>? _lastGoing;
  CursorPages<RequestItem>? _lastAll;

  @override
  void dispose() {
    _memory.dispose();
    super.dispose();
  }

  void _focus(FocusedItem item) {
    if (identical(item, _focused)) return;
    setState(() => _focused = item);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final queue = widget.queue && ref.watch(runsQueueProvider);
    final body = queue ? _queueBody(l) : _mineBody(l);
    final cards = body.cards;
    // Down from the header, before any card had focus, lands on the first.
    if (cards.isNotEmpty) _memory.startAt(TvGrid.row, cards.first.id);
    _memory.restore(context, () {
      if (cards.isNotEmpty) return (TvGrid.row, cards.first.id);
      return body.empty ? (_Rows.empty, _Rows.search) : null;
    });
    final waiting = body.waiting;
    final grid = TvPosterGrid(
      memory: _memory,
      itemCount: cards.length,
      // Cells as wide as the page holds two of, each a card's height.
      cellWidth: TvInfoCards.rowWidth + 20,
      cellAspect: double.infinity,
      cellExtra: TvInfoCards.height,
      header: TvGridHeader(
        title: queue ? l.webRequestsTitle : l.webAskMineTitle,
        detail: body.counts,
        controls: [
          // Like Add, it asks nothing.
          if (waiting.length > 1)
            TvMemoryRow(
              memory: _memory,
              row: _Rows.header,
              child: TvButton(
                label: l.webRequestsAddAll(waiting.length),
                icon: Lucide.listChecks,
                focusNode: _memory.node(_Rows.header, _Rows.addAll),
                onPressed: () => unawaited(
                  ref
                      .read(requestsProvider.notifier)
                      .answerAll(l, waiting, undo: false),
                ),
              ),
            ),
        ],
      ),
      line: TvFocusLine(_focused),
      lineHeight: tvFocusLineHeight,
      onNearEnd: body.more,
      footer: body.footer,
      itemBuilder: (context, index) {
        final card = cards[index];
        return KeyedSubtree(
          key: ValueKey(card.id),
          child: card.build(_memory.node(TvGrid.row, card.id), _focus),
        );
      },
    );
    // Wrapped whatever the state, so the grid keeps its place as it loads.
    return FollowTitles(
      titles: body.followed ?? FollowedTitles(const []),
      child: grid,
    );
  }

  /// Everyone's requests: the live queue in its order, then Done past what
  /// the live queue holds of it, a page at a time.
  _Body _queueBody(AppLocalizations l) {
    final state = ref.watch(requestsProvider);
    final queue = state.queue;
    if (queue == null) {
      if (state.queueFailed) {
        return _Body.notice(
          TvNotice(
            headline: l.requestsLoadFailed,
            onRetry: () => ref.read(requestsProvider.notifier).retryQueue(),
            retryLabel: l.commonRetry,
          ),
        );
      }
      return const _Body.loading();
    }
    final held = state.held;
    final liveIsAll = queue.nextCursor == null;
    final pages = liveIsAll ? null : ref.watch(doneRequestsProvider);
    final notifier = liveIsAll ? null : ref.read(doneRequestsProvider.notifier);
    final done = doneInOrder(
      queue.done,
      liveIsAll: liveIsAll,
      paged: pages?.items ?? const [],
      pagedDone: pages?.done ?? true,
    );
    final entries = queueInOrder(queue, held: held, done: done.items);
    final waiting = [
      for (final entry in entries)
        if (entry.state == RequestState.waiting) entry.item,
    ];
    int left(List<AdminRequestItem> list) =>
        list.where((item) => !held.contains(item.id)).length;
    final counts = [
      if (waiting.isNotEmpty) l.requestsCountWaiting(waiting.length),
      if (left(queue.needsAttention) case final n when n > 0)
        l.requestsCountNeedsAttention(n),
      if (left(queue.onTheWay) case final n when n > 0)
        l.requestsCountOnTheWay(n),
      if (queue.counts.done > 0) l.requestsCountDone(queue.counts.done),
    ];
    if (entries.isEmpty && !done.more) {
      return _Body.empty(
        TvNotice(
          headline: l.requestsOverviewEmpty,
          message: l.requestsOverviewEmptyHint,
        ),
        memory: _memory,
      );
    }
    final error = pages?.error;
    return _Body.cards(
      l,
      [
        for (final entry in entries)
          _CardOf(
            entry.item.id,
            (node, onFocus) => TvRequestCard.queued(
              entry,
              width: null,
              focusNode: node,
              onFocus: onFocus,
              // Done's pages keep what they read, so an answered one
              // leaves them here.
              onAnswered: notifier == null
                  ? null
                  : () => notifier.drop(entry.item.id),
            ),
          ),
      ],
      done: !done.more,
      error: error,
      onMore: notifier?.more,
      onRetry: notifier?.retry,
      counts: counts.join(' · '),
      waiting: waiting,
    );
  }

  /// The viewer's own: what's still going, from the server's list of those
  /// in progress, then everything else, newest first, from the whole list.
  _Body _mineBody(AppLocalizations l) {
    final goingProvider = myRequestsProvider(MineFilter.inProgress);
    final allProvider = myRequestsProvider(MineFilter.all);
    var going = ref.watch(goingProvider);
    var all = ref.watch(allProvider);
    if (going.loaded) {
      _lastGoing = going;
    } else if (going.error == null) {
      going = _lastGoing ?? going;
    }
    if (all.loaded) {
      _lastAll = all;
    } else if (all.error == null) {
      all = _lastAll ?? all;
    }
    final held = ref.watch(requestsProvider.select((state) => state.held));
    if (!going.loaded) {
      final error = going.error;
      if (error == null) return const _Body.loading();
      return _Body.notice(
        TvNotice(
          headline: l.askedLoadFailed,
          message: describeFailure(l, error),
          onRetry: () => ref.read(goingProvider.notifier).retry(),
          retryLabel: l.commonRetry,
        ),
      );
    }
    final still = [
      for (final item in going.items)
        if (!held.contains(item.id) &&
            !(ownState(item.season?.asTitle() ?? item.availability)?.finished ??
                false))
          item,
    ];
    final first = {for (final item in still) item.id};
    final items = [
      ...still,
      if (going.done)
        for (final item in all.items)
          if (!held.contains(item.id) && !first.contains(item.id)) item,
    ];
    final (pages, notifier) = going.done
        ? (all, ref.read(allProvider.notifier))
        : (going, ref.read(goingProvider.notifier));
    if (items.isEmpty && pages.done) {
      return _Body.empty(
        TvNotice(headline: l.webAskMineEmpty, message: l.webAskMineEmptyHint),
        memory: _memory,
      );
    }
    return _Body.cards(
      l,
      [
        for (final item in items)
          _CardOf(
            item.id,
            (node, onFocus) => TvRequestCard.mine(
              item,
              width: null,
              focusNode: node,
              onFocus: onFocus,
            ),
          ),
      ],
      done: pages.done,
      error: pages.error,
      onMore: notifier.more,
      onRetry: notifier.retry,
      followed: FollowedTitles([
        for (final item in items)
          CatalogInput(ref: item.title.ref, libraryId: item.library.id),
      ]),
    );
  }
}

/// A card of the overview: its request's id, and the card with its focus
/// node, telling the page what it is.
class _CardOf {
  const _CardOf(this.id, this.build);

  final String id;
  final Widget Function(FocusNode node, ValueChanged<FocusedItem> onFocus)
  build;
}

/// What the overview shows: its cards, with what goes under them and asks
/// for more, or a notice in their place.
class _Body {
  /// [cards], with a spinner under them while a page comes, or why one
  /// didn't, with Try again.
  _Body.cards(
    AppLocalizations l,
    this.cards, {
    required bool done,
    Object? error,
    VoidCallback? onMore,
    VoidCallback? onRetry,
    this.followed,
    this.counts,
    this.waiting = const [],
  }) : empty = false,
       more = done || error != null ? null : onMore,
       footer = done
           ? null
           : error == null
           ? const TvLoading(size: 28, top: 16)
           : TvNotice(
               headline: l.listMoreFailed,
               message: describeFailure(l, error),
               onRetry: onRetry,
               retryLabel: l.commonRetry,
               top: 8,
             );

  const _Body.notice(Widget this.footer)
    : cards = const [],
      empty = false,
      more = null,
      followed = null,
      counts = null,
      waiting = const [];

  /// Nothing to show: [notice], and Search, which focus can rest on.
  _Body.empty(TvNotice notice, {required TvFocusMemory memory})
    : cards = const [],
      empty = true,
      more = null,
      followed = null,
      counts = null,
      waiting = const [],
      footer = _Empty(notice: notice, memory: memory);

  const _Body.loading()
    : cards = const [],
      footer = const TvLoading(top: 76),
      empty = false,
      more = null,
      followed = null,
      counts = null,
      waiting = const [];

  final List<_CardOf> cards;
  final Widget? footer;
  final VoidCallback? more;
  final FollowedTitles? followed;

  /// The header's line of how many are in each state.
  final String? counts;

  /// What Add all adds.
  final List<AdminRequestItem> waiting;

  /// It said it has nothing, and offers Search.
  final bool empty;
}

/// An empty overview: why, and Search, where requests start.
class _Empty extends StatelessWidget {
  const _Empty({required this.notice, required this.memory});

  final TvNotice notice;
  final TvFocusMemory memory;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        notice,
        Padding(
          padding: const EdgeInsets.only(top: 24),
          child: TvMemoryRow(
            memory: memory,
            row: _Rows.empty,
            child: TvButton(
              label: l.searchTitle,
              icon: Lucide.search,
              focusNode: memory.node(_Rows.empty, _Rows.search),
              onPressed: () => context.go(Routes.search),
            ),
          ),
        ),
      ],
    );
  }
}
