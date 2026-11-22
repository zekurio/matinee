import 'dart:async';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/session.dart';
import '../../downloads/download_settings.dart';
import '../../downloads/downloads.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/server_text.dart';
import '../../media/format.dart';
import '../../router.dart';
import '../home/offline_home.dart' show OfflinePlaces;
import '../shell/shell.dart';

/// A downloaded show: its finished episodes by season.
final class _ShowDownloads {
  const _ShowDownloads(this.title, this.seasons, {required this.all});

  final TitleSummary title;

  /// The episodes that are here.
  final List<_SeasonDownloads> seasons;

  /// Every episode of it on the device, still coming too.
  final List<OfflineItem> all;

  List<OfflineItem> get entries => [
    for (final season in seasons) ...season.entries,
  ];

  /// When its last episode came, which puts it among the movies.
  DateTime get newest => entries
      .map((entry) => entry.addedAt)
      .reduce((a, b) => a.isAfter(b) ? a : b);
}

/// A season's episodes in order; [number] null for files without one.
final class _SeasonDownloads {
  const _SeasonDownloads(this.number, this.entries);

  final int? number;
  final List<OfflineItem> entries;
}

/// Seasons in order, then the specials, then the files without a season,
/// as on a show's page.
int _seasonOrder(int? number) => switch (number) {
  null => 1 << 30,
  0 => (1 << 30) - 1,
  final n => n,
};

List<_SeasonDownloads> _seasonsOf(Iterable<OfflineItem> entries) {
  final bySeason = <int?, List<OfflineItem>>{};
  for (final entry in entries) {
    (bySeason[entry.item.seasonNumber] ??= []).add(entry);
  }
  return [
    for (final MapEntry(:key, :value) in bySeason.entries)
      _SeasonDownloads(
        key,
        value..sort(
          (a, b) => (a.item.episodeNumber ?? 1 << 30).compareTo(
            b.item.episodeNumber ?? 1 << 30,
          ),
        ),
      ),
  ]..sort((a, b) => _seasonOrder(a.number).compareTo(_seasonOrder(b.number)));
}

int _bytes(Iterable<OfflineItem> entries) =>
    entries.fold(0, (sum, entry) => sum + entry.bytes);

/// "3 episodes · 4.2 GB".
/// A show's downloads in one line, the same on the tab and on the show's
/// own page: "11 episodes · 4.2 GB" once all are here, "5 of 11 episodes
/// · 2.1 GB" while some still come, counting every episode of the show on
/// the device and the space all of them take now.
String _countAndSize(List<OfflineItem> entries, AppLocalizations l) {
  final done = entries.where((entry) => entry.done).length;
  final count = done == entries.length
      ? l.mediaEpisodeCount(entries.length)
      : l.downloadsEpisodesDone(done, entries.length);
  return '$count · ${formatBytes(_bytes(entries), l)}';
}

/// The show and episode, or the movie, of a file.
(String, String?) downloadNames(MediaItem item, AppLocalizations l) {
  final names = itemNames(item, l);
  final code = episodeCode(item, l);
  return code == null
      ? (names.title, null)
      : (names.showName, l.mediaCodeTitle(code, names.title));
}

/// The page a file's details are on: an episode's own, or its movie's.
String _detailsRoute(MediaItem item) {
  final title = item.title;
  return title == null || title.kind == TitleKind.show
      ? Routes.episode(item.id)
      : Routes.title(title.id);
}

bool _offline(WidgetRef ref) => ref.watch(authStateProvider) is Offline;

/// The downloads, in two lists: what's still coming, file by file, with how far
/// each is and a button to pause it or go on; then what's on the device, movies
/// and shows, newest first. A movie plays with a tap; a show opens its own page
/// of episodes.
class DownloadsScreen extends ConsumerStatefulWidget {
  const DownloadsScreen({super.key});

  @override
  ConsumerState<DownloadsScreen> createState() => _DownloadsScreenState();
}

