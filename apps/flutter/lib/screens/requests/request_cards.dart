import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/link_opener.dart';
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
/// overview, and My requests share, as Seerr draws them: the poster beside
/// the same rows on every card, each one line, each in its place whether a
/// card has it or not. The year (a show's with the seasons asked for), the
/// name, who asked (an admin's cards only), the state's badge
/// ([RequestStateBadge]), and a line only when something went wrong: the
/// error, or why it was declined and the note. The actions sit on the
/// poster's bottom edge. The poster sets the card's height. What doesn't
/// fit ends in "…", and the card's menu, or a tap on the cut line, has all
/// of it.

/// How many askers' faces a card shows; the count after the first name
/// says the rest.
const _faces = 3;

/// The box a face sits in, its ring included.
const _face = 20.0;

/// A card's padding, and the gap between the poster and the text.
const _padding = 12.0;
const _gap = 12.0;

/// The poster's height to its width, 2:3.
const _posterHeight = 1.5;

/// The gap under the year, which belongs with the name, and the one
/// between every other row.
const _afterYear = 2.0;
const _rowGap = 6.0;
const _badge = 24.0;

/// A request card's layout: the poster's width, and the text column's
/// height, which is the poster's.
typedef RequestCardLayout = ({double poster, double height});

/// The layout of a card whose rows are at the text size [scaler] gives:
/// the year, the name, who asked on a [queue] card, the badge, the problem
/// line, and the actions, with the gaps between. Every card of a list has
/// the same rows, so it's as tall as the next, and the poster as tall as
/// the rows, so no band is left empty between them.
RequestCardLayout requestCardLayout(TextScaler scaler, {required bool queue}) {
  double line(double height) => scaler.scale(height);
  final rows =
      line(KitText.xs.lineHeight) +
      _afterYear +
      line(20) +
      (queue ? _rowGap + _whoHeight(scaler) : 0) +
      _rowGap +
      _badge +
      _rowGap +
      line(KitText.px13.lineHeight) +
      _rowGap +
      ButtonSize.sm.height;
  return (poster: rows / _posterHeight, height: rows);
}

/// The row of who asked: the faces, or the line beside them if the text
/// is larger.
double _whoHeight(TextScaler scaler) =>
    math.max(_face, scaler.scale(KitText.px13.lineHeight));

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

/// One request: the poster, sharp, beside the request's rows, over the
/// same poster blurred and darkened, so the card takes its colours from
/// the title. The picture is dark in either scheme, so the card is drawn
/// in the theme's dark half. The year and the name open the title; with
/// [wholeYear], a year line that's cut shows all of it instead. Then [who]
/// on a [queue] card, [badge], [problem], and [actions] on the bottom edge, each row in
/// its place whether it's there or not. [onMore] puts the request's menu
/// in the top corner.
class RequestCard extends StatelessWidget {
  const RequestCard({
    super.key,
    required this.title,
    required this.library,
    required this.scope,
    required this.availability,
    required this.badge,
    required this.queue,
    this.who,
    this.problem,
    this.actions,
    this.onMore,
    this.wholeYear = false,
  });

  final CatalogTitleSummary title;
  final String library;
  final ShowScope? scope;

