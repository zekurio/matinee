import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart';
import '../../media/format.dart';
import '../../media/watched_at.dart';
import '../../router.dart';

/// What an entry in the panel does once the panel has closed, with the
/// context of what opened it.
typedef _Act = Future<void> Function(BuildContext context);

typedef _Entry = ({String icon, String label, _Act run});

/// Opens [target]'s actions in the TV's panel at the right edge, as the
/// Kotlin app's `TvActionsPanel`: the phone's menu without the downloads
/// and the admin's metadata items. Focus goes back to the card that opened
/// it, or to the page an entry opened.
Future<void> showTvActions(BuildContext context, ActionTarget target) async {
  final l = AppLocalizations.of(context);
  final (title, description, entries) = switch (target) {
    ItemActions(:final item, :final here) => _item(l, item, here),
    TitleActions(:final title, :final file, :final recommended, :final here) =>
      _title(l, title, file, recommended, here),
    SeasonActions(:final title, :final season, :final here) => _season(
      l,
      title,
      season,
      here,
    ),
  };
  if (entries.isEmpty) return;
  final act = await showTvPanel<_Act>(
    context,
    title: title,
    description: description,
    builder: (panel) => [
      for (final entry in entries)
        TvListItem(
          title: entry.label,
          icon: entry.icon,
          quiet: true,
          onPressed: () => Navigator.of(panel).pop(entry.run),
        ),
    ],
  );
  if (act != null && context.mounted) await act(context);
}

/// Marks unwatched at once, or asks in the panel when it was watched.
Future<void> _toggleWatched(
  BuildContext context, {
  required bool watched,
  required String name,
  required Future<void> Function(MatineeApi api, bool watched, String? at) send,
}) => toggleWatched(
  context,
  watched: watched,
  name: name,
  send: send,
  ask: askTvWatchedAt,
);

(String, String?, List<_Entry>) _item(
  AppLocalizations l,
  MediaItem item,
  bool here,
) {
  final names = itemNames(item, l);
  final code = episodeCode(item, l);
  final name = code == null ? names.showName : names.title;
  final resume = isResuming(item);
  final watched = isWatched(item);
  final favorite = isFavoriteItem(item);
  final title = item.title;
  return (
    name,
    code == null ? names.year : names.showName,
    [
      if (!here)
        (
          icon: Lucide.playOutline,
          label: resume ? l.titleResume : l.titlePlay,
          run: (context) async => unawaited(context.push(Routes.play(item.id))),
        ),
      if (resume) _fromStart(l, item),
      if (!here) ...[
        (
          icon: Lucide.check,
          label: watched ? l.mediaMarkUnwatched : l.mediaMarkWatched,
          run: (context) => _toggleWatched(
            context,
            watched: watched,
            name: name,
            send: (api, to, at) =>
                MediaMarks.item(api, item, watched: to, at: at),
          ),
        ),
        _favorite(
          l,
          favorite,
          (api, to) => MediaMarks.favoriteItem(api, item, favorite: to),
        ),
        if (title != null && title.kind == TitleKind.show) ...[
          _link(l.actionsEpisodeDetails, Lucide.info, Routes.episode(item.id)),
          _link(
            l.actionsGoToShow(title.name),
            Lucide.tv,
            Routes.title(title.id),
          ),
        ] else if (title != null)
          _link(l.mediaHeroDetails, Lucide.info, Routes.title(title.id)),
      ],
    ],
  );
}