class _DownloadsScreenState extends ConsumerState<DownloadsScreen> {
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _toTop() {
    if (!_scroll.hasClients) return;
    if (MediaQuery.disableAnimationsOf(context)) {
      _scroll.jumpTo(0);
    } else {
      unawaited(
        _scroll.animateTo(
          0,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOutCubic,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(tabReselectProvider, (_, tap) {
      if (tap?.path == Routes.downloads) _toTop();
    });
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final items = ref.watch(shownDownloadsProvider);
    final loaded = ref.watch(downloadsProvider.select((list) => list.loaded));
    final offline = _offline(ref);
    final downloads = ref.read(downloadsProvider.notifier);
    final coming = items.values.where((entry) => !entry.done).toList()
      ..sort((a, b) => a.addedAt.compareTo(b.addedAt));
    final done = items.values.where((entry) => entry.done).toList();
    final byShow = <String, List<OfflineItem>>{};
    for (final entry in done.where((entry) => entry.isShow)) {
      (byShow[entry.item.title!.id] ??= []).add(entry);
    }
    // Every episode on the device, coming or done, counts on the show's row
    // as on its page.
    final everyEpisode = <String, List<OfflineItem>>{};
    for (final entry in items.values.where((entry) => entry.isShow)) {
      (everyEpisode[entry.item.title!.id] ??= []).add(entry);
    }
    final shows = [
      for (final MapEntry(key: id, value: episodes) in byShow.entries)
        _ShowDownloads(
          episodes.first.item.title!,
          _seasonsOf(episodes),
          all: everyEpisode[id] ?? episodes,
        ),
    ];
    // Movies and shows together, what came last first.
    final finished = <(DateTime, Widget)>[
      for (final entry in done.where((entry) => !entry.isShow))
        (
          entry.addedAt,
          _DoneRow(
            key: ValueKey('done-${entry.id}'),
            entry: entry,
            names: downloadNames(entry.item, l),
            onMore: () => unawaited(_showDownloadActions(context, entry)),
          ),
        ),
      for (final show in shows)
        (
          show.newest,
          _ShowRow(
            key: ValueKey('show-${show.title.id}'),
            show: show,
            onPressed: () =>
                unawaited(context.push(Routes.downloadsShow(show.title.id))),
          ),
        ),
    ]..sort((a, b) => b.$1.compareTo(a.$1));

    final children = <Widget>[
      const _StorageLine(),
      if (loaded && items.isEmpty) _Empty(offline: offline),
      if (coming.isNotEmpty) ...[
        _ListHeading(
          text: l.downloadsComing,
          action: _comingAction(l, coming, downloads),
        ),
        for (final entry in coming)
          _ComingRow(
            key: ValueKey('coming-${entry.id}'),
            entry: entry,
            names: downloadNames(entry.item, l),
            onMore: () => unawaited(_showDownloadActions(context, entry)),
          ),
      ],
      if (finished.isNotEmpty) ...[
        if (coming.isNotEmpty) _ListHeading(text: l.downloadsDone),
        for (final (_, row) in finished) row,
      ],
    ];
    return ColoredBox(
      color: colors.background,
      child: ListView(
        controller: _scroll,
        padding: EdgeInsets.only(
          left: CardMetrics.gutter,
          right: CardMetrics.gutter,
          bottom: MediaQuery.paddingOf(context).bottom + 24,
        ),
        children: children,
      ),
    );
  }

  /// Trying again what broke off, beside pausing what's moving, or
  /// resuming what's paused: each that has something to do, side by side.
  Widget _comingAction(
    AppLocalizations l,
    List<OfflineItem> coming,
    Downloads downloads,
  ) {
    final broken = coming.where((entry) => entry.broken).toList();
    final moving = coming
        .where((entry) => entry.moving && !entry.broken)
        .toList();
    final paused = coming
        .where((entry) => !entry.moving && !entry.broken)
        .toList();
    void each(List<OfflineItem> entries, Future<void> Function(String) act) {
      for (final entry in entries) {
        unawaited(act(entry.id));
      }
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (broken.isNotEmpty)
          _HeadingButton(
            label: l.downloadsRetryAll,
            onPressed: () => each(broken, downloads.resume),
          ),
        if (moving.isNotEmpty)
          _HeadingButton(
            label: l.downloadsPauseAll,
            onPressed: () => each(moving, downloads.pause),
          )
        else if (paused.isNotEmpty)
          _HeadingButton(
            label: l.downloadsResumeAll,
            onPressed: () => each(paused, downloads.resume),
          ),
      ],
    );
  }
}

/// The space the downloads take and what's left, under the tab's header.
class _StorageLine extends ConsumerWidget {
  const _StorageLine();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final used = ref.watch(downloadsBytesProvider);
    final free = ref.watch(freeBytesProvider).value;
    if (free == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 4),
      child: Text(
        l.downloadsStorageValue(formatBytes(used, l), formatBytes(free, l)),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: KitText.sm.style(color: colors.mutedForeground),
      ),
    );
  }
}

