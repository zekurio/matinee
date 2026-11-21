import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../api/matinee_api.dart';
import '../../../core/session.dart';
import '../../../kit/kit.dart';
import '../../../l10n/app_localizations.dart';
import '../../../l10n/server_text.dart';
import '../settings_rows.dart';
import 'admin_data.dart';
import 'admin_parts.dart';

/// Background work, as the Kotlin app's `JobsSettings` and the web's jobs
/// panel: one list of the queues, how busy each is, and the scheduled task
/// that fills it, then the tasks that fill none and do their upkeep
/// themselves, and how many jobs each queue runs at once, saved from the
/// save bar. A queue's sheet pauses it and clears what waits, which asks
/// first; a task runs now or stops from its row. The page keeps itself
/// current while it shows.
class JobsPage extends ConsumerStatefulWidget {
  const JobsPage({super.key});

  @override
  ConsumerState<JobsPage> createState() => _JobsPageState();
}

class _JobsPageState extends ConsumerState<JobsPage> {
  /// The numbers changed and not saved yet, by queue; the rest follow the
  /// server as it's asked again.
  var _edits = <String, int>{};

  Map<String, int> _changed(JobsOverview? overview) => {
    for (final queue in overview?.queues ?? const <JobQueueStatus>[])
      if (queue.concurrencyNote != null)
        if (_edits[queue.id] case final edit? when edit != queue.concurrency)
          queue.id: edit,
  };

  Future<void> _task(ScheduledTask task) async {
    final l = AppLocalizations.of(context);
    final api = ref.read(apiProvider);
    if (api == null) return;
    final running = task.startedAt != null;
    final name = taskName(l, task);
    await runAction(
      ref,
      l,
      () async => running
          ? await api.admin.jobs.cancelTask(task.id)
          : await api.admin.jobs.runTask(task.id),
      failure: running
          ? l.webJobsTaskCancelFailed(name)
          : l.webJobsTaskStartFailed(name),
    );
    if (mounted) ref.invalidate(jobsProvider);
  }

