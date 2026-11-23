import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart' show NumberFormat;

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/avatar.dart';
import '../../media/format.dart';
import '../../router.dart';
import '../profile/profile_data.dart';
import '../profile/stats.dart';
import '../settings/playback_page.dart' show audioFormatName, videoCodecName;
import '../settings/settings_rows.dart' show Note;

List<Widget> activitySections(BuildContext context, ServerStats stats) {
  final l = AppLocalizations.of(context);
  final count = NumberFormat.decimalPattern(l.localeName);
  return [
    WatchTimeCard(
      range: stats.range,
      unit: stats.unit,
      watchSeconds: stats.totals.watchSeconds,
      buckets: stats.buckets,
    ),
    StatsCard(
      children: [
        _StatRow(
          label: l.webStatsServerViewers,
          value: count.format(stats.viewers),
        ),
      ],
    ),
    StatList(totals: stats.totals),
    if (stats.titles.isNotEmpty) TopTitles(titles: stats.titles),
    if (stats.genres.isNotEmpty) Genres(genres: stats.genres),
    if (stats.users.isNotEmpty)
      _RankedStats(
        title: l.webStatsServerViewers,
        rows: [
          for (final entry in stats.users)
            (
              label: entry.user.name,
              amount: entry.watchSeconds,
              value: formatWatchTime(entry.watchSeconds, l),
              note: null,
            ),
        ],
      ),
    if (stats.activity.isNotEmpty) Activity(activity: stats.activity),
  ];
}

String _methodName(String method, AppLocalizations l) => switch (method) {
  PlaybackMethod.direct => l.webStatsMethodDirect,
  PlaybackMethod.remux => l.webStatsMethodRemux,
  PlaybackMethod.transcode => l.webStatsMethodTranscode,
  _ => method,
};

List<Widget> playbackSections(BuildContext context, ServerStats stats) {
  final l = AppLocalizations.of(context);
  final seconds = stats.methods.fold<double>(
    0,
    (sum, row) => sum + row.watchSeconds,
  );
  final percent = NumberFormat.percentPattern(l.localeName);
  final converted = stats.transcoding;
  return [
    _RankedStats(
      title: l.webStatsServerMethods,
      rows: [
        for (final method in stats.methods)
          (
            label: _methodName(method.method, l),
            amount: method.watchSeconds,
            value: formatWatchTime(method.watchSeconds, l),
            note: null,
          ),
      ],
      total: seconds,
      formatShare: percent.format,
    ),
    if (stats.clients.isNotEmpty)
      _plays(l.webStatsServerClients, stats.clients, l),
    if (converted.videoTranscodes == 0 && converted.audioConversions == 0)
      Note(l.webStatsServerNothingTranscoded),
    if (converted.encoders.isNotEmpty)
      _plays(l.webStatsServerEncoders, converted.encoders, l),
    if (converted.videoCodecs.isNotEmpty)
      _plays(
        l.webStatsServerVideoFrom,
        converted.videoCodecs,
        l,
        name: videoCodecName,
      ),
    if (converted.audioCodecs.isNotEmpty)
      _plays(
        l.webStatsServerAudioFrom,
        converted.audioCodecs,
        l,
        name: audioFormatName,
      ),
  ];
}

_RankedStats _plays(
  String title,
  List<NamedCount> rows,
  AppLocalizations l, {
  String Function(String)? name,
}) => _RankedStats(
  title: title,
  rows: [
    for (final row in rows)
      (
        label: name?.call(row.name) ?? row.name,
        amount: row.plays.toDouble(),
        value: l.webStatsPlays(row.plays),
        note: null,
      ),
  ],
);

class WatchingNow extends StatelessWidget {
  const WatchingNow({super.key, required this.data});

  final LiveActivity data;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return StatsCard(
      label: l.webStatsLiveTitle,
      children: [
        if (data.sessions.isEmpty)
          _StatRow(label: l.webStatsLiveEmpty)
        else ...[
          _StatRow(label: l.webStatsLiveStreams(data.streams)),
          for (final session in data.sessions) _NowPlayingRow(session: session),
        ],
      ],
    );
  }
}

class _NowPlayingRow extends StatelessWidget {
  const _NowPlayingRow({required this.session});