/// Nothing downloaded yet, or the account can't download at all. Offline
/// the server can't say, so the usual hint stays.
class _Empty extends ConsumerWidget {
  const _Empty({required this.offline});

  final bool offline;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final options = offline ? null : ref.watch(playbackOptionsProvider).value;
    final off = options != null && !options.downloads;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: EmptyState(
        icon: Lucide.download,
        title: off ? l.downloadsOffTitle : l.downloadsEmpty,
        message: off ? l.downloadsOffDescription : l.downloadsEmptyHint,
      ),
    );
  }
}

/// A downloaded show's episodes by season: each plays with a tap, and the ones
/// still coming show how far they are. Its menu, and each season's, removes
/// them.
class DownloadsShowScreen extends ConsumerWidget {
  const DownloadsShowScreen({super.key, required this.titleId});

  final String titleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final entries = [
      for (final entry in ref.watch(shownDownloadsProvider).values)
        if (entry.item.title?.id == titleId) entry,
    ];
    // Everything removed: back to the list.
    ref.listen(shownDownloadsProvider, (before, now) {
      final had = before?.values.any((e) => e.item.title?.id == titleId);
      final has = now.values.any((e) => e.item.title?.id == titleId);
      if ((had ?? false) && !has && context.canPop()) context.pop();
    });
    final title = entries.firstOrNull?.item.title;
    void back() => context.pop();
    if (title == null) {
      return PageFrame(
        backLabel: l.commonBack,
        onBack: back,
        child: const SizedBox.expand(),
      );
    }
    return PageFrame(
      title: title.name,
      backLabel: l.commonBack,
      onBack: back,
      actions: [
        RoundIconButton(
          icon: Lucide.ellipsis,
          label: l.titleMoreActions,
          size: 40,
          iconSize: 18,
          background: const Color(0x00000000),
          onPressed: () => unawaited(_showShowActions(context, title, entries)),
        ),
      ],
      child: ListView(
        padding: EdgeInsets.only(
          left: CardMetrics.gutter,
          right: CardMetrics.gutter,
          bottom: MediaQuery.paddingOf(context).bottom + 24,
        ),
        children: [
          Text(
            _countAndSize(entries, l),
            style: KitText.sm.style(color: colors.mutedForeground),
          ),
          for (final season in _seasonsOf(entries)) ...[
            _ListHeading(
              text: seasonName(season.number, l),
              action: RoundIconButton(
                icon: Lucide.trash,
                label: l.downloadsRemoveNamed(seasonName(season.number, l)),
                size: 40,
                iconSize: 18,
                color: colors.mutedForeground,
                background: const Color(0x00000000),
                onPressed: () => unawaited(
                  _confirmRemove(
                    context,
                    l.titleSeasonOf(title.name, seasonName(season.number, l)),
                    season.entries,
                  ),
                ),
              ),
            ),
            for (final entry in season.entries)
              if (entry.done)
                _DoneRow(
                  key: ValueKey('done-${entry.id}'),
                  entry: entry,
                  names: (_episodeName(entry.item, l), null),
                  onMore: () => unawaited(_showDownloadActions(context, entry)),
                )
              else
                _ComingRow(
                  key: ValueKey('coming-${entry.id}'),
                  entry: entry,
                  names: (_episodeName(entry.item, l), null),
                  onMore: () => unawaited(_showDownloadActions(context, entry)),
                ),
          ],
        ],
      ),
    );
  }
}

