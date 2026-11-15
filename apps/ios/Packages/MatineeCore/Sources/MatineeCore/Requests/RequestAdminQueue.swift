import Foundation
import Observation

public enum RequestAdminAnswer: Sendable, Equatable {
  case add // web_requests_toast_added
  case decline(reason: String, note: String?) // web_requests_toast_declined
}
/// Admin.kt/RequestsHub.kt: hide a row immediately, defer the mutation until
/// Undo expires, then hold it one more second while live state catches up.
@MainActor @Observable public final class RequestAdminQueue {
  public var queue: RequestQueue?
  public private(set) var held: Set<String> = []
  public private(set) var failure: Failure?
  public private(set) var undoable: Set<String> = []
  @ObservationIgnored private var pending: [String: Task<Void, Never>] = [:]
  @ObservationIgnored private let sleep: @Sendable (Duration) async throws -> Void
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
    let sleep = sleep
    pending[id] = Task { [weak self] in
      do {
        try await sleep(.seconds(6))
        try Task.checkCancellation()
        self?.undoable.remove(id)
        try await perform(id, answer)
        await changed()
      } catch {
        guard !Task.isCancelled else { return }
        self?.failure = Failure(error)
      }
      do { try await sleep(.seconds(1)) } catch { return }
      self?.held.remove(id); self?.pending.removeValue(forKey: id)
    }
  }
  public func answer(id: String, answer: RequestAdminAnswer, actions: RequestActions, changed: @escaping @MainActor () async -> Void = {}) {
    self.answer(id: id, answer: answer, perform: { id, answer in
      switch answer {
      case .add: try await actions.add(id: id)
      case .decline(let reason, let note): try await actions.decline(id: id, reason: reason, note: note)
      }
    }, changed: changed)
  }
  public func undo(id: String) {
    guard undoable.remove(id) != nil else { return }
    pending.removeValue(forKey: id)?.cancel(); held.remove(id)
  }
  public func settled(id: String) async { await pending[id]?.value }
  deinit { for task in pending.values { task.cancel() } }
}
