import Foundation
import Observation

/// What an admin answers one request with, as Android's `QueueAnswer`.
/// Each goes behind the same Undo; the toast words are the app's.
public enum RequestAdminAnswer: Sendable, Equatable {
  /// Accept a waiting request. web_requests_toast_added
  case add
  /// Decline a waiting request, with the reason's code and a note. web_requests_toast_declined
  case decline(reason: String, note: String?)
  /// Give up on an accepted request: the server declines it with "Can't
  /// find a copy". web_requests_toast_gaveUp
  case giveUp(note: String?)
  /// Lift a decline: the declined request goes, so anyone may ask for the
  /// title afresh. web_requests_toast_allowedAgain
  case allowAgain
  /// Accept a declined request as it stands, and send it. web_requests_toast_addedAfterAll
  case addAfterAll
}

/// Admin.kt/RequestsHub.kt: hide a row immediately, defer the mutation until
/// Undo expires, then hold it one more second while live state catches up.
///
/// A hold is keyed: one request's by its id, Add all's by the key
/// `answerAll` returns. `undo`, `undoable`, and `settled` take that key.
@MainActor @Observable public final class RequestAdminQueue {
  public var queue: RequestQueue?
  /// Requests out of the lists while their answer waits out Undo or the stream.
  public private(set) var held: Set<String> = []
  /// The last answer that failed.
  public private(set) var failure: Failure?
  /// Holds whose Undo still counts, by key.
  public private(set) var undoable: Set<String> = []
  @ObservationIgnored private var pending: [String: Task<Void, Never>] = [:]
  @ObservationIgnored private var outcomes: [String: Failure] = [:]
  @ObservationIgnored private var members: [String: [String]] = [:]
  @ObservationIgnored private var counter = 0
  @ObservationIgnored private let sleep: @Sendable (Duration) async throws -> Void
  /// How long Undo is offered: Android's six seconds, the toast's own.
  public static let undoWindow: Duration = .seconds(6)
  /// How long a sent answer keeps its rows out, for the stream to catch up.
  public static let settleWindow: Duration = .seconds(1)
  public init(sleep: @escaping @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) }) { self.sleep = sleep }
  public func waitingRequest(_ availability: Availability, isAdmin: Bool) -> AdminRequestItem? {
    guard isAdmin, availability.state == "asked", let id = availability.requestId else { return nil }
    return queue?.waiting.first { $0.id == id }
  }
  public func canAnswer(_ item: AdminRequestItem) -> Bool { !held.contains(item.id) }
  public func answer(
    id: String, answer: RequestAdminAnswer,
    perform: @escaping @Sendable (String, RequestAdminAnswer) async throws -> Void,
    changed: @escaping @MainActor () async -> Void = {}
  ) {
    guard held.insert(id).inserted else { return }
    undoable.insert(id)
    members[id] = [id]
    let sleep = sleep
    pending[id] = Task { [weak self] in
      do {
        try await sleep(Self.undoWindow)
        try Task.checkCancellation()
        self?.undoable.remove(id)
        try await perform(id, answer)
        await changed()
      } catch {
        guard !Task.isCancelled else { return }
        self?.failed(id, error)
      }
      // As Android's, a failed answer's row comes back after the same second.
      do { try await sleep(Self.settleWindow) } catch { return }
      self?.release(id)
    }
  }
  public func answer(id: String, answer: RequestAdminAnswer, actions: RequestActions, changed: @escaping @MainActor () async -> Void = {}) {
    self.answer(id: id, answer: answer, perform: { id, answer in try await actions.answer(id: id, answer) }, changed: changed)
  }

  /// Add for every request in `ids` that isn't held already, held for one
  /// Undo, as Android's `answerAll`: they leave the list at once, and once
  /// Undo has passed they go in one call. Sent, they stay out a second
  /// more for the stream; Undo, or a failure, brings them back at once.
  /// The hold's key, for `undo` and `settled`; nil when nothing was left to add.
  @discardableResult
  public func answerAll(
    ids: [String], perform: @escaping @Sendable ([String]) async throws -> Void,
    changed: @escaping @MainActor () async -> Void = {}
  ) -> String? {
    let ids = ids.filter { !held.contains($0) }
    guard !ids.isEmpty else { return nil }
    counter += 1
    let key = "all-\(counter)"
    held.formUnion(ids)
    undoable.insert(key)
    members[key] = ids
    let sleep = sleep
    pending[key] = Task { [weak self] in
      do {
        try await sleep(Self.undoWindow)
        try Task.checkCancellation()
        self?.undoable.remove(key)
        try await perform(ids)
        await changed()
      } catch {
        guard !Task.isCancelled else { return }
        self?.failed(key, error)
        self?.release(key)
        return
      }
      do { try await sleep(Self.settleWindow) } catch { return }
      self?.release(key)
    }
    return key
  }
  public func answerAll(ids: [String], actions: RequestActions, changed: @escaping @MainActor () async -> Void = {}) -> String? {
    answerAll(ids: ids, perform: { ids in try await actions.addAll(ids: ids) }, changed: changed)
  }

  /// Takes a hold back while its Undo counts: nothing is sent, and its rows come back.
  public func undo(id: String) {
    guard undoable.remove(id) != nil else { return }
    pending.removeValue(forKey: id)?.cancel()
    release(id)
  }
  /// Waits for a hold to end; what failed, if its answer did.
  @discardableResult public func settled(id: String) async -> Failure? {
    if let task = pending[id] { await task.value }
    return outcomes.removeValue(forKey: id)
  }
  private func failed(_ key: String, _ error: any Error) {
    let failure = Failure(error)
    self.failure = failure
    outcomes[key] = failure
  }
  private func release(_ key: String) {
    held.subtract(members.removeValue(forKey: key) ?? [])
    pending.removeValue(forKey: key)
  }
  deinit { for task in pending.values { task.cancel() } }
}

