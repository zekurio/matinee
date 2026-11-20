import MatineeCore
import MatineeKit
import SwiftUI

/*
 * JobsSettings.kt: the server's background work, as the web's jobs panel.
 * How busy a queue is and how a task's runs read are MatineeCore's
 * (Admin/JobsStatus.swift); this puts them in words.
 *
 * The server has no stream for the jobs; the page asks again every two
 * seconds while it shows, as the web's panel and Android's page do.
 */

/// Background work: one list of the queues, how busy each is, and the
/// scheduled task that fills it, then the tasks that fill none and do their
/// upkeep themselves, and how many jobs each queue runs at once, saved from
/// the save bar as on the web. A queue's sheet pauses it and clears what
/// waits; a task runs now or stops from its row. The page keeps itself
/// current while it shows.
struct JobsSettings: View {
  @State private var loader = Loader<JobsOverview>()
  @State private var saver = Saver()
  @State private var open: Picked<String>?
  // The numbers changed and not saved yet, by queue; the rest follow the server as it polls.
  @State private var edits: [String: Int] = [:]
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar

  var body: some View {
    let overview = loader.state.value
    let changed = changedConcurrency(overview, edits: edits)
    SaveBarPage(
      Str.settingsAdminJobs, dirty: !changed.isEmpty, onReset: { edits = [:] },
      onSave: {
        guard let api else { return }
        loader.show(try await api.admin.jobs.updateConcurrency(concurrency: changed))
        edits = [:]
      }
    ) {
      AdminLoaded(loader) { overview in
        ListSection(Str.webJobsQueues) {
          ForEach(overview.queues, id: \.id) { queue in
            let task = overview.tasks.first { $0.queue == queue.id }
            QueueRow(queue: queue, task: task, onTask: { action in task.map { run($0, action) } }) {
              open = Picked(queue.id, queue.id)
            }
          }
          ForEach(overview.tasks.filter { $0.queue == nil }, id: \.id) { task in
            TaskRow(task: task) { run(task, $0) }
          }
        }
        let queues = tunableQueues(overview)
        if !queues.isEmpty {
          ListSection(Str.webJobsConcurrency) {
            ForEach(queues, id: \.id) { queue in
              ConcurrencyRow(
                queue: queue,
                value: Binding(get: { edits[queue.id] ?? queue.concurrency }, set: { edits[queue.id] = $0 }))
            }
          }
        }
      }
    }
    .loads(loader) { api in try await api.admin.jobs.get() }
    // Current while it shows; the task ends when the page goes.
    .task {
      while !Task.isCancelled {
        try? await Task.sleep(for: JOBS_POLL)
        if !Task.isCancelled { loader.reload() }
      }
    }
    .matineeSheet(item: $open) { picked in
      // The sheet follows the page as it polls.
      if let queue = loader.state.value?.queues.first(where: { $0.id == picked.value }) {
        QueueSheet(queue: queue) { act(queue, $0) }
      }
    }
  }

  private func run(_ task: ScheduledTask, _ action: TaskAction) {
    guard let api else { return }
    saver(snackbar) {
      switch action {
      case .cancel: _ = try await api.admin.jobs.cancelTask(task: task.id)
      case .run: _ = try await api.admin.jobs.runTask(task: task.id)
      }
      loader.reload()
    }
  }

  private func act(_ queue: JobQueueStatus, _ action: QueueAction) {
    guard let api else { return }
    saver(snackbar) {
      switch action {
      case .pause: _ = try await api.admin.jobs.pause(queue: queue.id)
      case .resume: _ = try await api.admin.jobs.resume(queue: queue.id)
      case .clear: _ = try await api.admin.jobs.clear(queue: queue.id)
      }
      loader.reload()
    }
  }
}

private enum TaskAction { case run, cancel }
private enum QueueAction { case pause, resume, clear }

/// A queue's name in the app's language, else what the server sent, in English.
private func queueName(_ queue: JobQueueStatus) -> String {
  webMessage("web_jobs_queue_\(queue.id.replacingOccurrences(of: "-", with: "_"))_name", fallback: queue.name)
}

private func taskName(_ task: ScheduledTask) -> String {
  webMessage("web_jobs_task_\(task.id.replacingOccurrences(of: "-", with: "_"))_name", fallback: task.name)
}

/// "3 of 4 running · 12 waiting", "Paused", or "Idle", with failures.
private func queueStatus(_ queue: JobQueueStatus) -> String {
  queueParts(queue).map { part in
    switch part {
    case .paused: Str.webJobsQueuePaused
    case .running(let active, let concurrency): Str.webJobsQueueRunning(String(active), String(concurrency))
    case .idle: Str.webJobsQueueIdle
    case .waiting(let count): Str.webJobsQueueWaiting(count)
    case .failed(let count): Str.webJobsQueueFailed(count)
    }
  }
  .joined(separator: " · ")
}

