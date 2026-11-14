import Foundation

/*
 * JobsSettings.kt's logic: how busy a queue is, a task's last run and its
 * schedule, how long something took, and the concurrency changed and not
 * saved yet. The app puts them in words.
 */

/// How often the jobs page asks again while it shows, as the web polls its panel.
public let JOBS_POLL: Duration = .seconds(2)

/// The parts of a queue's status line, in order: "3 of 4 running · 12 waiting", "Paused", or "Idle", with failures.
public enum QueuePart: Equatable, Sendable {
  case paused
  case running(active: Int, concurrency: Int)
  case idle
  case waiting(Int)
  case failed(Int)
}

public func queueParts(_ queue: JobQueueStatus) -> [QueuePart] {
  var parts: [QueuePart] = []
  if queue.paused {
    parts.append(.paused)
  } else if queue.active > 0 {
    parts.append(.running(active: queue.active, concurrency: queue.concurrency))
  } else if queue.waiting == 0 {
    parts.append(.idle)
  }
  if queue.waiting > 0 { parts.append(.waiting(queue.waiting)) }
  if queue.failed > 0 { parts.append(.failed(queue.failed)) }
  return parts
}

/// "45 s", "12 min", "3 h 20 min", for how long something took.
public func formatTook(seconds: Int64) -> String {
  if seconds < 60 { return "\(max(seconds, 0)) s" }
  if seconds < 3600 { return "\(seconds / 60) min" }
  return "\(seconds / 3600) h \((seconds % 3600) / 60) min"
}

/// What a task's first line says: how far its run is, or how the last one went.
public enum TaskRunLine: Equatable, Sendable {
  case percent(Int)
  case running
  case completed(endedAt: String, took: String)
  case cancelled(endedAt: String, took: String)
  case failed(String?)
  case neverRan
}

public func taskRunLine(_ task: ScheduledTask) -> TaskRunLine {
  if task.startedAt != nil {
    return task.progress.map { .percent(Int($0 * 100)) } ?? .running
  }
  guard let run = task.lastRun else { return .neverRan }
  let start = parseInstant(run.startedAt)
  let end = parseInstant(run.endedAt)
  let took = formatTook(seconds: Int64((end ?? .distantPast).timeIntervalSince(start ?? (end ?? .distantPast))))
  switch run.result {
  case TaskResult.completed: return .completed(endedAt: run.endedAt, took: took)
  case TaskResult.cancelled: return .cancelled(endedAt: run.endedAt, took: took)
  default: return .failed(run.error)
  }
}

/// How often a task runs.
public enum TaskSchedule: Equatable, Sendable {
  case manual, daily, hourly
  case every(String)
}

public func taskSchedule(_ task: ScheduledTask) -> TaskSchedule {
  switch task.intervalSeconds {
  case nil: .manual
  case 86_400: .daily
  case 3_600: .hourly
  case let interval?: .every(formatTook(seconds: Int64(interval)))
  }
}

/// Whether the task's last run failed, and nothing runs now, which its row shows in red.
public func taskFailed(_ task: ScheduledTask) -> Bool {
  task.lastRun?.result == TaskResult.failed && task.startedAt == nil
}

/// The queues whose concurrency can be set, in the server's order.
public func tunableQueues(_ overview: JobsOverview) -> [JobQueueStatus] {
  overview.queues.filter { $0.concurrencyNote != nil }
}

/// The numbers changed and not saved yet, by queue: `edits` that differ from what the server runs.
public func changedConcurrency(_ overview: JobsOverview?, edits: [String: Int]) -> [String: Int] {
  guard let overview else { return [:] }
  var changed: [String: Int] = [:]
  for queue in tunableQueues(overview) {
    if let edit = edits[queue.id], edit != queue.concurrency { changed[queue.id] = edit }
  }
  return changed
}