/// "Episode 4: Pilot", or the name alone without a number.
String _episodeName(MediaItem item, AppLocalizations l) {
  final title = itemNames(item, l).title;
  final number = episodeNumberLabel(item, l);
  return number == null ? title : l.titleEpisodesCodedName(number, title);
}

/// Asks before removing several files at once, saying how much space it
/// frees.
Future<void> _confirmRemove(
  BuildContext context,
  String name,
  List<OfflineItem> entries,
) async {
  final l = AppLocalizations.of(context);
  final container = ProviderScope.containerOf(context, listen: false);
  final sure = await ConfirmDialog.show(
    context,
    title: l.downloadsRemoveNamedConfirm(name),
    description: l.downloadsRemoveAllBody(formatBytes(_bytes(entries), l)),
    confirmLabel: l.commonRemove,
    cancelLabel: l.commonCancel,
    destructive: true,
  );
  if (!sure) return;
  final downloads = container.read(downloadsProvider.notifier);
  final api = container.read(apiProvider);
  for (final entry in entries) {
    await downloads.remove(entry.id, api);
  }
}

/// A list's name, with room for an action at its end.
class _ListHeading extends StatelessWidget {
  const _ListHeading({required this.text, this.action});

  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 4),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 40),
        child: Row(
          children: [
            Expanded(
              child: Semantics(
                header: true,
                child: Text(
                  text,
                  style: KitText.base.style(
                    color: colors.foreground,
                    weight: FontWeight.w500,
                  ),
                ),
              ),
            ),
            ?action,
          ],
        ),
      ),
    );
  }
}

/// A heading's action, as the web's ghost buttons: the accent's words on
/// nothing.
class _HeadingButton extends StatelessWidget {
  const _HeadingButton({required this.label, required this.onPressed});

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => MatineeButton(
    look: ButtonLook.ghost,
    onPressed: onPressed,
    child: Text(
      label,
      style: TextStyle(color: MatineeTheme.of(context).accent),
    ),
  );
}

/// Every row's picture is this wide, so the text beside them lines up down
/// the list.
const _thumbWidth = 112.0;

/// A file's saved picture, or the title's tone without one.
class _Thumb extends ConsumerWidget {
  const _Thumb({
    required this.entry,
    required this.toneKey,
    this.progress,
    this.watchedLabel,
  });

  final OfflineItem? entry;
  final String toneKey;

  /// How far in the person is, 0 to 1, as a bar along the bottom.
  final double? progress;

  /// Set once it's watched: the check, in place of the bar.
  final String? watchedLabel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = MatineeTheme.of(context);
    final path = ref.watch(downloadsProvider).path(entry?.image);
    final placeholder = Center(
      child: KitIcon(
        Lucide.film,
        size: 18,
        color: colors.mutedForeground.withValues(alpha: .5),
      ),
    );
    return SizedBox(
      width: _thumbWidth,
      child: ArtFrame(
        toneKey: toneKey,
        aspectRatio: CardMetrics.wide,
        children: [
          if (path == null)
            placeholder
          else
            Image.file(
              File(path),
              fit: BoxFit.cover,
              cacheWidth: (_thumbWidth * MediaQuery.devicePixelRatioOf(context))
                  .round(),
              errorBuilder: (context, error, stack) => placeholder,
            ),
          if (progress case final progress?)
            Align(
              alignment: Alignment.bottomCenter,
              child: WatchProgressBar(progress: progress, inset: 4),
            ),
          if (watchedLabel case final label?)
            PositionedDirectional(
              top: 4,
              end: 4,
              // The row says it already.
              child: ExcludeSemantics(
                child: WatchedBadge(label: label, size: 16),
              ),
            ),
        ],
      ),
    );
  }
}

