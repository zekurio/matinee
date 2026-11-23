import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/link_opener.dart';
import '../../core/permissions.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/server_text.dart';
import '../../media/artwork.dart';
import '../../media/avatar.dart';
import '../../router.dart';
import 'catalog_cards.dart';
import 'request_sheet.dart';
import 'request_words.dart';
import 'requests_hub.dart';

/// The request cards that Explore's Recent requests row, the requests
/// overview, and My requests share, as the web draws them: the year and the
/// seasons a show asks for, the name on up to two lines, who asked on an
/// admin's card, and the state under "Status", all on the left; the poster,
/// sharp, on the right; and the title's backdrop behind the whole card,
/// fading into the card's own surface so the words stay readable in light
/// and dark. What went wrong, or why a request was declined, opens from its
/// badge. The actions sit on the poster's bottom edge. The poster sets the
/// card's height.

/// How many askers' faces a card shows; the count after the first name
/// says the rest.
const _faces = 3;

/// The box a face sits in, its ring included, and how far the next one
/// covers it.
const _face = 20.0;
const _faceOverlap = 12.0;

/// A card's padding, and the gap between the text and the poster.
const _padding = 16.0;
const _gap = 16.0;

/// The poster's width, as the web's 7rem, and its height to its width, 2:3.
const _posterWidth = 112.0;
const _posterHeight = 1.5;

/// The gap under the facts, which belong with the name, and between every
/// other row.
const _afterFacts = 4.0;
const _rowGap = 4.0;

/// The room who asked takes, whether a card says who or not.
const _askRow = 24.0;

/// The gap over the actions.
const _actionsGap = 6.0;

/// A request card's layout: the poster's width, and the text column's
/// height, which is the poster's or, at larger text sizes, what the rows
/// need. The year, the name on two lines, who asked on a [queue] card, the
/// status row, and the actions, with the gaps between. Every card of a list
/// has the same rows, so it's as tall as the next.
typedef RequestCardLayout = ({double posterWidth, double height});

/// The height "Status" and its badge take at the text size [scaler] gives.
double _statusHeight(TextScaler scaler) =>
    math.max(24, FilledBadge.heightOf(scaler));

/// The height a card's actions take: the kit's small button, or the room
/// their words need at a larger text size.
double _actionHeight(TextScaler scaler) =>
    math.max(ButtonSize.sm.height, scaler.scale(KitText.px13.lineHeight));

/// The layout of a card whose rows are at the text size [scaler] gives,
/// with [queue] for an admin's card, which says who asked.
RequestCardLayout requestCardLayout(TextScaler scaler, {required bool queue}) {
  double line(KitText text) => scaler.scale(text.lineHeight);
  final rows =
      line(KitText.xs) +
      _afterFacts +
      2 * line(KitText.base) +
      (queue ? _rowGap + math.max(_askRow, line(KitText.px13)) : 0) +
      _rowGap +
      _statusHeight(scaler) +
      _actionsGap +
      _actionHeight(scaler);
  return (
    posterWidth: _posterWidth,
    height: math.max(_posterWidth * _posterHeight, rows),
  );
}

/// A card's whole height, for a row that sizes its cards ahead.
double requestCardHeight(TextScaler scaler, {required bool queue}) =>
    requestCardLayout(scaler, queue: queue).height + 2 * _padding;

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

/// One request: the year and the name at the start, who asked on a [queue]
/// card, [badge] under "Status", and [actions] on the bottom edge, with the
/// poster at the end. The title's [backdrop] sits behind all of it, fading
/// into the card's surface. [onMore] puts the request's menu at the top of
/// the words. The rows keep their places whether they're filled or not.
class RequestCard extends StatelessWidget {
  const RequestCard({
    super.key,
    required this.title,
    required this.backdrop,
    required this.library,
    required this.scope,
    required this.availability,
    required this.badge,
    required this.queue,
    this.who,
    this.actions,
    this.onMore,
    this.wholeYear = false,
  });

  final CatalogTitleSummary title;

  /// The title's backdrop, when the server has one.
  final Artwork? backdrop;
  final String library;
  final ShowScope? scope;

