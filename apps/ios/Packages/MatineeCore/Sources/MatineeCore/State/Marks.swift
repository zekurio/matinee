import Foundation
import Observation

/// Values shown ahead of the server's answer, by id. A request that fails or
/// is cancelled puts back what the server last answered here, or the
/// screen's own value, but only while it's still the newest request for
/// that id, so answers that come back out of order don't undo a later tap.
/// `reconcile` runs when the outcome is unsure: cancelled, or overtaken by a
/// newer request, so screens fetch the truth again.
@MainActor @Observable
public final class Marks {
  private var values: [String: Bool] = [:]
  @ObservationIgnored private var confirmed: [String: Bool] = [:]
  @ObservationIgnored private var newest: [String: Int] = [:]
  @ObservationIgnored private var tickets = 0
  @ObservationIgnored var reconcile: @MainActor () -> Void

  public init(reconcile: @escaping @MainActor () -> Void = {}) {
    self.reconcile = reconcile
  }

  public subscript(id: String) -> Bool? { values[id] }

  public func send(_ id: String, _ value: Bool, request: () async throws -> Void) async throws {
    let ticket = take(id)
    values[id] = value
    do {
      try await request()
    } catch {
      let current = newest[id] == ticket
      if current { restore(id) }
      if !current || Failure(error) == .cancelled { reconcile() }
      throw error
    }
    if newest[id] == ticket { confirmed[id] = value } else { reconcile() }
  }

  /// The server holds `value` for `id` now, by an answer to another request.
  public func confirm(_ id: String, _ value: Bool) {
    _ = take(id)
    values[id] = value
    confirmed[id] = value
  }

  /// Show the screen's own value for `id` again; requests still out for it no longer change it.
  public func forget(_ id: String) {
    _ = take(id)
    values[id] = nil
    confirmed[id] = nil
  }

  private func take(_ id: String) -> Int {
    tickets += 1
    newest[id] = tickets
    return tickets
  }

  private func restore(_ id: String) {
    values[id] = confirmed[id]
  }
}
