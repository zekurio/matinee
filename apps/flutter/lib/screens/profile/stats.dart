import 'dart:math' as math;

import 'package:flutter/foundation.dart' show listEquals;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart' show NumberFormat;

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/avatar.dart';
import '../../router.dart';
import '../settings/settings_rows.dart';
import 'profile_data.dart';

/* A profile's statistics, as the web's watch-stats: the range chips, watch
   time per day, week, or month, the headline figures, the most watched
   titles, the genres, where the person stands, and when in the week they
   watch. */

/// The ranges as chips, scrolling sideways past the page's edge.
class RangeChips extends StatelessWidget {
  const RangeChips({super.key, required this.current, required this.onPick});

  final String current;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      child: Row(
        spacing: 6,
        children: [
          for (final range in StatsRange.all)
            ChoiceChip(
              label: rangeName(range, l),
              selected: range == current,
              onPressed: () => onPick(range),
            ),
        ],
      ),
    );
  }
}

/// The card statistics sit in, with the section's name in small type at
/// its top.
class StatsCard extends StatelessWidget {
  const StatsCard({super.key, required this.children, this.label});

  final String? label;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final label = this.label;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: KitRadius.panel,
        border: Border.all(color: colors.border),
      ),
      child: ClipRRect(
        borderRadius: KitRadius.panel,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (label != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
                child: Text(
                  label,
                  style: KitText.sm.style(color: colors.mutedForeground),
                ),
              ),
            ...children,
          ],
        ),
      ),
    );
  }
}

/// The range's watch time: the total, big, over watch time per day, week,
/// or month as bars. Touching a bar reads its day, week, or month out in
/// the total's place.
class WatchTimeCard extends StatelessWidget {
  const WatchTimeCard({
    super.key,
    required this.range,
    required this.unit,
    required this.watchSeconds,
    required this.buckets,
  });

  final String range;
  final String unit;
  final double watchSeconds;
  final List<StatsBucket> buckets;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    return StatsTrendCard(
      label: '${l.statsWatchTime} · ${rangeName(range, l)}',
      total: formatWatchTime(watchSeconds, l),
      points: [
        for (final bucket in buckets)
          (
            label: bucketName(bucket.start, unit, l, locale),
            detail: formatWatchTime(bucket.watchSeconds, l),
            note: null,
            value: bucket.watchSeconds,
          ),
      ],
    );
  }
}

typedef StatsPoint = ({
  String label,
  String detail,
  double value,
  String? note,
});

class StatsTrendCard extends StatefulWidget {
  const StatsTrendCard({
    super.key,
    required this.label,
    required this.total,
    required this.points,
    this.totalNote,
  });

  final String label;
  final String total;
  final List<StatsPoint> points;
  final String? totalNote;

  @override
  State<StatsTrendCard> createState() => _StatsTrendCardState();
}

class _StatsTrendCardState extends State<StatsTrendCard> {
  int? _active;

  void _touch(Offset position, double width) {
    final count = widget.points.length;
    if (count == 0 || width <= 0) return;
    final index = (position.dx / width * count).floor().clamp(0, count - 1);
    if (index != _active) setState(() => _active = index);
  }

  void _release() {
    if (_active != null) setState(() => _active = null);
  }