  final NowPlaying session;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final item = session.item;
    final names = item == null ? null : itemNames(item, l);
    final name = session.user.name;
    final title = names == null
        ? l.webStatsLiveGone
        : item?.label.episodeNumber == null
        ? names.title
        : '${names.showName} · ${names.title}';
    final row = _StatRow(
      label: title,
      note:
          '$name · ${session.paused ? l.webStatsLivePaused : _methodName(session.method, l)}',
      leading: Avatar(avatarId: session.user.avatarId, name: name, size: 28),
    );
    final target = item?.title;
    return target == null
        ? row
        : PressIndication(
            onPressed: () => context.push(Routes.title(target.id)),
            builder: (context, state) => ColoredBox(
              color: MatineeTheme.of(context).foreground
                  .withValues(alpha: state == PressState.idle ? 0 : .06),
              child: row,
            ),
          );
  }
}

List<Widget> librarySections(BuildContext context, LibraryStats stats) {
  final l = AppLocalizations.of(context);
  final count = NumberFormat.decimalPattern(l.localeName);
  final totals = stats.totals;
  final libraries = [...stats.libraries]
    ..sort((a, b) => b.sizeBytes.compareTo(a.sizeBytes));
  final additions = stats.growth.fold(
    (movies: 0, episodes: 0, bytes: 0.0),
    (sum, bucket) => (
      movies: sum.movies + bucket.movies,
      episodes: sum.episodes + bucket.episodes,
      bytes: sum.bytes + bucket.sizeBytes,
    ),
  );
  final added = switch (stats.range) {
    StatsRange.value7d => l.webStatsLibraryAdded7d,
    StatsRange.value30d => l.webStatsLibraryAdded30d,
    StatsRange.value90d => l.webStatsLibraryAdded90d,
    StatsRange.value365d => l.webStatsLibraryAdded365d,
    _ => l.webStatsLibraryAddedAll,
  };
  return [
    StatsCard(
      children: [
        _StatRow(
          label: l.webStatsLibraryMovies,
          value: count.format(totals.movies),
        ),
        _StatRow(
          label: l.webStatsLibraryShows,
          value: count.format(totals.shows),
        ),
        _StatRow(
          label: l.webStatsLibraryEpisodes,
          value: count.format(totals.episodes),
        ),
        _StatRow(
          label: l.webStatsLibrarySize,
          value: formatBytes(totals.sizeBytes.round(), l),
        ),
        _StatRow(
          label: l.webStatsLibraryRunningTime,
          value: formatWatchTime(totals.durationSeconds, l),
        ),
      ],
    ),
    if (stats.growth.isNotEmpty)
      StatsTrendCard(
        label: added,
        total: l.webStatsFiles(totals.files),
        totalNote: _arrivals(
          additions.movies,
          additions.episodes,
          additions.bytes,
          l,
        ),
        points: [
          for (final bucket in stats.growth)
            (
              label: bucketName(bucket.start, stats.unit, l, l.localeName),
              detail: l.webStatsFiles(bucket.totalFiles),
              note: _growthNote(bucket, l),
              value: bucket.totalFiles.toDouble(),
            ),
        ],
      ),
    if (libraries.isNotEmpty)
      _RankedStats(
        title: l.webStatsLibraryLibraries,
        rows: [
          for (final library in libraries)
            (
              label: library.name,
              amount: library.sizeBytes,
              value: formatBytes(library.sizeBytes.round(), l),
              note: library.kind == LibraryKind.movies
                  ? l.statsMovieCount(library.titles)
                  : l.webStatsShows(library.titles),
            ),
        ],
      ),
    if (stats.resolutions.isNotEmpty)
      _quality(
        l.webStatsLibraryResolution,
        stats.resolutions,
        l,
        (name) => name,
      ),
    if (stats.dynamicRange.isNotEmpty)
      _quality(
        l.webStatsLibraryDynamicRange,
        stats.dynamicRange,
        l,
        (name) => name == 'dolby-vision' ? 'Dolby Vision' : name.toUpperCase(),
      ),
    if (stats.videoCodecs.isNotEmpty)
      _quality(
        l.webStatsLibraryVideoCodecs,
        stats.videoCodecs,
        l,
        videoCodecName,
      ),
    if (stats.audioCodecs.isNotEmpty)
      _quality(
        l.webStatsLibraryAudioCodecs,
        stats.audioCodecs,
        l,
        audioFormatName,
      ),
  ];
}