/// A row in the lists: the picture, [body] beside it, and [trailing].
class _Row extends StatelessWidget {
  const _Row({
    required this.thumb,
    required this.body,
    required this.trailing,
    required this.onPressed,
    required this.label,
  });

  final Widget thumb;
  final Widget body;
  final Widget trailing;
  final VoidCallback onPressed;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: onPressed,
      label: label,
      shape: CardMetrics.radius,
      builder: (context, state) => ColoredBox(
        color: state == PressState.pressed || state == PressState.hovered
            ? colors.foreground.withValues(alpha: .04)
            : const Color(0x00000000),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            spacing: 14,
            children: [
              thumb,
              Expanded(child: body),
              trailing,
            ],
          ),
        ),
      ),
    );
  }
}

/// A downloaded show: its name, how many episodes and how much space; a
/// tap opens its episodes.
class _ShowRow extends StatelessWidget {
  const _ShowRow({super.key, required this.show, required this.onPressed});

  final _ShowDownloads show;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final entries = show.entries;
    final latest = entries.reduce(
      (a, b) => a.addedAt.isAfter(b.addedAt) ? a : b,
    );
    return _Row(
      label: show.title.name,
      onPressed: onPressed,
      thumb: _Thumb(entry: latest, toneKey: show.title.name),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            show.title.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: KitText.sm.style(
              color: colors.foreground,
              weight: FontWeight.w500,
            ),
          ),
          Text(
            _countAndSize(show.all, l),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: KitText.xs.style(color: colors.mutedForeground),
          ),
        ],
      ),
      trailing: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 11),
        child: KitIcon(
          Lucide.chevronRight,
          size: 18,
          color: colors.mutedForeground,
        ),
      ),
    );
  }
}

/// A file on the device: a tap plays it, the menu removes it.
class _DoneRow extends ConsumerWidget {
  const _DoneRow({
    super.key,
    required this.entry,
    required this.names,
    required this.onMore,
  });

  final OfflineItem entry;
  final (String, String?) names;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final (primary, secondary) = names;
    // How far in, from what the device knows, offline too.
    final places = OfflinePlaces.watch(ref);
    final watched = places.watched(entry);
    final ratio = places.place(entry)?.ratio;
    return _Row(
      label: [primary, ?secondary, if (watched) l.mediaWatched].join(', '),
      onPressed: () => unawaited(context.push(Routes.play(entry.id))),
      thumb: _Thumb(
        entry: entry,
        toneKey: entry.item.title?.name ?? primary,
        progress: watched || ratio == null || ratio <= 0 ? null : ratio,
        watchedLabel: watched ? l.mediaWatched : null,
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            primary,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: KitText.sm.style(color: colors.foreground),
          ),
          if (secondary != null)
            Text(
              secondary,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: KitText.xs.style(color: colors.mutedForeground),
            ),
          Text(
            formatBytes(entry.bytes, l),
            maxLines: 1,
            style: KitText.xs.style(color: colors.textFaint),
          ),
        ],
      ),
      trailing: RoundIconButton(
        icon: Lucide.ellipsis,
        label: l.titleMoreActions,
        size: 40,
        iconSize: 18,
        color: colors.mutedForeground,
        background: const Color(0x00000000),
        onPressed: onMore,
      ),
    );
  }
}

/// A file still coming: how far it is, as a bar and in words, and a button
/// to pause it or go on. A tap opens its menu.
class _ComingRow extends ConsumerWidget {
  const _ComingRow({
    super.key,
    required this.entry,
    required this.names,
    required this.onMore,
  });