(String, String?, List<_Entry>) _title(
  AppLocalizations l,
  TitleSummary title,
  MediaItem? file,
  CatalogRef? recommended,
  bool here,
) {
  final show = title.kind == TitleKind.show;
  return (
    title.name,
    title.year?.toString(),
    [
      if (!here)
        (
          icon: Lucide.playOutline,
          label: l.titlePlay,
          run: (context) => playTitle(context, title),
        ),
      if (file != null && isResuming(file)) _fromStart(l, file),
      if (!here) ...[
        (
          icon: Lucide.check,
          label: switch ((show, title.watched)) {
            (true, true) => l.mediaMarkAllUnwatched,
            (true, false) => l.mediaMarkAllWatched,
            (false, true) => l.mediaMarkUnwatched,
            (false, false) => l.mediaMarkWatched,
          },
          run: (context) => _toggleWatched(
            context,
            watched: title.watched,
            name: title.name,
            send: (api, to, at) =>
                MediaMarks.title(api, title.id, watched: to, at: at),
          ),
        ),
        _favorite(
          l,
          title.favorite,
          (api, to) => MediaMarks.favoriteTitle(api, title.id, favorite: to),
        ),
        _link(
          show ? l.mediaHeroEpisodes : l.mediaHeroDetails,
          Lucide.info,
          Routes.title(title.id),
        ),
      ],
      if (recommended != null)
        (
          icon: Lucide.eyeOff,
          label: l.webDiscoverNotInterested,
          run: (context) => notInterested(context, title, recommended),
        ),
    ],
  );
}

(String, String?, List<_Entry>) _season(
  AppLocalizations l,
  TitleSummary title,
  Season season,
  bool here,
) {
  final name = seasonName(season.number, l);
  final number = season.number;
  final watched =
      season.itemCount > 0 && season.watchedCount >= season.itemCount;
  if (here) return (name, title.name, const []);
  return (
    name,
    title.name,
    [
      (
        icon: Lucide.check,
        label: watched ? l.mediaMarkUnwatched : l.mediaMarkWatched,
        run: (context) => _toggleWatched(
          context,
          watched: watched,
          name: l.titleSeasonOf(title.name, name),
          send: (api, to, at) =>
              MediaMarks.season(api, title.id, number, watched: to, at: at),
        ),
      ),
      // The files without a season number aren't a season to mark.
      if (number != null)
        _favorite(
          l,
          season.favorite,
          (api, to) =>
              MediaMarks.favoriteSeason(api, title.id, number, favorite: to),
        ),
      _link(l.mediaHeroEpisodes, Lucide.list, seasonRoute(title.id, number)),
    ],
  );
}

_Entry _fromStart(AppLocalizations l, MediaItem item) => (
  icon: Lucide.rotateCcw,
  label: l.actionsPlayFromStart,
  run: (context) async =>
      unawaited(context.push(Routes.play(item.id), extra: 0.0)),
);

_Entry _favorite(
  AppLocalizations l,
  bool favorite,
  Future<void> Function(MatineeApi api, bool favorite) send,
) => (
  icon: favorite ? Lucide.heartFilled : Lucide.heart,
  label: favorite ? l.mediaRemoveFavorite : l.mediaAddFavorite,
  run: (context) => toggleFavorite(context, favorite: favorite, send: send),
);

_Entry _link(String label, String icon, String route) => (
  icon: icon,
  label: label,
  run: (context) async => unawaited(context.push(route)),
);

enum _When { now, released, other, unknown }

/// When [name] was watched, asked in the TV's panel as the phone's sheet
/// asks: now, on release, a day the person picks, or they don't remember.
Future<WatchedWhen?> askTvWatchedAt(BuildContext context, String name) async {
  final l = AppLocalizations.of(context);
  while (true) {
    if (!context.mounted) return null;
    final when = await showTvPanel<_When>(
      context,
      title: l.mediaMarkWatched,
      description: name,
      builder: (panel) {
        void pick(_When when) => Navigator.of(panel).pop(when);
        return [
          TvListItem(
            title: l.mediaWatchedAtNow,
            icon: Lucide.clock,
            quiet: true,
            onPressed: () => pick(_When.now),
          ),
          TvListItem(
            title: l.mediaWatchedAtReleased,
            icon: Lucide.calendar,
            quiet: true,
            onPressed: () => pick(_When.released),
          ),
          TvListItem(
            title: l.mediaWatchedAtOther,
            icon: Lucide.calendarClock,
            quiet: true,
            onPressed: () => pick(_When.other),
          ),
          TvListItem(
            title: l.mediaWatchedAtUnknown,
            icon: Lucide.calendarOff,
            quiet: true,
            onPressed: () => pick(_When.unknown),
          ),
        ];
      },
    );
    switch (when) {
      case null:
        return null;
      case _When.now:
        return (at: null);
      case _When.released:
        return (at: WatchedAt.released);
      case _When.unknown:
        return (at: WatchedAt.unknown);
      case _When.other:
        if (!context.mounted) return null;
        final day = await showTvPanel<DateTime>(
          context,
          title: l.mediaWatchedDateTitle,
          description: name,
          builder: (panel) => [const _DayPicker()],
        );
        // From the day, Back goes to the question it came from.
        if (day != null) return (at: watchedAtOn(day));
    }
  }
}