String _arrivals(int movies, int episodes, double bytes, AppLocalizations l) {
  final additions = [
    if (movies > 0) l.statsMovieCount(movies),
    if (episodes > 0) l.statsEpisodeCount(episodes),
  ];
  return additions.isEmpty
      ? l.webStatsGrowthNothing
      : l.webStatsGrowthArrived(
          additions.join(' ${l.commonAnd} '),
          formatBytes(bytes.round(), l),
        );
}

String _growthNote(LibraryGrowthBucket bucket, AppLocalizations l) {
  final size = formatBytes(bucket.totalSizeBytes.round(), l);
  if (bucket.movies == 0 && bucket.episodes == 0) return size;
  return l.webStatsGrowthHeldAdded(
    size,
    _arrivals(bucket.movies, bucket.episodes, bucket.sizeBytes, l),
  );
}

_RankedStats _quality(
  String title,
  List<QualityStat> rows,
  AppLocalizations l,
  String Function(String) name,
) => _RankedStats(
  title: title,
  rows: [
    for (final row in rows)
      (
        label: row.name == 'unknown' ? l.webStatsNotRead : name(row.name),
        amount: row.files.toDouble(),
        value: formatBytes(row.sizeBytes.round(), l),
        note: l.webStatsFiles(row.files),
      ),
  ],
);

List<Widget> leaderboardSections(BuildContext context, Leaderboard data) {
  final l = AppLocalizations.of(context);
  return [
    if (!data.sharing) Note(l.statisticsLeaderboardPrivate),
    for (final board in data.boards)
      StatsCard(
        label: metricName(board.metric, l),
        children: [
          if (board.entries.isEmpty)
            _StatRow(label: _emptyBoard(board.metric, l))
          else
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
              child: Column(
                spacing: 4,
                children: [
                  for (final entry in board.entries)
                    LeaderboardPlace(
                      place: entry,
                      value: metricValue(board.metric, entry.value, l),
                    ),
                ],
              ),
            ),
        ],
      ),
  ];
}

String _emptyBoard(String metric, AppLocalizations l) => switch (metric) {
  LeaderboardMetric.plays => l.webStatsLeaderboardNonePlays,
  LeaderboardMetric.currentStreak => l.webStatsLeaderboardNoneCurrentStreak,
  LeaderboardMetric.longestStreak => l.webStatsLeaderboardNoneLongestStreak,
  LeaderboardMetric.movies => l.webStatsLeaderboardNoneMovies,
  LeaderboardMetric.episodes => l.webStatsLeaderboardNoneEpisodes,
  _ => l.webStatsLeaderboardNoneWatchTime,
};

typedef _RankedRow = ({
  String label,
  double amount,
  String value,
  String? note,
});

class _RankedStats extends StatelessWidget {
  const _RankedStats({
    required this.title,
    required this.rows,
    this.total,
    this.formatShare,
  });

  final String title;
  final List<_RankedRow> rows;
  final double? total;
  final String Function(double)? formatShare;

  @override
  Widget build(BuildContext context) {
    final scale =
        total ?? rows.fold<double>(0, (top, row) => math.max(top, row.amount));
    return StatsCard(
      label: title,
      children: [
        for (final row in rows)
          _StatRow(
            label: row.label,
            note:
                row.note ??
                formatShare?.call(scale == 0 ? 0 : row.amount / scale),
            value: row.value,
            fraction: scale == 0 ? 0 : row.amount / scale,
          ),
      ],
    );
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({
    required this.label,
    this.value,
    this.note,
    this.leading,
    this.fraction,
  });

  final String label;
  final String? value;
  final String? note;
  final Widget? leading;
  final double? fraction;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final labelStyle = KitText.base.style(color: colors.foreground);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 6,
        children: [
          Row(
            spacing: 12,
            children: [
              ?leading,
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label, style: labelStyle),
                    if (note case final note?)
                      Text(
                        note,
                        style: KitText.xs.style(color: colors.mutedForeground),
                      ),
                  ],
                ),
              ),
              if (value case final value?)
                Flexible(
                  child: Text(
                    value,
                    textAlign: TextAlign.end,
                    style: labelStyle.copyWith(fontWeight: FontWeight.w600),
                  ),
                ),
            ],
          ),
          if (fraction case final fraction?)
            WatchProgressBar(progress: fraction, inset: 0),
        ],
      ),
    );
  }
}