  final OfflineItem entry;
  final (String, String?) names;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final downloads = ref.read(downloadsProvider.notifier);
    final unmetered =
        ref.watch(downloadSettingsProvider).value?.unmeteredOnly ?? true;
    final (primary, secondary) = names;
    final broken = entry.broken;
    final moving = entry.moving;
    final progress = entry.progress;
    final status = downloadStatus(entry, l, unmeteredOnly: unmetered);
    return _Row(
      label: secondary == null ? primary : '$primary, $secondary',
      onPressed: onMore,
      thumb: _Thumb(entry: entry, toneKey: entry.item.title?.name ?? primary),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 2,
        children: [
          // One line each, so the name, the bar, and how it stands fit
          // beside the picture.
          Text(
            primary,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: KitText.sm.style(color: colors.foreground),
          ),
          if (secondary != null)
            Text(
              secondary,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: KitText.xs.style(color: colors.mutedForeground),
            ),
          if (progress != null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: _Bar(
                progress: progress,
                color: broken
                    ? colors.danger
                    : moving
                    ? colors.accent
                    : colors.mutedForeground,
              ),
            ),
          Text(
            status,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: KitText.xs.style(
              color: broken ? colors.danger : colors.textFaint,
            ),
          ),
        ],
      ),
      // One that broke off, or waits to try again, can be tried again at
      // once.
      trailing: broken
          ? RoundIconButton(
              icon: Lucide.rotateCw,
              label: l.downloadsRetry,
              size: 40,
              iconSize: 18,
              color: colors.mutedForeground,
              background: const Color(0x00000000),
              onPressed: () => unawaited(downloads.resume(entry.id)),
            )
          : moving
          ? RoundIconButton(
              icon: Lucide.pause,
              label: l.downloadsPause,
              size: 40,
              iconSize: 14,
              color: colors.mutedForeground,
              background: const Color(0x00000000),
              onPressed: () => unawaited(downloads.pause(entry.id)),
            )
          : RoundIconButton(
              icon: Lucide.play,
              label: l.downloadsResume,
              size: 40,
              // Filled, as pause beside it is.
              iconSize: 14,
              color: colors.mutedForeground,
              background: const Color(0x00000000),
              onPressed: () => unawaited(downloads.resume(entry.id)),
            ),
    );
  }
}

/// How far a download is, as a thin bar.
class _Bar extends StatelessWidget {
  const _Bar({required this.progress, required this.color});