  @override
  void didUpdateWidget(StatsTrendCard old) {
    super.didUpdateWidget(old);
    if (!listEquals(old.points, widget.points)) _active = null;
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final points = widget.points;
    final active = _active;
    final shown = active == null ? null : points[active];
    return StatsCard(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                shown?.label ?? widget.label,
                style: KitText.sm.style(color: colors.mutedForeground),
              ),
              Text(
                shown?.detail ?? widget.total,
                style: KitText.xxxl.style(
                  color: colors.foreground,
                  weight: FontWeight.w700,
                ),
              ),
              if ((shown == null ? widget.totalNote : shown.note)
                  case final note?)
                Text(
                  note,
                  style: KitText.sm.style(color: colors.mutedForeground),
                ),
              if (points.isNotEmpty) ...[
                const SizedBox(height: 16),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final width = constraints.maxWidth;
                    return GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onPanDown: (details) =>
                          _touch(details.localPosition, width),
                      onPanUpdate: (details) =>
                          _touch(details.localPosition, width),
                      onPanEnd: (_) => _release(),
                      onPanCancel: _release,
                      child: SizedBox(
                        height: 120,
                        width: width,
                        child: CustomPaint(
                          painter: _BarsPainter(
                            values: [for (final point in points) point.value],
                            active: active,
                            accent: colors.accent,
                            baseline: colors.border,
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// The bars, thinning to lines when there are hundreds, on a baseline.
class _BarsPainter extends CustomPainter {
  _BarsPainter({
    required this.values,
    required this.active,
    required this.accent,
    required this.baseline,
  });

  final List<double> values;
  final int? active;
  final Color accent;
  final Color baseline;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawLine(
      Offset(0, size.height),
      Offset(size.width, size.height),
      Paint()
        ..color = baseline
        ..strokeWidth = 1,
    );
    if (values.isEmpty) return;
    final top = scaleTop(values.reduce(math.max));
    final slot = size.width / values.length;
    final gap = math.min(slot * .25, 4.0);
    final width = slot - gap;
    final radius = Radius.circular(math.min(2, width / 2));
    for (final (index, value) in values.indexed) {
      if (value <= 0) continue;
      final height = math.max(value / top * size.height, 2.0);
      final dim = active != null && active != index;
      canvas.drawRRect(
        RRect.fromRectAndCorners(
          Rect.fromLTWH(
            index * slot + gap / 2,
            size.height - height,
            width,
            height,
          ),
          topLeft: radius,
          topRight: radius,
        ),
        Paint()..color = dim ? accent.withValues(alpha: .45) : accent,
      );
    }
  }

  @override
  bool shouldRepaint(_BarsPainter old) =>
      !listEquals(old.values, values) ||
      old.active != active ||
      old.accent != accent ||
      old.baseline != baseline;
}

/// Plays and what was finished, a row each: an icon, what it counts, and
/// the number at the end. The server's statistics lead with how many
/// [people] watched, as the web's figures do.
class StatList extends StatelessWidget {
  const StatList({super.key, required this.totals, this.people});

  final WatchTotals totals;
  final int? people;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final count = NumberFormat.decimalPattern(
      Localizations.localeOf(context).toLanguageTag(),
    );
    return Panel(
      rows: [
        for (final (icon, label, value) in [
          if (people case final people?)
            (Lucide.users, l.webStatsFigurePeople(people), people),
          (Lucide.playOutline, l.statsPlays, totals.plays),
          (Lucide.film, l.statsMoviesFinished, totals.movies),
          (Lucide.tv, l.statsEpisodesFinished, totals.episodes),
          (Lucide.tvPlay, l.statsShowsWatched, totals.shows),
        ])
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                KitIcon(icon, size: 20, color: colors.mutedForeground),
                const SizedBox(width: 14),
                Expanded(
                  child: Text(
                    label,
                    style: KitText.base.style(color: colors.foreground),
                  ),
                ),
                Text(
                  count.format(value),
                  style: KitText.base.style(
                    color: colors.foreground,
                    weight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// A row of a card that opens something, with the press wash.
class _CardRow extends StatelessWidget {
  const _CardRow({required this.onPressed, required this.child});

  final VoidCallback? onPressed;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: onPressed,
      builder: (context, state) => PressFill(
        color: colors.foreground.withValues(
          alpha: state == PressState.idle ? 0 : .06,
        ),
        child: child,
      ),
    );
  }
}

/// The most watched titles, ranked: the poster, the name, how often it was
/// played, and its watch time at the end. Each opens its title.
class TopTitles extends StatelessWidget {
  const TopTitles({super.key, required this.titles});

  final List<TitleStat> titles;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    return StatsCard(
      label: l.statsTop,
      children: [
        for (final (index, entry) in titles.indexed) ...[
          if (index > 0) const PanelDivider(indent: 16),
          _CardRow(
            onPressed: () => context.push(Routes.title(entry.title.id)),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  SizedBox(
                    width: 26,
                    child: Text(
                      '${index + 1}',
                      style: KitText.base.style(
                        color: index < 3
                            ? colors.foreground
                            : colors.mutedForeground,
                        weight: FontWeight.w600,
                      ),
                    ),
                  ),
                  SizedBox(
                    width: 40,
                    child: ArtFrame(
                      toneKey: entry.title.id,
                      aspectRatio: CardMetrics.poster,
                      children: [
                        if (entry.title.images.poster case final poster?)
                          Picture([ArtSource(poster)]),
                      ],
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          entry.title.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: KitText.base.style(color: colors.foreground),
                        ),
                        Text(
                          l.statsPlayCount(entry.plays),
                          style: KitText.xs.style(
                            color: colors.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 14),
                  Text(
                    formatWatchTime(entry.watchSeconds, l),
                    style: KitText.base.style(
                      color: colors.foreground,
                      weight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Watch time per genre. A title can have several genres, so their times
/// add up to more than the whole. Each opens Browse for its genre.
class Genres extends StatelessWidget {
  const Genres({super.key, required this.genres});

  final List<GenreStat> genres;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    return StatsCard(
      label: l.statsGenres,
      children: [
        for (final (index, genre) in genres.indexed) ...[
          if (index > 0) const PanelDivider(indent: 16),
          _CardRow(
            onPressed: () => context.push(Routes.browse(genre: genre.name)),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      genre.name,
                      style: KitText.base.style(color: colors.foreground),
                    ),
                  ),
                  Text(
                    formatWatchTime(genre.watchSeconds, l),
                    style: KitText.base.style(
                      color: colors.foreground,
                      weight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Where the person stands on each board of the leaderboard for the range:
/// their place between the people just above and below. Boards they
/// aren't on are left out, and so is the whole card while it loads, when it
/// fails, or when they're on none.
class Standing extends ConsumerWidget {
  const Standing({super.key, required this.range, required this.timeZone});

  final String range;
  final String? timeZone;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final boards = standings(
      ref.watch(leaderboardProvider((range: range, timeZone: timeZone))).value,
    );
    if (boards.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 28),
      child: StatsCard(
        label: l.statsStandingTitle,
        children: [
          for (final (index, (:board, :places)) in boards.indexed) ...[
            if (index > 0) const PanelDivider(indent: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: 6,
                children: [
                  Text(
                    metricName(board.metric, l),
                    style: KitText.xs.style(color: colors.mutedForeground),
                  ),
                  for (final place in places)
                    LeaderboardPlace(
                      place: place,
                      value: metricValue(board.metric, place.value, l),
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// A place: the rank, the podium's in the accent, the person, and the
/// value, the person's own lit.
class LeaderboardPlace extends StatelessWidget {
  const LeaderboardPlace({super.key, required this.place, required this.value});

  final LeaderboardEntry place;
  final String value;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final user = place.user;
    final name = user.name;
    final podium = switch (place.rank) {
      1 => colors.accent,
      2 => colors.accent.withValues(alpha: .6),
      3 => colors.accent.withValues(alpha: .3),
      _ => null,
    };
    return DecoratedBox(
      decoration: BoxDecoration(
        color: place.self ? colors.accentSoft : null,
        borderRadius: const BorderRadius.all(Radius.circular(KitRadius.md)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(
          spacing: 10,
          children: [
            Container(
              width: 24,
              height: 24,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: podium, shape: BoxShape.circle),
              child: Text(
                '${place.rank}',
                style: KitText.xs.style(
                  color: place.rank == 1
                      ? colors.accentForeground
                      : place.rank <= 3
                      ? colors.foreground
                      : colors.mutedForeground,
                  weight: FontWeight.w600,
                ),
              ),
            ),
            Avatar(url: user.avatarUrl, name: name, size: 28),
            Expanded(
              child: Text(
                place.self ? l.statsNameYou(name) : name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: KitText.base.style(color: colors.foreground),
              ),
            ),
            Text(
              value,
              style: KitText.sm.style(
                color: colors.foreground,
                weight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// When in the week watching starts, as the web's heatmap: a square per
/// hour of each weekday, deeper for more, and the busiest time under it.
class Activity extends StatelessWidget {
  const Activity({super.key, required this.activity});

  final List<ActivityCell> activity;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final cells = activity;
    final seconds = {
      for (final cell in cells) (cell.weekday, cell.hour): cell.watchSeconds,
    };
    final most = math.max(
      1.0,
      cells.map((c) => c.watchSeconds).reduce(math.max),
    );
    final peak = cells.reduce(
      (a, b) => b.watchSeconds > a.watchSeconds ? b : a,
    );
    final label = KitText.px11.style(color: colors.mutedForeground);
    return StatsCard(
      label: l.statsHeatmapTitle,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 3,
            children: [
              for (var weekday = 1; weekday <= 7; weekday++)
                Row(
                  children: [
                    SizedBox(
                      width: 34,
                      child: Text(
                        weekdayName(weekday, locale, short: true),
                        style: label,
                        maxLines: 1,
                      ),
                    ),
                    Expanded(
                      child: SizedBox(
                        height: 12,
                        child: CustomPaint(
                          painter: _HoursPainter(
                            levels: [
                              for (var hour = 0; hour < 24; hour++)
                                (seconds[(weekday, hour)] ?? 0) / most,
                            ],
                            accent: colors.accent,
                            empty: colors.foreground.withValues(alpha: .06),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              Row(
                children: [
                  const SizedBox(width: 34),
                  for (final hour in const [0, 6, 12, 18])
                    Expanded(
                      child: Text(
                        hourName(hour, locale),
                        style: label,
                        maxLines: 1,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                l.statsHeatmapPeak(
                  weekdayName(peak.weekday, locale),
                  hourName(peak.hour, locale),
                ),
                style: KitText.xs.style(color: colors.mutedForeground),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// A weekday's 24 hours as squares, [levels] from 0 to 1.
class _HoursPainter extends CustomPainter {
  _HoursPainter({
    required this.levels,
    required this.accent,
    required this.empty,
  });

  final List<double> levels;
  final Color accent;
  final Color empty;

  @override
  void paint(Canvas canvas, Size size) {
    const gap = 2.0;
    final cell = (size.width - gap * 23) / 24;
    for (final (hour, level) in levels.indexed) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(hour * (cell + gap), 0, cell, size.height),
          const Radius.circular(2),
        ),
        Paint()
          ..color = level > 0
              ? accent.withValues(alpha: .3 + .7 * level)
              : empty,
      );
    }
  }

  @override
  bool shouldRepaint(_HoursPainter old) =>
      old.levels != levels || old.accent != accent || old.empty != empty;
}
