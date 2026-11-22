import 'dart:async';
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
import '../../media/format.dart' show seasonName;
import '../../router.dart';
import 'catalog_cards.dart';
import 'request_sheet.dart';
import 'request_words.dart';
import 'requests_hub.dart';

/// The request cards that Explore's Recent requests row and the requests
/// overview share, as Seerr draws them and the web's `request-card.tsx`
/// does: the poster beside who asked and how it stands, with one badge for
/// the state ([RequestStateBadge]), the state's own line under it, and the
/// state's own actions at the foot.

/// How many askers' faces a card shows; the count after the first name
/// says the rest.
const _faces = 3;

/// The poster's width on a card, 2:3.
const requestPosterWidth = 96.0;

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

/// One request: the poster, sharp, beside the request's details, over the
/// same poster blurred and darkened, so the card takes its colours from
/// the title. The picture is dark in either scheme, so the card is drawn
/// in the theme's dark half. The year and kind, the name, and what a
/// show's request covers open the title; then [state], [who], and
/// [actions], which each card fills with its own. [onMore] puts the
/// request's menu at the top corner.
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
    this.onMore,
  });

  final CatalogTitleSummary title;
  final String library;
  final ShowScope? scope;

  /// The title's, which says where its page is.
  final Availability availability;
  final List<Widget> state;
  final Widget who;
  final Widget? actions;
  final VoidCallback? onMore;

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
          final onMore = this.onMore;
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
                        width: requestPosterWidth,
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
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              spacing: 4,
                              children: [
                                Expanded(
                                  child: PressIndication(
                                    onPressed: open,
                                    label: [
                                      title.name,
                                      facts,
                                      ?scope,
                                    ].join(', '),
                                    shape: const BorderRadius.all(
                                      Radius.circular(4),
                                    ),
                                    builder: (context, _) => ExcludeSemantics(
                                      child: _Heading(
                                        facts: facts,
                                        name: title.name,
                                        scope: scope,
                                      ),
                                    ),
                                  ),
                                ),
                                if (onMore != null)
                                  // Up into the padding, so the corner
                                  // button sits level with the year.
                                  Transform.translate(
                                    offset: const Offset(6, -6),
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
                            const SizedBox(height: 10),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              spacing: 6,
                              children: state,
                            ),
                            const SizedBox(height: 10),
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

/// The year and kind, the name, and what a show's request covers.
class _Heading extends StatelessWidget {
  const _Heading({required this.facts, required this.name, this.scope});

  final String facts;
  final String name;
  final String? scope;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final scope = this.scope;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          facts,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: KitText.xs.style(color: colors.mutedForeground),
        ),
        Text(
          name,
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
              style: KitText.xs.style(color: colors.mutedForeground),
            ),
          ),
      ],
    );
  }
}

/// The one badge a request card carries: a mark and a word for its
/// [state], with how much is in while it's on its way when the server
/// says. What waits on an admin, or needs one, stands out in the accent
/// and the danger colour; what's on its way is a plain pill; what's done
/// is quiet, an outline in muted words.
class RequestStateBadge extends StatelessWidget {
  const RequestStateBadge({super.key, required this.state, this.progress});

  final RequestState state;

  /// The share that's in, for one on its way.
  final double? progress;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final progress = this.progress;
    final quiet = colors.foreground.withValues(alpha: .7);
    final (fill, edge, mark, ink) = switch (state) {
      RequestState.waiting => (
        colors.accentSoft,
        colors.accent.withValues(alpha: .5),
        colors.accent,
        colors.foreground,
      ),
      RequestState.needsAttention => (
        colors.danger.withValues(alpha: .2),
        colors.danger.withValues(alpha: .55),
        colors.danger,
        colors.foreground,
      ),
      RequestState.onTheWay => (
        colors.secondary,
        null,
        colors.foreground,
        colors.foreground,
      ),
      RequestState.here || RequestState.declined => (
        null,
        colors.foreground.withValues(alpha: .2),
        quiet,
        quiet,
      ),
    };
    final text = switch (state) {
      RequestState.waiting => l.requestStateWaiting,
      RequestState.needsAttention => l.requestStateNeedsAttention,
      RequestState.onTheWay when progress != null =>
        l.requestStateOnTheWayPercent(formatPercent(progress, l)),
      RequestState.onTheWay => l.requestStateOnTheWay,
      RequestState.here => l.requestStateHere,
      RequestState.declined => l.requestStateDeclined,
    };
    final Widget glyph = switch (state) {
      RequestState.waiting => KitIcon(Lucide.clock, size: 12, color: mark),
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

/// A line under the badge, muted unless [color] says otherwise.
class _Line extends StatelessWidget {
  const _Line(this.text, {this.color, this.lines = 1, this.italic = false});

  final String text;
  final Color? color;
  final int lines;
  final bool italic;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final style = KitText.px13.style(color: color ?? colors.mutedForeground);
    return Text(
      text,
      maxLines: lines,
      overflow: TextOverflow.ellipsis,
      style: italic ? style.copyWith(fontStyle: FontStyle.italic) : style,
    );
  }
}

/// A thin bar of how much is in.
class _Bar extends StatelessWidget {
  const _Bar(this.progress);