  final double progress;
  final Color color;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: KitRadius.pill,
    child: SizedBox(
      height: 3,
      child: ColoredBox(
        color: MatineeTheme.of(context).secondary,
        child: Align(
          alignment: AlignmentDirectional.centerStart,
          child: FractionallySizedBox(
            widthFactor: progress,
            heightFactor: 1,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: color,
                borderRadius: KitRadius.pill,
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

/// How a download stands, in words: how much came of how much, paused,
/// what went wrong, or what it waits for.
String downloadStatus(
  OfflineItem entry,
  AppLocalizations l, {
  required bool unmeteredOnly,
}) {
  final total = entry.totalBytes;
  return switch (entry.state) {
    DownloadState.done => formatBytes(entry.bytes, l),
    DownloadState.running =>
      total == null
          ? formatBytes(entry.bytes, l)
          : l.downloadsOf(formatBytes(entry.bytes, l), formatBytes(total, l)),
    DownloadState.paused => l.downloadsStatePaused,
    DownloadState.failed => l.downloadsStateFailed(
      downloadFailure(entry, l) ?? '',
    ),
    // What went wrong, alone: the red and the retry button say the rest.
    DownloadState.queued =>
      downloadFailure(entry, l) ??
          (unmeteredOnly
              ? l.downloadsStateWaitingUnmetered
              : l.downloadsStateWaiting),
  };
}

/// What went wrong, in the app's words for its kind, or the server's own
/// for a refusal.
String? downloadFailure(OfflineItem entry, AppLocalizations l) =>
    switch (entry.error) {
      DownloadError.unreachable => l.downloadsErrorUnreachable,
      DownloadError.brokeOff => l.downloadsErrorBrokeOff,
      DownloadError.forbidden => l.downloadsErrorForbidden,
      DownloadError.server =>
        entry.errorMessage?.serverWords(l) ?? l.errorServer,
      null => null,
    };

/// What a menu item does once its sheet has closed.
typedef _Act = Future<void> Function(BuildContext context);

/// A file's menu: play it once it's here, its page while online, and
/// removing it.
Future<void> _showDownloadActions(
  BuildContext context,
  OfflineItem entry,
) async {
  final l = AppLocalizations.of(context);
  final container = ProviderScope.containerOf(context, listen: false);
  final offline = container.read(authStateProvider) is Offline;
  final (primary, secondary) = downloadNames(entry.item, l);
  final act = await Sheet.show<_Act>(
    context,
    dismissLabel: l.commonCancel,
    builder: (sheet) {
      void run(_Act act) => Navigator.of(sheet).pop(act);
      return Sheet(
        title: primary,
        description: secondary,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (entry.done)
              SheetItem(
                icon: Lucide.playOutline,
                label: l.titlePlay,
                onPressed: () => run(
                  (context) async =>
                      unawaited(context.push(Routes.play(entry.id))),
                ),
              ),
            if (!offline)
              SheetItem(
                icon: Lucide.info,
                label: l.mediaHeroDetails,
                onPressed: () => run(
                  (context) async =>
                      unawaited(context.push(_detailsRoute(entry.item))),
                ),
              ),
            SheetItem(
              icon: Lucide.trash,
              label: l.downloadsRemove,
              destructive: true,
              onPressed: () => run(
                (context) => container
                    .read(downloadsProvider.notifier)
                    .remove(entry.id, container.read(apiProvider)),
              ),
            ),
          ],
        ),
      );
    },
  );
  if (act != null && context.mounted) await act(context);
}

/// A show's menu: pause or resume what's still coming, its page, and
/// removing every episode.
Future<void> _showShowActions(
  BuildContext context,
  TitleSummary title,
  List<OfflineItem> entries,
) async {
  final l = AppLocalizations.of(context);
  final container = ProviderScope.containerOf(context, listen: false);
  final offline = container.read(authStateProvider) is Offline;
  final downloads = container.read(downloadsProvider.notifier);
  final active = entries
      .where((entry) => entry.moving && !entry.broken)
      .toList();
  final paused = [
    for (final entry in entries)
      if (entry.state == DownloadState.paused && !entry.broken) entry,
  ];
  final broken = [
    for (final entry in entries)
      if (!entry.done && entry.broken) entry,
  ];
  final act = await Sheet.show<_Act>(
    context,
    dismissLabel: l.commonCancel,
    builder: (sheet) {
      void run(_Act act) => Navigator.of(sheet).pop(act);
      return Sheet(
        title: title.name,
        description: _countAndSize(entries, l),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (active.isNotEmpty)
              SheetItem(
                icon: Lucide.pause,
                label: l.downloadsPauseAll,
                onPressed: () => run((context) async {
                  for (final entry in active) {
                    await downloads.pause(entry.id);
                  }
                }),
              ),
            if (paused.isNotEmpty)
              SheetItem(
                icon: Lucide.play,
                label: l.downloadsResumeAll,
                onPressed: () => run((context) async {
                  for (final entry in paused) {
                    await downloads.resume(entry.id);
                  }
                }),
              ),
            if (broken.isNotEmpty)
              SheetItem(
                icon: Lucide.rotateCw,
                label: l.downloadsRetryAll,
                onPressed: () => run((context) async {
                  for (final entry in broken) {
                    await downloads.resume(entry.id);
                  }
                }),
              ),
            if (!offline)
              SheetItem(
                icon: Lucide.info,
                label: l.mediaHeroEpisodes,
                onPressed: () => run(
                  (context) async =>
                      unawaited(context.push(Routes.title(title.id))),
                ),
              ),
            SheetItem(
              icon: Lucide.trash,
              label: l.downloadsRemoveNamed(title.name),
              destructive: true,
              onPressed: () => run(
                (context) => _confirmRemove(context, title.name, entries),
              ),
            ),
          ],
        ),
      );
    },
  );
  if (act != null && context.mounted) await act(context);
}