  /// The title's, which says where its page is.
  final Availability availability;
  final Widget badge;
  final bool queue;
  final Widget? who;
  final Widget? problem;
  final Widget? actions;
  final VoidCallback? onMore;
  final bool wholeYear;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return MatineeTheme.alwaysDark(
      context,
      Builder(
        builder: (context) {
          final colors = MatineeTheme.of(context);
          final scaler = MediaQuery.textScalerOf(context);
          final layout = requestCardLayout(scaler, queue: queue);
          double line(double height) => scaler.scale(height);
          final poster = title.poster;
          final year = [
            if (title.year case final year?) '$year',
            ?scopeText(scope, l),
          ].join(' · ');
          final onMore = this.onMore;
          // Clear of the menu's button in the corner.
          final clear = EdgeInsetsDirectional.only(
            end: onMore == null ? 0 : 28,
          );
          void open() => _open(context, title, library, availability);
          final yearText = Text(
            year,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: KitText.xs.style(color: colors.mutedForeground),
          );
          final nameText = Text(
            title.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: KitText.base.style(
              color: colors.foreground,
              weight: FontWeight.w600,
              leading: 20,
            ),
          );
          Widget pressable(
            String label,
            VoidCallback onPressed,
            Widget child,
          ) => PressIndication(
            onPressed: onPressed,
            label: label,
            shape: const BorderRadius.all(Radius.circular(4)),
            builder: (context, _) => ExcludeSemantics(
              child: Padding(padding: clear, child: child),
            ),
          );
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
                  padding: const EdgeInsets.all(_padding),
                  child: SizedBox(
                    height: layout.height,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      spacing: _gap,
                      children: [
                        SizedBox(
                          width: layout.poster,
                          height: layout.height,
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
                              LayoutBuilder(
                                builder: (context, constraints) {
                                  final cut =
                                      wholeYear &&
                                      _cut(
                                        context,
                                        yearText,
                                        constraints.maxWidth - clear.end,
                                      );
                                  if (!cut) {
                                    return pressable(
                                      [title.name, year].join(', '),
                                      open,
                                      Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          yearText,
                                          const SizedBox(height: _afterYear),
                                          nameText,
                                        ],
                                      ),
                                    );
                                  }
                                  return Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      pressable(
                                        year,
                                        () => unawaited(
                                          _showWhole(context, title.name, [
                                            year,
                                          ]),
                                        ),
                                        yearText,
                                      ),
                                      const SizedBox(height: _afterYear),
                                      pressable(title.name, open, nameText),
                                    ],
                                  );
                                },
                              ),
                              if (queue) ...[
                                const SizedBox(height: _rowGap),
                                SizedBox(
                                  height: _whoHeight(scaler),
                                  child: who,
                                ),
                              ],
                              const SizedBox(height: _rowGap),
                              SizedBox(
                                height: _badge,
                                child: Align(
                                  alignment: AlignmentDirectional.centerStart,
                                  child: badge,
                                ),
                              ),
                              const SizedBox(height: _rowGap),
                              SizedBox(
                                height: line(KitText.px13.lineHeight),
                                child: problem,
                              ),
                              const Spacer(),
                              SizedBox(
                                height: ButtonSize.sm.height,
                                child: Align(
                                  alignment: AlignmentDirectional.centerStart,
                                  child: actions,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                if (onMore != null)
                  PositionedDirectional(
                    top: 6,
                    end: 6,
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
          );
        },
      ),
    );
  }
}

/// The one badge a request card carries: a mark and a word for the
/// [state] the server gave the request, with how much is in while it's on
/// its way when the server says. With [urgent], for whoever runs the
/// queue, what's theirs to answer stands out, waiting in the accent and
/// needs attention in the danger colour; on an asker's own card both read
/// plain. What's on its way is a plain pill; what's done is quiet, an
/// outline in muted words.
class RequestStateBadge extends StatelessWidget {
  const RequestStateBadge({
    super.key,
    required this.state,
    this.progress,
    this.urgent = false,
  });

  /// A [RequestState].
  final String state;