// MARK: What each list offers

/// What an admin can do about a request in the queue, as Android's row and its menu.
public enum RequestQueueAction: Sendable, Hashable {
  case add, decline, retry, giveUp, addAfterAll, allowAgain
}

/// What a row's menu offers in `list`, before Open title, in Android's
/// order: Add and Decline a waiting one; Retry and Give up one that needs
/// attention; Give up one on its way; Add after all and Allow again a
/// declined one in Done. An arrived one only opens.
public func requestQueueActions(_ item: AdminRequestItem, in list: RequestQueueList) -> [RequestQueueAction] {
  switch list {
  case .waiting: [.add, .decline]
  case .needsAttention: [.retry, .giveUp]
  case .onTheWay: [.giveUp]
  case .done: item.status == RequestStatus.declined ? [.addAfterAll, .allowAgain] : []
  }
}

/// The button at a row's end: Add while it waits, Retry when it needs attention.
public func requestQueueRowAction(_ list: RequestQueueList) -> RequestQueueAction? {
  switch list {
  case .waiting: .add
  case .needsAttention: .retry
  case .onTheWay, .done: nil
  }
}

extension RequestAdminQueue {
  /// Add all's requests: the waiting rows, once more than one waits.
  public var addsAll: [AdminRequestItem]? {
    let rows = waiting
    return rows.count > 1 ? rows : nil
  }

  /// `items` less the ones held, for a list read apart from the stream, as Done.
  public func unheld(_ items: [AdminRequestItem]) -> [AdminRequestItem] { items.filter(canAnswer) }
}

// MARK: Done

/// Which cursor fetches which page of Done, for `RequestPages`, which counts pages.
public actor RequestCursors {
  private var cursors: [Int: String] = [:]
  public init() {}
  public func cursor(_ page: Int) -> String? { cursors[page] }
  public func set(_ page: Int, _ cursor: String?) { cursors[page] = cursor }
}

extension RequestData {
  /// Done a page at a time from its own call, newest first, as Android's
  /// `DonePages`: the stream the app follows carries only the newest.
  public func doneBatch(page: Int, cursors: RequestCursors) async throws -> RequestPageBatch<AdminRequestItem> {
    let cursor = page > 1 ? await cursors.cursor(page) : nil
    let result = try await api.admin.requests.queue(cursor: cursor, limit: 20)
    if let next = result.nextCursor { await cursors.set(page + 1, next) }
    return .init(items: result.done, nextPage: result.nextCursor == nil ? nil : page + 1, stale: false)
  }
}