/// How the task's last run went, or how far the one going is.
private func taskRun(_ task: ScheduledTask) -> String {
  switch taskRunLine(task) {
  case .percent(let percent): Str.webJobsTaskPercent(String(percent))
  case .running: Str.webJobsTaskRunning
  case .completed(let endedAt, let took): "\(relativeTime(endedAt)) · \(Str.webJobsTaskTook(took))"
  case .cancelled(let endedAt, let took): "\(relativeTime(endedAt)) · \(Str.webJobsTaskCancelledAfter(took))"
  case .failed(let error?): Str.webJobsTaskFailedWith(error)
  case .failed(nil): Str.webJobsTaskFailed
  case .neverRan: Str.webJobsTaskNeverRan
  }
}

/// How often the task runs, and when next.
private func taskNext(_ task: ScheduledTask) -> String {
  let schedule: String =
    switch taskSchedule(task) {
    case .manual: Str.webJobsScheduleManual
    case .seconds(let count): Str.webJobsScheduleEverySeconds(count)
    case .minutes(let count): Str.webJobsScheduleEveryMinutes(count)
    case .hours(let count): Str.webJobsScheduleEveryHours(count)
    case .days(let count): Str.webJobsScheduleEveryDays(count)
    }
  return task.nextRunAt.map { "\(schedule) · \(relativeTime($0))" } ?? schedule
}

/// A task's last run, or how far it is now, and its schedule, with a bar while it runs.
private struct TaskLines: View {
  let task: ScheduledTask
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(taskRun(task)).textStyle(.px13)
        .foregroundStyle(taskFailed(task) ? palette.destructive : palette.mutedForeground)
      if task.startedAt == nil {
        Text(taskNext(task)).textStyle(.px13).foregroundStyle(palette.mutedForeground)
      }
      if task.startedAt != nil, let progress = task.progress {
        ProgressBar(progress).padding(.top, Space.s1).frame(maxWidth: 240)
          .accessibilityHidden(true)
      }
    }
  }
}

/// Runs the task now, or stops the run going on, as Android's bare icon.
private struct TaskButton: View {
  let task: ScheduledTask
  let onAction: (TaskAction) -> Void

  var body: some View {
    let running = task.startedAt != nil
    RoundIconButton(
      running ? .x : .playOutline, label: running ? Str.webJobsTaskCancel : Str.webJobsTaskRun, look: .ghost,
      size: 44, iconSize: 20
    ) { onAction(running ? .cancel : .run) }
  }
}

/// A queue, how busy it is, and the task that fills it, with its run
/// button; the rest of the row opens the queue's sheet.
private struct QueueRow: View {
  let queue: JobQueueStatus
  let task: ScheduledTask?
  let onTask: (TaskAction) -> Void
  let onOpen: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Pressable(action: onOpen) {
      HStack(spacing: 0) {
        VStack(alignment: .leading, spacing: 0) {
          Text(queueName(queue)).textStyle(.base).foregroundStyle(palette.foreground)
          Text(queueStatus(queue)).textStyle(.px13).lineLimit(1)
            .foregroundStyle(queue.failed > 0 ? palette.destructive : palette.mutedForeground)
          if let task { TaskLines(task: task) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        // The run button sits over this, outside the row's own button.
        if task != nil { Color.clear.frame(width: TouchTarget, height: TouchTarget) }
        LucideIcon(.chevronRight, size: 16, tint: palette.mutedForeground)
      }
      .padding(.leading, Space.s4)
      .padding(.trailing, Space.s3)
      .padding(.vertical, Space.s3)
      .contentShape(Rectangle())
    }
    .accessibilityElement(children: .combine)
    .accessibilityHint(Str.webJobsQueueDetails)
    .overlay(alignment: .trailing) {
      if let task {
        TaskButton(task: task, onAction: onTask)
          .padding(.trailing, Space.s3 + 16)
      }
    }
  }
}

/// A task that fills no queue: its name, its runs, and its button.
private struct TaskRow: View {
  let task: ScheduledTask
  let onAction: (TaskAction) -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: Space.s2) {
      VStack(alignment: .leading, spacing: 0) {
        Text(taskName(task)).textStyle(.base).foregroundStyle(palette.foreground)
        TaskLines(task: task)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .combine)
      TaskButton(task: task, onAction: onAction)
    }
    .padding(.leading, Space.s4)
    .padding(.trailing, Space.s2)
    .padding(.vertical, Space.s3)
  }
}