  Future<void> _queue(JobQueueStatus queue) async {
    final l = AppLocalizations.of(context);
    final api = ref.read(apiProvider);
    if (api == null) return;
    final name = queueName(l, queue);
    final action = await Sheet.show<String>(
      context,
      dismissLabel: l.commonCancel,
      builder: (context) => _QueueSheet(queueId: queue.id),
    );
    if (action == null || !mounted) return;
    if (action == 'clear') {
      final yes = await ConfirmDialog.show(
        context,
        title: l.adminJobsClearTitle(name),
        description: l.adminJobsClearDescription,
        confirmLabel: l.webJobsQueueClear,
        cancelLabel: l.commonCancel,
        destructive: true,
      );
      if (!yes || !mounted) return;
    }
    await runAction(
      ref,
      l,
      () async => switch (action) {
        'pause' => await api.admin.jobs.pause(queue.id),
        'resume' => await api.admin.jobs.resume(queue.id),
        _ => await api.admin.jobs.clear(queue.id),
      },
      failure: switch (action) {
        'pause' => l.webJobsQueuePauseFailed(name),
        'resume' => l.webJobsQueueResumeFailed(name),
        _ => l.webJobsQueueClearFailed(name),
      },
    );
    if (mounted) ref.invalidate(jobsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final jobs = ref.watch(jobsProvider);
    final changed = _changed(jobs.value);
    return SaveBarPage(
      title: l.settingsAdminJobs,
      dirty: changed.isNotEmpty,
      onReset: () => setState(() => _edits = {}),
      onSave: () async {
        final api = ref.read(apiProvider);
        if (api == null) return;
        await api.admin.jobs.updateConcurrency(concurrency: changed);
        if (!mounted) return;
        setState(() => _edits = {});
        ref.invalidate(jobsProvider);
      },
      child: adminBody(
        context,
        jobs,
        onRetry: () => ref.invalidate(jobsProvider),
        loaded: (overview) {
          final tunable = [
            for (final queue in overview.queues)
              if (queue.concurrencyNote != null) queue,
          ];
          return AdminSections(
            bottom: changed.isEmpty,
            sections: [
              SettingsSection(
                title: l.webJobsQueues,
                child: Panel(
                  rows: [
                    for (final queue in overview.queues)
                      _QueueRow(
                        queue: queue,
                        task: overview.tasks
                            .where((task) => task.queue == queue.id)
                            .firstOrNull,
                        onTask: (task) => unawaited(_task(task)),
                        onPressed: () => unawaited(_queue(queue)),
                      ),
                    for (final task in overview.tasks)
                      if (task.queue == null)
                        _TaskRow(
                          task: task,
                          onTask: () => unawaited(_task(task)),
                        ),
                  ],
                ),
              ),
              if (tunable.isNotEmpty)
                SettingsSection(
                  title: l.webJobsConcurrency,
                  child: Panel(
                    rows: [
                      for (final queue in tunable)
                        _ConcurrencyRow(
                          queue: queue,
                          value: _edits[queue.id] ?? queue.concurrency,
                          onChanged: (value) => setState(
                            () => _edits = {..._edits, queue.id: value},
                          ),
                        ),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

/// A queue's name in the app's language, else what the server calls it.
String queueName(AppLocalizations l, JobQueueStatus queue) =>
    switch (queue.id) {
      JobQueueId.libraryScan => l.webJobsQueueLibraryScanName,
      JobQueueId.mediaProbe => l.webJobsQueueMediaProbeName,
      JobQueueId.metadata => l.webJobsQueueMetadataName,
      JobQueueId.thumbnails => l.webJobsQueueThumbnailsName,
      JobQueueId.subtitlePrepare => l.webJobsQueueSubtitlePrepareName,
      JobQueueId.trickplay => l.webJobsQueueTrickplayName,
      JobQueueId.mediaSegments => l.webJobsQueueMediaSegmentsName,
      JobQueueId.artwork => l.webJobsQueueArtworkName,
      JobQueueId.subtitles => l.webJobsQueueSubtitlesName,
      JobQueueId.subtitleFonts => l.webJobsQueueSubtitleFontsName,
      JobQueueId.avatars => l.webJobsQueueAvatarsName,
      JobQueueId.downloads => l.webJobsQueueDownloadsName,
      JobQueueId.downloadCopies => l.webJobsQueueDownloadCopiesName,
      JobQueueId.requestDispatch => l.webJobsQueueRequestDispatchName,
      JobQueueId.requestProgress => l.webJobsQueueRequestProgressName,
      JobQueueId.requestArrival => l.webJobsQueueRequestArrivalName,
      JobQueueId.catalog => l.webJobsQueueCatalogName,
      JobQueueId.titleFeatures => l.webJobsQueueTitleFeaturesName,
      JobQueueId.recommendations => l.webJobsQueueRecommendationsName,
      _ => queue.name,
    };

// Other queues use file paths, media names, or IDs as their labels.
String _jobLabel(AppLocalizations l, String queue, String label) =>
    switch (queue) {
      JobQueueId.libraryScan ||
      JobQueueId.artwork ||
      JobQueueId.avatars => label.serverWords(l),
      _ => label,
    };

/// A task's name in the app's language, else what the server calls it.
String taskName(AppLocalizations l, ScheduledTask task) => switch (task.id) {
  TaskId.dispatchRequests => l.webJobsTaskDispatchRequestsName,
  TaskId.pollRequests => l.webJobsTaskPollRequestsName,
  TaskId.reconcileRequests => l.webJobsTaskReconcileRequestsName,
  TaskId.scanLibraries => l.webJobsTaskScanLibrariesName,
  TaskId.refreshMetadata => l.webJobsTaskRefreshMetadataName,
  TaskId.probeMedia => l.webJobsTaskProbeMediaName,
  TaskId.prefetchArtwork => l.webJobsTaskPrefetchArtworkName,
  TaskId.prepareDiscover => l.webJobsTaskPrepareDiscoverName,
  TaskId.recommendTitles => l.webJobsTaskRecommendTitlesName,
  TaskId.prepareSubtitles => l.webJobsTaskPrepareSubtitlesName,
  TaskId.makeTrickplay => l.webJobsTaskMakeTrickplayName,
  TaskId.findSegments => l.webJobsTaskFindSegmentsName,
  TaskId.cleanTranscodes => l.webJobsTaskCleanTranscodesName,
  TaskId.cleanSessions => l.webJobsTaskCleanSessionsName,
  TaskId.forgetBrowsedPages => l.webJobsTaskForgetBrowsedPagesName,
  TaskId.syncOidcAccounts => l.webJobsTaskSyncOidcAccountsName,
  _ => task.name,
};

/// "3 of 4 running · 12 waiting", "Paused", or "Idle", with failures.
String queueStatus(AppLocalizations l, JobQueueStatus queue) => [
  if (queue.paused)
    l.webJobsQueuePaused
  else if (queue.active > 0)
    l.webJobsQueueRunning('${queue.active}', '${queue.concurrency}')
  else if (queue.waiting == 0)
    l.webJobsQueueIdle,
  if (queue.waiting > 0) l.webJobsQueueWaiting(queue.waiting),
  if (queue.failed > 0) l.webJobsQueueFailed(queue.failed),
].join(' · ');

/// When the task runs, in a sentence, by its interval and how it starts.
String scheduleOf(AppLocalizations l, ScheduledTask task) {
  final delay = task.startupDelaySeconds?.round();
  final interval = task.intervalSeconds;
  String span(int seconds) => shortDuration(l, seconds);
  if (interval == null) {
    if (delay == null) return l.webJobsScheduleManual;
    if (delay == 0) return l.webJobsScheduleAtStartup;
    return l.webJobsScheduleAfterStartup(span(delay));
  }
  final every = everyText(l, interval);
  if (delay == null) return every;
  if (delay == 0) return l.webJobsScheduleEveryAtStartup(every);
  return l.webJobsScheduleEveryAfterStartup(every, span(delay));
}

/// "Every 5 minutes", in the interval's largest unit, rounded as the web
/// and the Kotlin app round it, so one of a unit reads "Every minute":
/// 59.6 seconds is a minute, and 90 seconds is 2 minutes.
String everyText(AppLocalizations l, double seconds) {
  if (seconds < 59.5) {
    return l.webJobsScheduleEverySeconds(math.max(1, seconds.round()));
  }
  if (seconds < 3570) {
    return l.webJobsScheduleEveryMinutes((seconds / 60).round());
  }
  if (seconds < 84600) {
    return l.webJobsScheduleEveryHours((seconds / 3600).round());
  }
  return l.webJobsScheduleEveryDays((seconds / 86400).round());
}

/// The task's last run and its schedule, or how far the run is now.
String taskStatus(AppLocalizations l, ScheduledTask task) {
  if (task.startedAt != null) {
    final progress = task.progress;
    return progress == null
        ? l.webJobsTaskRunning
        : l.webJobsTaskPercent('${(progress * 100).floor()}');
  }
  final last = switch (task.lastRun) {
    null => l.webJobsTaskNeverRan,
    final run => switch (run.result) {
      TaskResult.completed =>
        '${relativeText(l, run.endedAt)} · ${l.webJobsTaskTook(_took(l, run))}',
      TaskResult.cancelled =>
        '${relativeText(l, run.endedAt)} · '
            '${l.webJobsTaskCancelledAfter(_took(l, run))}',
      _ => switch (run.error) {
        final error? => l.webJobsTaskFailedWith(error.serverWords(l)),
        null => l.webJobsTaskFailed,
      },
    },
  };
  final schedule = scheduleOf(l, task);
  final next = switch (task.nextRunAt) {
    final at? => '$schedule · ${upcomingText(l, at)}',
    null => schedule,
  };
  return '$last\n$next';
}

String _took(AppLocalizations l, TaskRun run) {
  final started = DateTime.tryParse(run.startedAt);
  final ended = DateTime.tryParse(run.endedAt);
  final seconds = started == null || ended == null
      ? 0
      : ended.difference(started).inSeconds;
  return shortDuration(l, seconds);
}

bool _failed(ScheduledTask task) =>
    task.lastRun?.result == TaskResult.failed && task.startedAt == null;

/// Runs the task now, or stops the run going on.
class _TaskButton extends StatelessWidget {
  const _TaskButton({required this.task, required this.onPressed});

  final ScheduledTask task;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final running = task.startedAt != null;
    return RoundIconButton(
      icon: running ? Lucide.x : Lucide.playOutline,
      label: running ? l.webJobsTaskCancel : l.webJobsTaskRun,
      value: taskName(l, task),
      background: const Color(0x00000000),
      onPressed: onPressed,
    );
  }
}

/// A queue, how busy it is, and the task that fills it, with its run
/// button; the row opens the queue's sheet.
class _QueueRow extends StatelessWidget {
  const _QueueRow({
    required this.queue,
    required this.task,
    required this.onTask,
    required this.onPressed,
  });

  final JobQueueStatus queue;
  final ScheduledTask? task;
  final ValueChanged<ScheduledTask> onTask;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final task = this.task;
    return PressIndication(
      onPressed: onPressed,
      label: l.webJobsQueueActions(queueName(l, queue)),
      builder: (context, state) => ColoredBox(
        color: colors.foreground.withValues(
          alpha: state == PressState.idle ? 0 : .06,
        ),
        child: Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 12, 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      queueName(l, queue),
                      style: KitText.base.style(color: colors.foreground),
                    ),
                    Text(
                      queueStatus(l, queue),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: KitText.sm.style(
                        color: queue.failed > 0
                            ? colors.danger
                            : colors.mutedForeground,
                      ),
                    ),
                    if (task != null)
                      Text(
                        taskStatus(l, task),
                        style: KitText.sm.style(
                          color: _failed(task)
                              ? colors.danger
                              : colors.mutedForeground,
                        ),
                      ),
                  ],
                ),
              ),
              if (task != null)
                _TaskButton(task: task, onPressed: () => onTask(task)),
              KitIcon(
                Lucide.chevronRight,
                size: 16,
                color: colors.mutedForeground,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A task that fills no queue: its name, its runs, and its button.
class _TaskRow extends StatelessWidget {
  const _TaskRow({required this.task, required this.onTask});

  final ScheduledTask task;
  final VoidCallback onTask;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 8, 12),
      child: Row(
        spacing: 8,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  taskName(l, task),
                  style: KitText.base.style(color: colors.foreground),
                ),
                Text(
                  taskStatus(l, task),
                  style: KitText.sm.style(
                    color: _failed(task)
                        ? colors.danger
                        : colors.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          _TaskButton(task: task, onPressed: onTask),
        ],
      ),
    );
  }
}

/// How many jobs a queue runs at once, as it's edited, stepped between one
/// and the most the server allows.
class _ConcurrencyRow extends StatelessWidget {
  const _ConcurrencyRow({
    required this.queue,
    required this.value,
    required this.onChanged,
  });

  final JobQueueStatus queue;
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final name = queueName(l, queue);
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 8, 8, 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: KitText.base.style(color: colors.foreground)),
                Text(
                  l.webJobsConcurrencyLimits(
                    '${queue.defaultConcurrency}',
                    '${queue.maxConcurrency}',
                  ),
                  style: KitText.sm.style(color: colors.mutedForeground),
                ),
                if (queue.concurrencyNote case final note?)
                  Text(
                    note.serverWords(l),
                    style: KitText.sm.style(color: colors.mutedForeground),
                  ),
              ],
            ),
          ),
          RoundIconButton(
            icon: Lucide.chevronLeft,
            label: l.webJobsConcurrencyDecrease(name),
            background: const Color(0x00000000),
            onPressed: value > 1 ? () => onChanged(value - 1) : null,
          ),
          SizedBox(
            width: 36,
            child: Semantics(
              liveRegion: true,
              child: Text(
                '$value',
                textAlign: TextAlign.center,
                style: KitText.lg.style(
                  color: colors.foreground,
                  weight: FontWeight.w500,
                ),
              ),
            ),
          ),
          RoundIconButton(
            icon: Lucide.chevronRight,
            label: l.webJobsConcurrencyIncrease(name),
            background: const Color(0x00000000),
            onPressed: value < queue.maxConcurrency
                ? () => onChanged(value + 1)
                : null,
          ),
        ],
      ),
    );
  }
}