  /// The title's, which says where its page is.
  final Availability availability;
  final Widget badge;
  final bool queue;
  final Widget? who;
  final Widget? actions;
  final VoidCallback? onMore;

  /// Whether a facts line that's cut opens all of it, as a person's own
  /// card does.
  final bool wholeYear;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final scaler = MediaQuery.textScalerOf(context);
    final layout = requestCardLayout(scaler, queue: queue);
    final poster = title.poster;
    final backdrop = this.backdrop;
    final onMore = this.onMore;
    final facts = [
      if (title.year case final year?) '$year',
      ?scopeText(scope, l),
    ].join(' · ');
    void open() => _open(context, title, library, availability);
    Widget pressable(String label, VoidCallback onPressed, Widget child) =>
        PressIndication(
          onPressed: onPressed,
          label: label,
          shape: const BorderRadius.all(Radius.circular(4)),
          builder: (context, _) => ExcludeSemantics(child: child),
        );
    final factsText = Text(
      facts,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: KitText.xs.style(
        // Over a backdrop's lightest corner the muted colour fades into it.
        color: backdrop == null
            ? colors.mutedForeground
            : colors.foreground.withValues(alpha: .85),
        weight: FontWeight.w500,
      ),
    );
    final titleText = Text(
      title.name,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
      style: KitText.base.style(
        color: colors.foreground,
        weight: FontWeight.w700,
        leading: 24,
      ),
    );
    return ClipRRect(
      borderRadius: const BorderRadius.all(Radius.circular(KitRadius.xl)),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: const BorderRadius.all(Radius.circular(KitRadius.xl)),
          border: Border.all(color: colors.border),
        ),
        child: Stack(
          children: [
            if (backdrop != null) ...[
              Positioned.fill(
                child: ExcludeSemantics(
                  child: Picture([
                    ArtSource(backdrop, largest: ArtworkSize.large),
                  ]),
                ),
              ),
              Positioned.fill(
                child: IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        stops: const [0, .75],
                        colors: [
                          colors.surface.withValues(alpha: .5),
                          colors.surface,
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
            Padding(
              padding: const EdgeInsets.all(_padding),
              child: SizedBox(
                height: layout.height,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: _gap,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    LayoutBuilder(
                                      builder: (context, constraints) {
                                        final cut =
                                            wholeYear &&
                                            _cut(
                                              context,
                                              factsText,
                                              constraints.maxWidth,
                                            );
                                        if (!cut) {
                                          return pressable(
                                            facts,
                                            open,
                                            factsText,
                                          );
                                        }
                                        return pressable(
                                          facts,
                                          () => unawaited(
                                            _showWhole(context, title.name, [
                                              facts,
                                            ]),
                                          ),
                                          factsText,
                                        );
                                      },
                                    ),
                                    const SizedBox(height: _afterFacts),
                                    pressable(title.name, open, titleText),
                                  ],
                                ),
                              ),
                              if (onMore != null)
                                Padding(
                                  padding: const EdgeInsetsDirectional.only(
                                    start: 4,
                                  ),
                                  child: MatineeButton(
                                    look: ButtonLook.ghost,
                                    size: ButtonSize.iconSm,
                                    leading: Lucide.ellipsis,
                                    label: l.webRequestsMore(title.name),
                                    onPressed: onMore,
                                  ),
                                ),
                            ],
                          ),
                          if (queue) ...[
                            const SizedBox(height: _rowGap),
                            SizedBox(
                              height: math.max(
                                _askRow,
                                scaler.scale(KitText.px13.lineHeight),
                              ),
                              child: who,
                            ),
                          ],
                          const SizedBox(height: _rowGap),
                          SizedBox(
                            height: _statusHeight(scaler),
                            child: Row(
                              spacing: 8,
                              children: [
                                ExcludeSemantics(
                                  child: Text(
                                    l.requestsStatusLabel,
                                    style: KitText.px13.style(
                                      color: colors.foreground.withValues(
                                        alpha: .85,
                                      ),
                                      weight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                                Flexible(child: badge),
                              ],
                            ),
                          ),
                          const Spacer(),
                          SizedBox(
                            height: _actionHeight(scaler),
                            child: Align(
                              alignment: AlignmentDirectional.centerStart,
                              child: actions,
                            ),
                          ),
                        ],
                      ),
                    ),
                    SizedBox(
                      width: layout.posterWidth,
                      height: layout.posterWidth * _posterHeight,
                      child: ExcludeSemantics(
                        child: PressIndication(
                          onPressed: open,
                          shape: const BorderRadius.all(
                            Radius.circular(KitRadius.md),
                          ),
                          builder: (context, _) => DecoratedBox(
                            decoration: const BoxDecoration(
                              borderRadius: BorderRadius.all(
                                Radius.circular(KitRadius.md),
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: Color(0x38000000),
                                  offset: Offset(0, 4),
                                  blurRadius: 12,
                                ),
                              ],
                            ),
                            child: ArtFrame(
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
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The one badge a request card carries: a filled pill with the [state] the
/// server gave the request, and how much is in while it's on its way when
/// the server says. With [onPressed], what went wrong or why it was declined
/// opens from it, and it wears a chevron.
class RequestStateBadge extends StatelessWidget {
  const RequestStateBadge({
    super.key,
    required this.state,
    this.progress,
    this.onPressed,
  });

  /// A [RequestState].
  final String state;

  /// The share that's in, for one on its way.
  final double? progress;

  /// Opens what the state has to say beyond its word.
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final look = _stateFill(state, MatineeTheme.of(context));
    final text = requestStateText(state, l, progress: progress);
    final label = '${l.requestsStatusLabel}: $text';
    final ring = state == RequestState.onTheWay;
    final pill = FilledBadge(
      label: text,
      icon: ring ? null : requestStateIcon(state),
      glyph: ring
          ? ProgressRing(
              progress,
              size: FilledBadge.heightOf(MediaQuery.textScalerOf(context)) * .6,
              color: look.ink,
              track: look.ink.withValues(alpha: .3),
            )
          : null,
      fill: look.fill,
      ink: look.ink,
      border: look.border,
      trailing: onPressed == null ? null : Lucide.chevronDown,
    );
    if (onPressed case final press?) {
      return PressIndication(
        onPressed: press,
        label: label,
        shape: KitRadius.pill,
        builder: (context, _) => ExcludeSemantics(child: pill),
      );
    }
    return Semantics(
      container: true,
      label: label,
      child: ExcludeSemantics(child: pill),
    );
  }
}

/// A badge's colours: its [fill], its [border], and the [ink] that reads on
/// the fill.
typedef StateFill = ({Color fill, Color border, Color ink});

/// The colours of [state]'s badge, a [RequestState], as the web fills them:
/// waiting in the warning colour, on its way in the accent, here in green,
/// and declined or needing attention in red.
StateFill _stateFill(String state, KitColors colors) {
  final token = switch (state) {
    RequestState.needsAttention || RequestState.declined => colors.danger,
    RequestState.onTheWay => colors.accent,
    RequestState.here => colors.success,
    // Waiting, and a state this app doesn't know yet.
    _ => colors.warning,
  };
  final fill = Color.alphaBlend(token.withValues(alpha: .8), colors.surface);
  // The web puts white on every fill. The lighter greens and ambers can't
  // carry it in either theme, so the ink follows the fill's light: near-black
  // where white would vanish, white on the deeper colours.
  final ink = fill.computeLuminance() > .25
      ? const Color(0xFF17171A)
      : const Color(0xFFFFFFFF);
  return (fill: fill, border: token, ink: ink);
}

/// A request state badge's colours: its [fill] and [edge], either of which
/// may be none, its mark's, and its words'.
typedef RequestStateLook = ({Color? fill, Color? edge, Color mark, Color ink});

/// The colours of [state]'s badge, a [RequestState]. With [urgent], for
/// whoever runs the queue, waiting stands out in the accent and needs
/// attention in the danger colour; on an asker's own card both are plain.
/// On its way is a plain pill; done is quiet, an outline in muted words.
/// The TV's badge takes the same.
RequestStateLook requestStateLook(
  String state,
  KitColors colors, {
  bool urgent = false,
}) {
  final quiet = colors.foreground.withValues(alpha: .7);
  final RequestStateLook plain = (
    fill: colors.secondary,
    edge: null,
    mark: colors.foreground,
    ink: colors.foreground,
  );
  return switch (state) {
    RequestState.needsAttention when urgent => (
      fill: colors.danger.withValues(alpha: .2),
      edge: colors.danger.withValues(alpha: .55),
      mark: colors.danger,
      ink: colors.foreground,
    ),
    RequestState.needsAttention || RequestState.onTheWay => plain,
    RequestState.here || RequestState.declined => (
      fill: null,
      edge: colors.foreground.withValues(alpha: .2),
      mark: quiet,
      ink: quiet,
    ),
    // Waiting, and a state this app doesn't know yet.
    _ when urgent => (
      fill: colors.accentSoft,
      edge: colors.accent.withValues(alpha: .5),
      mark: colors.accent,
      ink: colors.foreground,
    ),
    _ => plain,
  };
}

/// [state]'s word on its badge, with the share that's in for one on its
/// way when the server says.
String requestStateText(String state, AppLocalizations l, {double? progress}) =>
    switch (state) {
      RequestState.needsAttention => l.webRequestsStateNeedsAttention,
      RequestState.onTheWay when progress != null =>
        l.webRequestsStateOnTheWayPercent(formatPercent(progress, l)),
      RequestState.onTheWay => l.webRequestsStateOnTheWay,
      RequestState.here => l.webRequestsStateHere,
      RequestState.declined => l.webRequestsStateDeclined,
      _ => l.webRequestsStateWaiting,
    };

/// [state]'s mark on its badge, or null for on its way, which shows a
/// ring of how much is in.
String? requestStateIcon(String state) => switch (state) {
  RequestState.needsAttention => Lucide.triangleAlert,
  RequestState.onTheWay => null,
  RequestState.here => Lucide.check,
  RequestState.declined => Lucide.circleSlash,
  _ => Lucide.clock,
};

// An admin's cards.

/// One request of the queue, in the state the server gave it: who asked,
/// the state's badge, and the state's actions. Its menu has the rest: when
/// they asked, where it goes and how, how far along it is or when it
/// arrived, the request's whole problem, "Goes to", the title's page, the
/// request in its connection, and what the connection reported. A failed or
/// declined request opens what went wrong from its badge. [onAnswered] runs
/// when an answer takes a request out of Done, which pages of its own hold.
class QueueCard extends ConsumerWidget {
  const QueueCard({super.key, required this.item, this.onAnswered});

  final AdminRequestItem item;
  final ValueChanged<AdminRequestItem>? onAnswered;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = item.state;
    final showsDetail =
        state == RequestState.needsAttention || state == RequestState.declined;
    return RequestCard(
      title: item.title,
      backdrop: item.backdrop,
      library: item.library.id,
      scope: item.scope,
      availability: item.availability,
      queue: true,
      badge: RequestStateBadge(
        state: state,
        progress: state == RequestState.onTheWay
            ? item.availability.progress
            : null,
        onPressed: showsDetail ? () => _showDetail(context) : null,
      ),
      who: _Askers(item: item),
      actions: _QueueActions(item: item, onAnswered: onAnswered),
      onMore: () => unawaited(
        showRequestMenu(context, ref, item, onAnswered: onAnswered),
      ),
    );
  }

  void _showDetail(BuildContext context) {
    final l = AppLocalizations.of(context);
    unawaited(
      _showStateDetail(
        context,
        state: item.state,
        name: item.title.name,
        paragraphs: switch (item.state) {
          RequestState.needsAttention => [queueError(item, l)],
          RequestState.declined => [queueReason(item, l)],
          _ => const <String>[],
        },
        note: item.state == RequestState.declined ? queueNote(item) : null,
        diagnostics: item.state == RequestState.needsAttention
            ? item.diagnostics
            : const [],
      ),
    );
  }
}

/// Why a request needs attention, as the connection said.
String queueError(AdminRequestItem item, AppLocalizations l) =>
    item.error?.serverWords(l) ?? l.webRequestsAttentionUnknown;

/// Why a request was declined: the reason an admin picked, or that it was
/// given up on.
String queueReason(AdminRequestItem item, AppLocalizations l) {
  final reason = item.reason;
  if (reason == DeclineReason.notFound) return l.webRequestsDoneGaveUpUndated;
  return reason == null
      ? l.webRequestsDoneDeclinedUndated
      : adminReasonText(reason, l);
}

/// The note an admin left with a decline, or null for none.
String? queueNote(AdminRequestItem item) {
  final note = item.note?.trim();
  return note == null || note.isEmpty ? null : note;
}

/// How far along a request on its way is, in words: when it's out, how
/// long is left, or what it waits on. Null while the badge's share says
/// it all.
String? queueProgress(AdminRequestItem item, AppLocalizations l) {
  final availability = item.availability;
  final eta = availability.etaSeconds;
  if (availability.state == AvailabilityState.release) {
    final day = parseDay(availability.releaseDate);
    return day == null
        ? l.webRequestsProgressNotOut
        : l.webRequestsProgressRelease(formatShortDay(day, l));
  }
  if (availability.progress != null) {
    return eta == null ? null : l.webRequestsProgressLeft(formatSpan(eta, l));
  }
  if (availability.stillLooking) return l.webRequestsProgressLooking;
  if (item.fulfilmentState == FulfilmentState.queued) {
    return l.webRequestsProgressQueued;
  }
  if (item.connection?.reportsProgress == false) {
    return l.webRequestsProgressByHand;
  }
  return l.webRequestsProgressSent;
}

/// A queue card's actions, the state's own: Add in the accent with Decline
/// beside it while it waits, and Retry when it needs attention. Giving up
/// on an accepted one, and the answers a declined one takes, are in its
/// menu. Each is held for Undo by the hub.
class _QueueActions extends ConsumerWidget {
  const _QueueActions({required this.item, this.onAnswered});

  final AdminRequestItem item;
  final ValueChanged<AdminRequestItem>? onAnswered;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final hub = ref.read(requestsProvider.notifier);
    final canApprove = ref.watch(canProvider(Permission.adminRequestApprove));
    final canDecline = ref.watch(canProvider(Permission.adminRequestDecline));
    final canRetry = ref.watch(canProvider(Permission.adminRequestRetry));
    final List<Widget> buttons = switch (item.state) {
      RequestState.waiting => [
        if (canApprove) AddButton(item: item, small: true),
        if (canDecline) DeclineButton(item: item, small: true),
      ],
      RequestState.needsAttention => [
        if (canRetry)
          _SmallButton(
            look: ButtonLook.outline,
            icon: Lucide.rotateCw,
            text: l.webRequestsRetry,
            label: l.webRequestsRetryNamed(item.title.name),
            onPressed: () => unawaited(hub.retry(l, item)),
          ),
      ],
      // Giving up, and a declined request's answers, are in its menu.
      _ => const [],
    };
    if (buttons.isEmpty) return const SizedBox.shrink();
    // The first takes the room the rest leave, as the web's Add does, and
    // the rest stay as wide as their words.
    if (buttons.length == 1) return buttons.single;
    return Row(
      spacing: 8,
      children: [
        Expanded(child: buttons.first),
        ...buttons.skip(1),
      ],
    );
  }
}

class _SmallButton extends StatelessWidget {
  const _SmallButton({
    required this.text,
    required this.onPressed,
    this.look = ButtonLook.ghost,
    this.icon,
    this.label,
  });

  final String text;
  final VoidCallback onPressed;
  final ButtonLook look;
  final String? icon;
  final String? label;

  @override
  Widget build(BuildContext context) => MatineeButton(
    look: look,
    size: ButtonSize.sm,
    leading: icon,
    label: label,
    onPressed: onPressed,
    child: Text(
      text,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: const TextStyle(fontWeight: FontWeight.w600),
    ),
  );
}

/// The first few who asked, the first one's face and name, and how many
/// others, on one line.
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
    final others = people.length - 1;
    final faces = people.take(_faces).toList();
    return Semantics(
      container: true,
      label: others == 0
          ? first.name
          : l.webRequestsBadgeRequestedMany(
              formatList([for (final each in people) each.name], l),
            ),
      child: ExcludeSemantics(
        child: Row(
          spacing: 8,
          children: [
            SizedBox(
              width: _face + (faces.length - 1) * _faceOverlap,
              height: _face,
              child: Stack(
                children: [
                  // Painted last to first, so the first asker, the one the
                  // card names, is the face that shows whole.
                  for (final (index, face) in faces.indexed.toList().reversed)
                    PositionedDirectional(
                      start: index * _faceOverlap,
                      child: Container(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: colors.surface, width: 1.5),
                        ),
                        child: Avatar(
                          url: face.avatarUrl,
                          name: face.name,
                          size: 17,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(text: first.name),
                    if (others > 0)
                      TextSpan(
                        text:
                            ' ${l.webRequestsOthersCount(formatCount(others, l))}',
                        style: TextStyle(color: colors.mutedForeground),
                      ),
                  ],
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: KitText.px13.style(
                  color: colors.foreground.withValues(alpha: .9),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// "Films · Radarr": where a request goes, the library chosen under
/// "Goes to" for a waiting one, and what fills it.
String _whereText(
  RequestsState state,
  AdminRequestItem item,
  AppLocalizations l,
) {
  final goes = state.goesTo(item);
  return [goes.name, goes.connection ?? l.webRequestsNoConnection].join(' · ');
}

/// A request's menu, its details sheet: what its state allows, "Goes to"
/// while it waits, its title's page, the request in its connection's app,
/// and what the connection reported.
Future<void> showRequestMenu(
  BuildContext context,
  WidgetRef ref,
  AdminRequestItem item, {
  ValueChanged<AdminRequestItem>? onAnswered,
}) {
  final l = AppLocalizations.of(context);
  final hub = ref.read(requestsProvider.notifier);
  final canApprove = ref.read(canProvider(Permission.adminRequestApprove));
  final canDecline = ref.read(canProvider(Permission.adminRequestDecline));
  final canRetry = ref.read(canProvider(Permission.adminRequestRetry));
  return Sheet.show<void>(
    context,
    dismissLabel: l.commonCancel,
    builder: (sheet) {
      void then(VoidCallback action) {
        Navigator.of(sheet).pop();
        action();
      }

      void reopen(QueueAnswer answer) => then(() {
        onAnswered?.call(item);
        unawaited(hub.answer(l, item, answer));
      });

      void giveUp() =>
          then(() => unawaited(showDeclineSheet(context, item, giveUp: true)));

      final remote = item.remoteUrl;
      final connection = item.connection;
      return Sheet(
        title: item.title.name,
        description: _whereText(ref.read(requestsProvider), item, l),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Whole(_menuWhole(item, l)),
            ...switch (item.state) {
              RequestState.waiting => [
                if (canApprove && choosesLibrary(item))
                  SheetItem(
                    icon: Lucide.libraryBig,
                    label: l.webRequestsGoesToTitle,
                    onPressed: () =>
                        then(() => unawaited(showGoesToSheet(context, item))),
                  ),
                if (canApprove)
                  SheetItem(
                    icon: Lucide.check,
                    label: l.webRequestsAdd,
                    onPressed: () => then(
                      () => unawaited(hub.answer(l, item, const AddAnswer())),
                    ),
                  ),
                if (canDecline)
                  SheetItem(
                    icon: Lucide.x,
                    label: l.webRequestsDecline,
                    onPressed: () =>
                        then(() => unawaited(showDeclineSheet(context, item))),
                  ),
              ],
              RequestState.needsAttention => [
                if (canRetry)
                  SheetItem(
                    icon: Lucide.rotateCw,
                    label: l.webRequestsRetry,
                    onPressed: () => then(() => unawaited(hub.retry(l, item))),
                  ),
                if (canDecline)
                  SheetItem(
                    icon: Lucide.circleSlash,
                    label: l.webRequestsGiveUp,
                    onPressed: giveUp,
                  ),
              ],
              RequestState.onTheWay => [
                if (canDecline)
                  SheetItem(
                    icon: Lucide.circleSlash,
                    label: l.webRequestsGiveUp,
                    onPressed: giveUp,
                  ),
              ],
              RequestState.declined => [
                if (canApprove)
                  SheetItem(
                    icon: Lucide.check,
                    label: l.webRequestsAddAfterAll,
                    onPressed: () => reopen(const AddAfterAllAnswer()),
                  ),
                if (canDecline)
                  SheetItem(
                    icon: Lucide.lockOpen,
                    label: l.webRequestsAllowAgain,
                    onPressed: () => reopen(const AllowAgainAnswer()),
                  ),
              ],
              _ => const <Widget>[],
            },
            SheetItem(
              icon: Lucide.info,
              label: l.webRequestsOpenTitle,
              onPressed: () => then(
                () => _open(
                  context,
                  item.title,
                  item.library.id,
                  item.availability,
                ),
              ),
            ),
            if (remote != null && connection != null)
              SheetItem(
                icon: Lucide.externalLink,
                label: l.webRequestsOpenRemote(connection.sourceName),
                onPressed: () => then(
                  () => unawaited(
                    ref.read(linkOpenerProvider)(Uri.parse(remote)),
                  ),
                ),
              ),
            if (item.diagnostics.isNotEmpty)
              SheetItem(
                icon: Lucide.activity,
                label: l.webRequestsDiagnostics,
                onPressed: () =>
                    then(() => unawaited(_showDiagnostics(context, item))),
              ),
          ],
        ),
      );
    },
  );
}

/// What a queue card leaves out or cuts, whole, for its menu: who asked
/// (and when, for one) and the seasons, then the state's own words: how
/// far along it is, when it arrived, the error, or the decline's reason
/// and note.
List<String> _menuWhole(AdminRequestItem item, AppLocalizations l) => [
  requestedText(item, l),
  ...switch (item.state) {
    RequestState.needsAttention => [queueError(item, l)],
    RequestState.onTheWay => [?queueProgress(item, l)],
    RequestState.here => [
      if (relativeTime(item.arrivedAt, l) case final arrived?)
        l.webRequestsDoneArrived(arrived),
    ],
    RequestState.declined => [queueReason(item, l), ?queueNote(item)],
    _ => const <String>[],
  },
];

/// What the connection reported about a request, label and value as the
/// server words them, for an admin finding out why it's stuck.
Future<void> _showDiagnostics(BuildContext context, AdminRequestItem item) {
  final l = AppLocalizations.of(context);
  return Sheet.show<void>(
    context,
    dismissLabel: l.diagnosticsClose,
    builder: (sheet) {
      final colors = MatineeTheme.of(sheet);
      return Sheet(
        title: l.webRequestsDiagnostics,
        description: [item.title.name, ?item.connection?.name].join(' · '),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 12,
            children: [
              for (final entry in item.diagnostics)
                Semantics(
                  container: true,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 2,
                    children: [
                      Text(
                        entry.label,
                        style: KitText.xs.style(color: colors.mutedForeground),
                      ),
                      Text(
                        entry.value,
                        style: KitText.sm.style(color: colors.foreground),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      );
    },
  );
}

/// What a request's badge opens when the server has more to say than its
/// state's word: the error and what the connection reported on a failed
/// one, or why it was declined and the note an admin left. A sheet, since a
/// phone's card is too narrow to hold a popover beside its badge.
Future<void> _showStateDetail(
  BuildContext context, {
  required String state,
  required String name,
  required List<String> paragraphs,
  String? note,
  List<AdminRequestItemDiagnostic> diagnostics = const [],
}) {
  final l = AppLocalizations.of(context);
  return Sheet.show<void>(
    context,
    dismissLabel: l.diagnosticsClose,
    builder: (sheet) {
      final colors = MatineeTheme.of(sheet);
      return Sheet(
        title: requestStateText(state, l),
        description: name,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 8,
            children: [
              for (final paragraph in paragraphs)
                Text(
                  paragraph,
                  style: KitText.sm.style(color: colors.foreground),
                ),
              if (note case final note?)
                Text(
                  note,
                  style: KitText.sm
                      .style(color: colors.foreground.withValues(alpha: .85))
                      .copyWith(fontStyle: FontStyle.italic),
                ),
              if (diagnostics.isNotEmpty) ...[
                const SizedBox(height: 4),
                for (final entry in diagnostics)
                  Semantics(
                    container: true,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      spacing: 2,
                      children: [
                        Text(
                          entry.label,
                          style: KitText.xs.style(
                            color: colors.mutedForeground,
                          ),
                        ),
                        Text(
                          entry.value,
                          style: KitText.sm.style(color: colors.foreground),
                        ),
                      ],
                    ),
                  ),
              ],
            ],
          ),
        ),
      );
    },
  );
}

// A person's own cards.

/// One of the viewer's own requests, as the server says it stands: its
/// state's badge, why it was declined and the note when it was (all of it
/// from the badge), and Cancel while the server allows it. Cancel is held
/// for Undo, as an admin's answers are. With [live], the title's state is
/// the one the screen's live stream last said.
class OwnRequestCard extends ConsumerWidget {
  const OwnRequestCard({super.key, required this.item, this.live = false});

  final RequestItem item;
  final bool live;

  @override
  Widget build(BuildContext context, WidgetRef ref) => _card(context, ref);

  Widget _card(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    // Once it's here, every season it asked for is: no season to name.
    final season = item.state == RequestState.here ? null : item.season;
    final title = live
        ? ref.watch(
            requestsProvider.select(
              (state) => state.availability(item.title.ref, item.availability),
            ),
          )
        : item.availability;
    final availability = season?.asTitle() ?? title;
    final cancels =
        title.action == AvailabilityAction.cancel ||
        availability.action == AvailabilityAction.cancel;
    final reason = availability.reason;
    final note = reason?.note?.trim();
    final hasNote = note != null && note.isNotEmpty;
    final detail = item.state == RequestState.declined && reason != null
        ? () => unawaited(
            _showStateDetail(
              context,
              state: item.state,
              name: item.title.name,
              paragraphs: [declineText(reason, l)],
              note: hasNote ? note : null,
            ),
          )
        : null;
    return RequestCard(
      title: item.title,
      backdrop: item.backdrop,
      library: item.library.id,
      scope: item.scope,
      availability: title,
      queue: false,
      wholeYear: true,
      badge: RequestStateBadge(
        state: item.state,
        progress: item.state == RequestState.onTheWay
            ? availability.progress
            : null,
        onPressed: detail,
      ),
      actions: cancels
          ? MatineeButton(
              look: ButtonLook.ghost,
              size: ButtonSize.sm,
              leading: Lucide.x,
              label: '${l.webAskCancel}, ${item.title.name}',
              onPressed: () => unawaited(
                ref
                    .read(requestsProvider.notifier)
                    .withdraw(l, item.id, item.title.name),
              ),
              child: Text(
                l.commonCancel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            )
          : null,
    );
  }
}

/// Text a card cuts to a line, all of it, under the title's [name]: the
/// seasons it asked for.
Future<void> _showWhole(
  BuildContext context,
  String name,
  List<String> paragraphs,
) {
  final l = AppLocalizations.of(context);
  return Sheet.show<void>(
    context,
    dismissLabel: l.diagnosticsClose,
    builder: (sheet) => Sheet(title: name, child: _Whole(paragraphs)),
  );
}

/// Whether [text], one line, is cut at [width].
bool _cut(BuildContext context, Text text, double width) {
  final painter = TextPainter(
    text: TextSpan(
      text: text.data,
      style: DefaultTextStyle.of(context).style.merge(text.style),
    ),
    maxLines: 1,
    textDirection: Directionality.of(context),
    textScaler: MediaQuery.textScalerOf(context),
    locale: Localizations.maybeLocaleOf(context),
  )..layout(maxWidth: math.max(0, width));
  final cut = painter.didExceedMaxLines;
  painter.dispose();
  return cut;
}

/// Text a card cuts, whole, as a sheet shows it: each paragraph in turn.
class _Whole extends StatelessWidget {
  const _Whole(this.paragraphs);

  final List<String> paragraphs;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 8,
        children: [
          for (final text in paragraphs)
            Text(text, style: KitText.sm.style(color: colors.foreground)),
        ],
      ),
    );
  }
}