/// How many jobs `queue` runs at once, `value` as it's edited, stepped
/// between one and its maximum with Android's chevrons either side.
private struct ConcurrencyRow: View {
  let queue: JobQueueStatus
  @Binding var value: Int
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType

  var body: some View {
    let name = queueName(queue)
    let text = VStack(alignment: .leading, spacing: 0) {
      Text(name).textStyle(.base).foregroundStyle(palette.foreground)
      Text(Str.webJobsConcurrencyLimits(String(queue.defaultConcurrency), String(queue.maxConcurrency)))
        .textStyle(.px13).foregroundStyle(palette.mutedForeground)
    }
    Group {
      // At the accessibility sizes the stepper goes under its name.
      if dynamicType.isAccessibilitySize {
        VStack(alignment: .leading, spacing: Space.s2_5) {
          text
          stepper
        }
      } else {
        HStack(spacing: Space.s3) {
          text.frame(maxWidth: .infinity, alignment: .leading)
          stepper
        }
      }
    }
    .padding(.leading, Space.s4)
    .padding(.trailing, Space.s2)
    .padding(.vertical, Space.s2)
    .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
    // VoiceOver reads the number as the row's value and steps it with a swipe.
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(name)
    .accessibilityValue(String(value))
    .accessibilityAdjustableAction { direction in
      switch direction {
      case .increment: if value < queue.maxConcurrency { value += 1 }
      case .decrement: if value > 1 { value -= 1 }
      @unknown default: break
      }
    }
  }

  private var stepper: some View {
    let name = queueName(queue)
    return HStack(spacing: 0) {
      RoundIconButton(
        .chevronLeft, label: Str.webJobsConcurrencyDecrease(name), look: .ghost, size: 44, iconSize: 20
      ) { value -= 1 }
      .disabled(value <= 1)
      Text(String(value)).textStyle(.base, weight: .semibold).monospacedDigit()
        .foregroundStyle(palette.foreground)
        .frame(minWidth: 36)
        .contentTransition(.numericText(value: Double(value)))
        .motion(Motion.color, value: value)
      RoundIconButton(
        .chevronRight, label: Str.webJobsConcurrencyIncrease(name), look: .ghost, size: 44, iconSize: 20
      ) { value += 1 }
      .disabled(value >= queue.maxConcurrency)
    }
  }
}

/// A queue's details and what can be done to it.
private struct QueueSheet: View {
  let queue: JobQueueStatus
  let onAction: (QueueAction) -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    // A long list of failures scrolls, the header and the actions with it, as Android's.
    SheetBody { content }
  }

  @ViewBuilder private var content: some View {
    SheetHeader(queueName(queue), subtitle: queueStatus(queue))
    SheetItem(
      queue.paused ? Str.webJobsQueueResume : Str.webJobsQueuePause, icon: queue.paused ? .play : .pause
    ) { onAction(queue.paused ? .resume : .pause) }
    if queue.waiting > 0 {
      SheetItem(Str.webJobsQueueClear, icon: .trash, destructive: true) { onAction(.clear) }
    }
    Separator().padding(.vertical, Space.s1_5)
    VStack(alignment: .leading, spacing: Space.s1_5) {
      Text(Str.webJobsDetailsRunning).textStyle(.sm, weight: .semibold).accessibilityAddTraits(.isHeader)
      if queue.running.isEmpty {
        Text(queue.paused ? Str.webJobsDetailsPausedNothingRunning : Str.webJobsDetailsNothingRunning)
          .textStyle(.px13).foregroundStyle(palette.mutedForeground)
      }
      ForEach(Array(queue.running.enumerated()), id: \.offset) { _, job in
        Text(job.label).textStyle(.px13).foregroundStyle(palette.foreground).lineLimit(2)
      }
      Text(Str.webJobsDetailsFailures).textStyle(.sm, weight: .semibold).accessibilityAddTraits(.isHeader)
        .padding(.top, Space.s3)
      if queue.failures.isEmpty {
        Text(Str.webJobsDetailsNoFailures).textStyle(.px13).foregroundStyle(palette.mutedForeground)
      }
      ForEach(Array(queue.failures.enumerated()), id: \.offset) { _, failure in
        VStack(alignment: .leading, spacing: 0) {
          Text(failure.label).textStyle(.px13).foregroundStyle(palette.foreground).lineLimit(2)
          Text("\(relativeTime(failure.at)) · \(failure.message)").textStyle(.px13)
            .foregroundStyle(palette.destructive).lineLimit(3)
        }
        .accessibilityElement(children: .combine)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, Space.sheet)
    .padding(.top, Space.s2)
    .padding(.bottom, Space.s4)
  }
}