  final double progress;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return ClipRRect(
      borderRadius: KitRadius.pill,
      child: SizedBox(
        height: 3,
        child: ColoredBox(
          color: colors.foreground.withValues(alpha: .15),
          child: FractionallySizedBox(
            alignment: AlignmentDirectional.centerStart,
            widthFactor: progress.clamp(0, 1).toDouble(),
            child: ColoredBox(color: colors.accent),
          ),
        ),
      ),
    );
  }
}

// An admin's cards.

/// One request of the queue, in any [state]: who asked and when, the
/// state's line, and the state's actions. Its menu has those and the rest:
/// "Goes to", the title's page, the request in its connection, and what
/// the connection reported. [onAnswered] runs when an answer takes a
/// request out of Done, which pages of its own hold.
class QueueCard extends ConsumerWidget {
  const QueueCard({
    super.key,
    required this.item,
    required this.state,
    this.onAnswered,
  });

  final AdminRequestItem item;
  final RequestState state;
  final ValueChanged<AdminRequestItem>? onAnswered;

  @override
  Widget build(BuildContext context, WidgetRef ref) => _dark(
    context,
    (context) => RequestCard(
      title: item.title,
      library: item.library.id,
      scope: item.scope,
      availability: item.availability,
      state: [
        RequestStateBadge(
          state: state,
          progress: state == RequestState.onTheWay
              ? item.availability.progress
              : null,
        ),
        ..._queueLines(context, ref),
      ],
      who: _Askers(item: item),
      actions: _QueueActions(item: item, state: state, onAnswered: onAnswered),
      onMore: () => unawaited(
        showRequestMenu(context, ref, item, state, onAnswered: onAnswered),
      ),
    ),
  );

  List<Widget> _queueLines(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    switch (state) {
      case RequestState.waiting:
        // Where it goes: its own library, or the one chosen under "Goes
        // to", and what fills it.
        final goes = ref.watch(
          requestsProvider.select((state) => state.goesTo(item)),
        );
        final connection = goes.connection;
        return [
          Text.rich(
            TextSpan(
              children: [
                TextSpan(text: '${goes.name} · '),
                if (connection != null)
                  TextSpan(text: connection)
                else
                  TextSpan(
                    text: l.webRequestsNoConnection,
                    style: TextStyle(color: colors.danger),
                  ),
              ],
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: KitText.px13.style(color: colors.mutedForeground),
          ),
        ];
      case RequestState.needsAttention:
        return [
          _Line(
            item.error?.serverWords(l) ?? l.webRequestsAttentionUnknown,
            color: colors.danger,
            lines: 2,
          ),
        ];
      case RequestState.onTheWay:
        return _progressLines(context);
      case RequestState.declined:
        final gaveUp = item.reason == DeclineReason.notFound;
        final at = relativeTime(item.declinedAt, l);
        final reason = item.reason;
        final note = item.note?.trim();
        return [
          _Line(
            [
              switch ((gaveUp, at)) {
                (true, final at?) => l.webRequestsDoneGaveUp(at),
                (false, final at?) => l.webRequestsDoneDeclined(at),
                (true, null) => l.webRequestsDoneGaveUpUndated,
                (false, null) => l.webRequestsDoneDeclinedUndated,
              },
              if (reason != null && !gaveUp) adminReasonText(reason, l),
            ].join(' · '),
            lines: 2,
          ),
          if (note != null && note.isNotEmpty)
            _Line(
              note,
              color: colors.foreground.withValues(alpha: .7),
              lines: 2,
              italic: true,
            ),
        ];
      case RequestState.here:
        final arrived = relativeTime(item.arrivedAt, l);
        return [
          _Line(
            [
              if (arrived != null) l.webRequestsDoneArrived(arrived),
              item.library.name,
            ].join(' · '),
          ),
        ];
    }
  }

  /// How far along it is: a bar while the server knows the share, and how
  /// long is left, or what it waits on, and where it goes.
  List<Widget> _progressLines(BuildContext context) {
    final l = AppLocalizations.of(context);
    final availability = item.availability;
    final progress = availability.progress;
    final eta = availability.etaSeconds;
    final String? status;
    if (availability.state == AvailabilityState.release) {
      final day = parseDay(availability.releaseDate);
      status = day == null
          ? l.webRequestsProgressNotOut
          : l.webRequestsProgressRelease(formatShortDay(day, l));
    } else if (progress != null) {
      // The badge has the share.
      status = eta == null
          ? null
          : l.webRequestsProgressLeft(formatSpan(eta, l));
    } else if (availability.stillLooking) {
      status = l.webRequestsProgressLooking;
    } else if (item.fulfilmentState == FulfilmentState.queued) {
      status = l.webRequestsProgressQueued;
    } else if (item.connection?.reportsProgress == false) {
      status = l.webRequestsProgressByHand;
    } else {
      status = l.webRequestsProgressSent;
    }
    return [
      if (progress != null)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: _Bar(progress),
        ),
      _Line([?status, item.library.name].join(' · ')),
    ];
  }
}