/// The day, month, and year of the watched day, each a row that Left and
/// Right step, and the button that marks it.
class _DayPicker extends StatefulWidget {
  const _DayPicker();

  @override
  State<_DayPicker> createState() => _DayPickerState();
}

class _DayPickerState extends State<_DayPicker> {
  late final DateTime _today = () {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day);
  }();
  late DateTime _day = _today;

  DateTime _atMost(DateTime day) => day.isAfter(_today) ? _today : day;

  int _length(int year, int month) => DateTime(year, month + 1, 0).day;

  void _stepDay(int step) => setState(() {
    final length = _length(_day.year, _day.month);
    final day = (_day.day - 1 + step) % length + 1;
    _day = _atMost(DateTime(_day.year, _day.month, day));
  });

  void _stepMonth(int step) => setState(() {
    final month = DateTime(_day.year, _day.month + step);
    final day = _day.day.clamp(1, _length(month.year, month.month));
    _day = _atMost(DateTime(month.year, month.month, day));
  });

  void _stepYear(int step) => setState(() {
    final year = _day.year + step;
    final day = _day.day.clamp(1, _length(year, _day.month));
    _day = _atMost(DateTime(year, _day.month, day));
  });

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final month = DateFormat.LLLL(l.localeName).format(_day);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 4,
      children: [
        _DayField(value: '${_day.day}', onStep: _stepDay, autofocus: true),
        _DayField(value: month, onStep: _stepMonth),
        _DayField(value: '${_day.year}', onStep: _stepYear),
        const SizedBox(height: 12),
        TvListItem(
          title: l.mediaMarkWatched,
          icon: Lucide.check,
          quiet: true,
          onPressed: () => Navigator.of(context).pop(_day),
        ),
      ],
    );
  }
}

/// One part of the watched day, as a row: Left and Right step it back or
/// forward, with arrows either side while it's focused.
class _DayField extends StatelessWidget {
  const _DayField({
    required this.value,
    required this.onStep,
    this.autofocus = false,
  });

  final String value;
  final ValueChanged<int> onStep;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return TvFocusable(
      autofocus: autofocus,
      label: value,
      button: false,
      onKey: (event) {
        final step = switch (event.logicalKey) {
          LogicalKeyboardKey.arrowLeft => -1,
          LogicalKeyboardKey.arrowRight => 1,
          _ => 0,
        };
        if (step == 0) return KeyEventResult.ignored;
        if (event is! KeyUpEvent) onStep(step);
        return KeyEventResult.handled;
      },
      builder: (context, focused) => TvControl(
        focused: focused,
        radius: TvListItems.radius,
        rest: colors.foreground.withValues(alpha: .07),
        scale: TvFocus.rowScale,
        builder: (context, content) {
          final arrow = focused ? content : const Color(0x00000000);
          return SizedBox(
            height: TvListItems.height,
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: TvListItems.inset,
              ),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: focused ? () => onStep(-1) : null,
                    child: KitIcon(Lucide.chevronLeft, size: 20, color: arrow),
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text(
                        value,
                        textAlign: TextAlign.center,
                        style: TvType.facts.style(color: content),
                      ),
                    ),
                  ),
                  GestureDetector(
                    onTap: focused ? () => onStep(1) : null,
                    child: KitIcon(Lucide.chevronRight, size: 20, color: arrow),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
