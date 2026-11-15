import MatineeCore
import MatineeKit
import SwiftUI

/*
 * JobsSettings.kt: the server's background work. How busy a queue is and
 * how a task's runs read are MatineeCore's (Admin/JobsStatus.swift); this
 * puts them in words.
 *
 * The server has no stream for the jobs; the page asks again every two
 * seconds while it shows, as the web's panel and Android's page do.
 */

/// Background work, as the web's jobs panel: one list of the queues, how
/// busy each is, and the scheduled task that fills it, then the tasks that
/// fill none and do their upkeep themselves, and how many jobs each queue
/// runs at once, saved from the save bar as on the web. A queue's sheet
/// pauses it and clears what waits; a task runs now or stops from its row.
/// The page keeps itself current while it shows.
struct JobsSettings: View {
  @State private var loader = Loader<JobsOverview>()
  @State private var saver = Saver()
  @State private var open: String?
  // The numbers changed and not saved yet, by queue; the rest follow the server as it polls.
  @State private var edits: [String: Int] = [:]
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar

  var body: some View {
    let overview = loader.state.value
    let changed = changedConcurrency(overview, edits: edits)
    SaveBarScaffold(
      Str.settingsAdminJobs, dirty: !changed.isEmpty, onReset: { edits = [:] },
      onSave: {
        guard let api else { return }
        loader.show(try await api.admin.jobs.updateConcurrency(concurrency: changed))
        edits = [:]
      }
    ) {
      AdminLoaded(loader, failed: Str.webJobsLoadFailed) { overview in
        SettingsSection(Str.webJobsQueues) {
          Panel {
            ForEach(Array(overview.queues.enumerated()), id: \.element.id) { index, queue in
              if index > 0 { RowDivider() }
              let task = overview.tasks.first { $0.queue == queue.id }
              QueueRow(queue: queue, task: task, onTask: { action in task.map { run($0, action) } }) { open = queue.id }
            }
            ForEach(overview.tasks.filter { $0.queue == nil }, id: \.id) { task in
              RowDivider()
              TaskRow(task: task) { run(task, $0) }
            }
          }
        }
        let queues = tunableQueues(overview)
        if !queues.isEmpty {
          SettingsSection(Str.webJobsConcurrency) {
            Panel {
              ForEach(Array(queues.enumerated()), id: \.element.id) { index, queue in
                if index > 0 { RowDivider() }
                ConcurrencyRow(
                  queue: queue,
                  value: Binding(get: { edits[queue.id] ?? queue.concurrency }, set: { edits[queue.id] = $0 }))
              }
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
    .sheet(isPresented: Binding(get: { open != nil }, set: { if !$0 { open = nil } })) {
      if let queue = overview?.queues.first(where: { $0.id == open }) {
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

/// The task's last run and its schedule, or how far it is now.
private func taskStatus(_ task: ScheduledTask) -> String {
  let line: String =
    switch taskRunLine(task) {
    case .percent(let percent): Str.webJobsTaskPercent(String(percent))
    case .running: Str.webJobsTaskRunning
    case .completed(let endedAt, let took): "\(relativeTime(endedAt)) · \(Str.webJobsTaskTook(took))"
    case .cancelled(let endedAt, let took): "\(relativeTime(endedAt)) · \(Str.webJobsTaskCancelledAfter(took))"
    case .failed(let error?): Str.webJobsTaskFailedWith(error)
    case .failed(nil): Str.webJobsTaskFailed
    case .neverRan: Str.webJobsTaskNeverRan
    }
  if task.startedAt != nil { return line }
  let schedule: String =
    switch taskSchedule(task) {
    case .manual: Str.webJobsScheduleManual
    case .daily: Str.webJobsScheduleDaily
    case .hourly: Str.webJobsScheduleHourly
    case .every(let interval): Str.webJobsScheduleEvery(interval)
    }
  let next = task.nextRunAt.map { "\(schedule) · \(relativeTime($0))" } ?? schedule
  return "\(line)\n\(next)"
}

/// A task's last run, or how far it is now, and its schedule, under the row's other lines.
private struct TaskStatus: View {
  let task: ScheduledTask
  @Environment(\.palette) private var palette

  var body: some View {
    Text(taskStatus(task)).textStyle(.px13)
      .foregroundStyle(taskFailed(task) ? palette.destructive : palette.mutedForeground)
  }
}

/// Runs the task now, or stops the run going on.
private struct TaskButton: View {
  let task: ScheduledTask
  let onAction: (TaskAction) -> Void

  var body: some View {
    let running = task.startedAt != nil
    LegacyRoundIconButton(
      running ? .x : .playOutline, label: running ? Str.webJobsTaskCancel : Str.webJobsTaskRun, background: .clear
    ) { onAction(running ? .cancel : .run) }
  }
}

/// A queue, how busy it is, and the task that fills it, with its run
/// button; the row opens the queue's sheet.
private struct QueueRow: View {
  let queue: JobQueueStatus
  let task: ScheduledTask?
  let onTask: (TaskAction) -> Void
  let onOpen: () -> Void
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType

  var body: some View {
    Button(action: onOpen) {
      HStack(spacing: 4) {
        VStack(alignment: .leading, spacing: 0) {
          Text(queueName(queue)).textStyle(.base).foregroundStyle(palette.foreground)
          Text(queueStatus(queue)).textStyle(.px13)
            .foregroundStyle(queue.failed > 0 ? palette.destructive : palette.mutedForeground)
            .lineLimit(dynamicType.isAccessibilitySize ? nil : 1)
          if let task { TaskStatus(task: task) }
        }
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, alignment: .leading)
        // The run button sits over this, outside the row's own button.
        if task != nil { Color.clear.frame(width: TouchTarget, height: TouchTarget) }
        LucideIcon(.chevronRight, size: 16, tint: palette.mutedForeground)
      }
      .padding(.leading, 16)
      .padding(.trailing, 12)
      .padding(.vertical, 12)
      .contentShape(Rectangle())
    }
    .buttonStyle(LegacyRowPress())
    .accessibilityHint(Str.webJobsQueueDetails)
    .overlay(alignment: .trailing) {
      if let task {
        TaskButton(task: task, onAction: onTask).padding(.trailing, 12 + 16 + 4)
      }
    }
  }
}

/// A task that fills no queue: its name, its runs, and its button.
private struct TaskRow: View {
  let task: ScheduledTask
  let onAction: (TaskAction) -> Void

  var body: some View {
    HStack(spacing: 8) {
      VStack(alignment: .leading, spacing: 0) {
        Text(taskName(task)).textStyle(.base)
        TaskStatus(task: task)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .combine)
      TaskButton(task: task, onAction: onAction)
    }
    .padding(.leading, 16)
    .padding(.trailing, 8)
    .padding(.vertical, 12)
  }
}

/// How many jobs `queue` runs at once, `value` as it's edited, stepped between one and its maximum.
private struct ConcurrencyRow: View {
  let queue: JobQueueStatus
  @Binding var value: Int
  @Environment(\.palette) private var palette

  var body: some View {
    let name = queueName(queue)
    HStack(spacing: 0) {
      VStack(alignment: .leading, spacing: 0) {
        Text(name).textStyle(.base)
        Text(Str.webJobsConcurrencyLimits(String(queue.defaultConcurrency), String(queue.maxConcurrency)))
          .textStyle(.px13).foregroundStyle(palette.mutedForeground)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      LegacyRoundIconButton(.chevronLeft, label: Str.webJobsConcurrencyDecrease(name), background: .clear) { value -= 1 }
        .disabled(value <= 1)
      Text(String(value)).textStyle(.base, weight: .semibold).monospacedDigit()
        .frame(minWidth: 36)
        .multilineTextAlignment(.center)
        .accessibilityHidden(true)
      LegacyRoundIconButton(.chevronRight, label: Str.webJobsConcurrencyIncrease(name), background: .clear) { value += 1 }
        .disabled(value >= queue.maxConcurrency)
    }
    .padding(.leading, 16)
    .padding(.trailing, 8)
    .padding(.vertical, 8)
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
}

/// A queue's details and what can be done to it.
private struct QueueSheet: View {
  let queue: JobQueueStatus
  let onAction: (QueueAction) -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        LegacySheetHeader(queueName(queue), queueStatus(queue))
        LegacySheetItem(queue.paused ? .play : .pause, queue.paused ? Str.webJobsQueueResume : Str.webJobsQueuePause) {
          onAction(queue.paused ? .resume : .pause)
        }
        if queue.waiting > 0 {
          LegacySheetItem(.trash, Str.webJobsQueueClear, destructive: true) { onAction(.clear) }
        }
        Rectangle().fill(palette.border).frame(height: 1).padding(.vertical, 6)
        VStack(alignment: .leading, spacing: 6) {
          Text(Str.webJobsDetailsRunning).textStyle(.sm, weight: .medium).accessibilityAddTraits(.isHeader)
          if queue.running.isEmpty {
            Note(queue.paused ? Str.webJobsDetailsPausedNothingRunning : Str.webJobsDetailsNothingRunning)
          }
          ForEach(Array(queue.running.enumerated()), id: \.offset) { _, job in
            Text(job.label).textStyle(.px13).lineLimit(2)
          }
          Text(Str.webJobsDetailsFailures).textStyle(.sm, weight: .medium).accessibilityAddTraits(.isHeader).padding(.top, 8)
          if queue.failures.isEmpty {
            Note(Str.webJobsDetailsNoFailures)
          }
          ForEach(Array(queue.failures.enumerated()), id: \.offset) { _, failure in
            VStack(alignment: .leading, spacing: 0) {
              Text(failure.label).textStyle(.px13).lineLimit(2)
              Text("\(relativeTime(failure.at)) · \(failure.message)").textStyle(.px13)
                .foregroundStyle(palette.destructive).lineLimit(3)
            }
            .accessibilityElement(children: .combine)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
      }
      .padding(.vertical, 12)
    }
    .legacySheet()
  }
}