/// A queue card's actions, the state's own: Add and Decline while it
/// waits, Retry and Give up when it needs attention, Add after all and
/// Allow again once declined. Each is held for Undo by the hub.
class _QueueActions extends ConsumerWidget {
  const _QueueActions({
    required this.item,
    required this.state,
    this.onAnswered,
  });

  final AdminRequestItem item;
  final RequestState state;
  final ValueChanged<AdminRequestItem>? onAnswered;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final hub = ref.read(requestsProvider.notifier);
    void reopen(QueueAnswer answer) {
      onAnswered?.call(item);
      unawaited(hub.answer(l, item, answer));
    }

    final List<Widget> buttons = switch (state) {
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
          onPressed: () => reopen(const AddAfterAllAnswer()),
        ),
        _SmallButton(
          text: l.webRequestsAllowAgain,
          onPressed: () => reopen(const AllowAgainAnswer()),
        ),
      ],
      // Giving up on one on its way is rare and in its menu.
      RequestState.onTheWay || RequestState.here => const [],
    };
    if (buttons.isEmpty) return const SizedBox.shrink();
    return Wrap(spacing: 8, runSpacing: 8, children: buttons);
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
                  // Painted last to first, so the first asker, the one the
                  // card names, is the face that shows whole.
                  for (final (index, face) in faces.indexed.toList().reversed)
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
  AdminRequestItem item,
  RequestState state, {
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
            ...switch (state) {
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
              RequestState.here => const <Widget>[],
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

/// One of the viewer's own requests, as the server says it stands: the
/// season it waits on, its state's badge and line (how long is left, when
/// it's out, why it was declined and the note), when they asked, and
/// Cancel while the server allows it. Cancel is held for Undo, as an
/// admin's answers are. With [live], the title's state is the one the
/// screen's live stream last said.
class OwnRequestCard extends ConsumerWidget {
  const OwnRequestCard({super.key, required this.item, this.live = false});

  final RequestItem item;
  final bool live;

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      _dark(context, (context) => _card(context, ref));

  Widget _card(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final season = item.season;
    final title = live
        ? ref.watch(
            requestsProvider.select(
              (state) => state.availability(item.title.ref, item.availability),
            ),
          )
        : item.availability;
    final availability = season?.asTitle() ?? title;
    final state = ownState(availability);
    final when = relativeTime(item.createdAt, l);
    final cancels =
        title.action == AvailabilityAction.cancel ||
        availability.action == AvailabilityAction.cancel;
    return RequestCard(
      title: item.title,
      library: item.library.id,
      scope: item.scope,
      availability: title,
      state: [
        if (season != null)
          Text(
            seasonName(season.number, l),
            style: KitText.xs.style(color: colors.mutedForeground),
          ),
        if (state != null)
          RequestStateBadge(
            state: state,
            progress: state == RequestState.onTheWay
                ? availability.progress
                : null,
          ),
        ..._ownLines(context, availability),
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

  /// The state's own line: when it's out, how long is left, when it
  /// arrived, or why it was declined and the note an admin left.
  List<Widget> _ownLines(BuildContext context, Availability availability) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    switch (availability.state) {
      case AvailabilityState.release:
        final word = stateWord(availability);
        return [if (word != null) _Line(stateText(word, l))];
      case AvailabilityState.coming:
        final progress = availability.progress;
        final eta = availability.etaSeconds;
        return [
          if (progress != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: _Bar(progress),
            ),
          if (eta != null) _Line(l.webRequestsProgressLeft(formatSpan(eta, l))),
        ];
      case AvailabilityState.here:
        final arrived = relativeTime(item.arrivedAt, l);
        return [if (arrived != null) _Line(l.webRequestsDoneArrived(arrived))];
      case AvailabilityState.unavailable:
        final reason = availability.reason;
        if (reason == null) return const [];
        final note = reason.note?.trim();
        return [
          _Line(declineText(reason, l), lines: 2),
          if (note != null && note.isNotEmpty)
            _Line(
              note,
              color: colors.foreground.withValues(alpha: .7),
              lines: 2,
              italic: true,
            ),
        ];
      default:
        return const [];
    }
  }
}