  /// The share that's in, for one on its way.
  final double? progress;
  final bool urgent;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final progress = this.progress;
    final quiet = colors.foreground.withValues(alpha: .7);
    final (Color?, Color?, Color, Color) plain = (
      colors.secondary,
      null,
      colors.foreground,
      colors.foreground,
    );
    final (Color?, Color?, Color, Color) finished = (
      null,
      colors.foreground.withValues(alpha: .2),
      quiet,
      quiet,
    );
    final (fill, edge, mark, ink) = switch (state) {
      RequestState.needsAttention when urgent => (
        colors.danger.withValues(alpha: .2),
        colors.danger.withValues(alpha: .55),
        colors.danger,
        colors.foreground,
      ),
      RequestState.needsAttention || RequestState.onTheWay => plain,
      RequestState.here || RequestState.declined => finished,
      // Waiting, and a state this app doesn't know yet.
      _ when urgent => (
        colors.accentSoft,
        colors.accent.withValues(alpha: .5),
        colors.accent,
        colors.foreground,
      ),
      _ => plain,
    };
    final text = switch (state) {
      RequestState.needsAttention => l.webRequestsStateNeedsAttention,
      RequestState.onTheWay when progress != null =>
        l.webRequestsStateOnTheWayPercent(formatPercent(progress, l)),
      RequestState.onTheWay => l.webRequestsStateOnTheWay,
      RequestState.here => l.webRequestsStateHere,
      RequestState.declined => l.webRequestsStateDeclined,
      _ => l.webRequestsStateWaiting,
    };
    final Widget glyph = switch (state) {
      RequestState.needsAttention => KitIcon(
        Lucide.triangleAlert,
        size: 12,
        color: mark,
      ),
      RequestState.onTheWay => ProgressRing(progress, size: 14),
      RequestState.here => KitIcon(Lucide.check, size: 12, color: mark),
      RequestState.declined => KitIcon(
        Lucide.circleSlash,
        size: 12,
        color: mark,
      ),
      _ => KitIcon(Lucide.clock, size: 12, color: mark),
    };
    return Container(
      height: 24,
      padding: const EdgeInsets.symmetric(horizontal: 9),
      decoration: BoxDecoration(
        color: fill,
        borderRadius: KitRadius.pill,
        border: edge == null ? null : Border.all(color: edge),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: 6,
        children: [
          glyph,
          Flexible(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: KitText.xs.style(color: ink, weight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }
}

/// [build] under the theme's dark half, where a card draws, so what it
/// builds for the card takes the card's colours.
Widget _dark(BuildContext context, WidgetBuilder build) =>
    MatineeTheme.alwaysDark(context, Builder(builder: build));

/// A line under the badge, muted unless [color] says otherwise, cut to
/// one.
class _Line extends StatelessWidget {
  const _Line(String this.text, {this.color}) : spans = null;

  const _Line.rich(List<InlineSpan> this.spans) : text = null, color = null;

  final String? text;
  final List<InlineSpan>? spans;
  final Color? color;

  @override
  Widget build(BuildContext context) => Text.rich(
    TextSpan(text: text, children: spans),
    maxLines: 1,
    overflow: TextOverflow.ellipsis,
    style: KitText.px13.style(
      color: color ?? MatineeTheme.of(context).mutedForeground,
    ),
  );
}

// An admin's cards.

/// One request of the queue, in the state the server gave it: who asked,
/// the state's badge, the error or the decline's answer when there's one,
/// and the state's actions. Its menu has the rest: when they asked, where
/// it goes and how, how far along it is or when it arrived, the
/// request's whole problem, "Goes to", the title's page, the request in
/// its connection, and what the connection reported. [onAnswered] runs
/// when an answer takes a request out of Done, which pages of its own
/// hold.
class QueueCard extends ConsumerWidget {
  const QueueCard({super.key, required this.item, this.onAnswered});

  final AdminRequestItem item;
  final ValueChanged<AdminRequestItem>? onAnswered;

  @override
  Widget build(BuildContext context, WidgetRef ref) => _dark(
    context,
    (context) => RequestCard(
      title: item.title,
      library: item.library.id,
      scope: item.scope,
      availability: item.availability,
      queue: true,
      badge: RequestStateBadge(
        state: item.state,
        progress: item.state == RequestState.onTheWay
            ? item.availability.progress
            : null,
        urgent: true,
      ),
      who: _Askers(item: item),
      problem: _problem(context),
      actions: _QueueActions(item: item, onAnswered: onAnswered),
      onMore: () => unawaited(
        showRequestMenu(context, ref, item, onAnswered: onAnswered),
      ),
    ),
  );

  /// What went wrong, the one line under the badge: the error when it
  /// needs attention, or why it was declined and the note.
  Widget? _problem(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    switch (item.state) {
      case RequestState.needsAttention:
        return _Line(queueError(item, l), color: colors.danger);
      case RequestState.declined:
        final note = queueNote(item);
        return _Line.rich([
          TextSpan(text: queueReason(item, l)),
          if (note != null)
            TextSpan(
              text: ' · $note',
              style: TextStyle(
                color: colors.foreground.withValues(alpha: .7),
                fontStyle: FontStyle.italic,
              ),
            ),
        ]);
      default:
        return null;
    }
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

/// A queue card's actions, the state's own: Add and Decline while it
/// waits, Retry and Give up when it needs attention, Add after all once
/// declined, with Allow requests again in its menu, as the web has both
/// for a card's one line. Each is held for Undo by the hub.
class _QueueActions extends ConsumerWidget {
  const _QueueActions({required this.item, this.onAnswered});

  final AdminRequestItem item;
  final ValueChanged<AdminRequestItem>? onAnswered;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final hub = ref.read(requestsProvider.notifier);
    final List<Widget> buttons = switch (item.state) {
      RequestState.waiting => [
        AddButton(item: item, small: true),
        DeclineButton(item: item, small: true),
      ],
      RequestState.needsAttention => [
        _SmallButton(
          look: ButtonLook.secondary,
          icon: Lucide.rotateCw,
          text: l.webRequestsRetry,
          label: l.webRequestsRetryNamed(item.title.name),
          onPressed: () => unawaited(hub.retry(l, item)),
        ),
        _SmallButton(
          text: l.webRequestsGiveUp,
          onPressed: () =>
              unawaited(showDeclineSheet(context, item, giveUp: true)),
        ),
      ],
      RequestState.declined => [
        _SmallButton(
          look: ButtonLook.secondary,
          icon: Lucide.check,
          text: l.webRequestsAddAfterAll,
          label: l.webRequestsAddAfterAllNamed(item.title.name),
          onPressed: () {
            onAnswered?.call(item);
            unawaited(hub.answer(l, item, const AddAfterAllAnswer()));
          },
        ),
      ],
      // Giving up on one on its way is rare and in its menu.
      _ => const [],
    };
    if (buttons.isEmpty) return const SizedBox.shrink();
    // One row, whatever the width: a word that doesn't fit is cut.
    return Row(
      mainAxisSize: MainAxisSize.min,
      spacing: 8,
      children: [for (final button in buttons) Flexible(child: button)],
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

/// The first few who asked, and the first one's name and how many others,
/// on one line.
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
              width: _face + (faces.length - 1) * 14,
              height: _face,
              child: Stack(
                children: [
                  // Painted last to first, so the first asker, the one the
                  // card names, is the face that shows whole.
                  for (final (index, face) in faces.indexed.toList().reversed)
                    PositionedDirectional(
                      start: index * 14,
                      child: Container(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: colors.background,
                            width: 1.5,
                          ),
                        ),
                        child: Avatar(
                          avatarId: face.avatarId,
                          name: face.name,
                          size: 17,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              child: Text(
                others == 0
                    ? first.name
                    : '${first.name} ${l.webRequestsOthersCount(formatCount(others, l))}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: KitText.px13.style(color: colors.mutedForeground),
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
                if (choosesLibrary(item))
                  SheetItem(
                    icon: Lucide.libraryBig,
                    label: l.webRequestsGoesToTitle,
                    onPressed: () =>
                        then(() => unawaited(showGoesToSheet(context, item))),
                  ),
                SheetItem(
                  icon: Lucide.check,
                  label: l.webRequestsAdd,
                  onPressed: () => then(
                    () => unawaited(hub.answer(l, item, const AddAnswer())),
                  ),
                ),
                SheetItem(
                  icon: Lucide.x,
                  label: l.webRequestsDecline,
                  onPressed: () =>
                      then(() => unawaited(showDeclineSheet(context, item))),
                ),
              ],
              RequestState.needsAttention => [
                SheetItem(
                  icon: Lucide.rotateCw,
                  label: l.webRequestsRetry,
                  onPressed: () => then(() => unawaited(hub.retry(l, item))),
                ),
                SheetItem(
                  icon: Lucide.circleSlash,
                  label: l.webRequestsGiveUp,
                  onPressed: giveUp,
                ),
              ],
              RequestState.onTheWay => [
                SheetItem(
                  icon: Lucide.circleSlash,
                  label: l.webRequestsGiveUp,
                  onPressed: giveUp,
                ),
              ],
              RequestState.declined => [
                SheetItem(
                  icon: Lucide.check,
                  label: l.webRequestsAddAfterAll,
                  onPressed: () => reopen(const AddAfterAllAnswer()),
                ),
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

// A person's own cards.

/// One of the viewer's own requests, as the server says it stands: its
/// state's badge, why it was declined and the note when it was (all of it
/// a tap away), and Cancel while the server allows it. Cancel is held for
/// Undo, as an admin's answers are. With [live], the title's state is the
/// one the screen's live stream last said.
class OwnRequestCard extends ConsumerWidget {
  const OwnRequestCard({super.key, required this.item, this.live = false});

  final RequestItem item;
  final bool live;

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      _dark(context, (context) => _card(context, ref));

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
    return RequestCard(
      title: item.title,
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
      ),
      problem: _problem(context, availability),
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
                l.commonCancel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            )
          : null,
    );
  }

  /// Why it was declined and the note an admin left, the one thing that
  /// can go wrong that's the asker's to read; a tap on it opens all of it.
  Widget? _problem(BuildContext context, Availability availability) {
    if (item.state != RequestState.declined) return null;
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final reason = availability.reason;
    if (reason == null) return null;
    final why = declineText(reason, l);
    final note = reason.note?.trim();
    final hasNote = note != null && note.isNotEmpty;
    return PressIndication(
      onPressed: () => unawaited(
        _showWhole(context, item.title.name, [why, if (hasNote) note]),
      ),
      label: [why, if (hasNote) note].join(' '),
      shape: const BorderRadius.all(Radius.circular(4)),
      builder: (context, _) => ExcludeSemantics(
        child: _Line.rich([
          TextSpan(text: why),
          if (hasNote)
            TextSpan(
              text: ' $note',
              style: TextStyle(
                color: colors.foreground.withValues(alpha: .7),
                fontStyle: FontStyle.italic,
              ),
            ),
        ]),
      ),
    );
  }
}

/// Text a card cuts to a line, all of it, under the title's [name]: a
/// declined request's reason and note, or the seasons it asked for.
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