/// A queue's details and what can be done to it, kept current while it's
/// open: pause or resume, clear what waits, what runs, and what failed.
/// Pops the action picked.
class _QueueSheet extends ConsumerWidget {
  const _QueueSheet({required this.queueId});

  final String queueId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final queue = ref
        .watch(jobsProvider)
        .value
        ?.queues
        .where((queue) => queue.id == queueId)
        .firstOrNull;
    if (queue == null) return const Sheet(child: SizedBox(height: 120));
    final heading = KitText.sm.style(
      color: colors.foreground,
      weight: FontWeight.w500,
    );
    final muted = KitText.xs.style(color: colors.mutedForeground);
    final retry = queue.retryAfterSeconds;
    return Sheet(
      title: queueName(l, queue),
      description: queueStatus(l, queue),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SheetItem(
            icon: queue.paused ? Lucide.play : Lucide.pause,
            label: queue.paused ? l.webJobsQueueResume : l.webJobsQueuePause,
            onPressed: () =>
                Navigator.pop(context, queue.paused ? 'resume' : 'pause'),
          ),
          if (queue.waiting > 0)
            SheetItem(
              icon: Lucide.trash,
              label: l.webJobsQueueClear,
              destructive: true,
              onPressed: () => Navigator.pop(context, 'clear'),
            ),
          const SheetSeparator(),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 6,
              children: [
                Text(l.webJobsDetailsRunning, style: heading),
                if (queue.running.isEmpty)
                  Text(
                    queue.paused
                        ? l.webJobsDetailsPausedNothingRunning
                        : l.webJobsDetailsNothingRunning,
                    style: muted,
                  ),
                for (final job in queue.running)
                  Text(
                    _jobLabel(l, queue.id, job.label),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: KitText.xs.style(color: colors.foreground),
                  ),
                const SizedBox(height: 8),
                Text(l.webJobsDetailsFailures, style: heading),
                if (queue.failures.isEmpty)
                  Text(l.webJobsDetailsNoFailures, style: muted)
                else
                  Text(
                    retry == null
                        ? l.webJobsDetailsRetryOnRestart
                        : l.webJobsDetailsRetryAfter(
                            shortDuration(l, retry.round()),
                          ),
                    style: muted,
                  ),
                for (final failure in queue.failures)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _jobLabel(l, queue.id, failure.label),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: KitText.xs.style(color: colors.foreground),
                      ),
                      Text(
                        '${relativeText(l, failure.at)} · ${failure.message.serverWords(l)}',
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: KitText.xs.style(color: colors.danger),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
