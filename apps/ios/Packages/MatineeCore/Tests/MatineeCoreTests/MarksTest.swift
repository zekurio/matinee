import Foundation
import Testing

@testable import MatineeCore

/// Android's MarksTest.kt.
@MainActor struct MarksTest {
  private let counter = Counter()
  private let marks: Marks

  init() {
    let counter = counter
    marks = Marks { counter.count += 1 }
  }

  private var reconciled: Int { counter.count }

  @Test func keepsAMarkTheServerTook() async throws {
    try await marks.send("a", true) {}
    #expect(marks["a"] == true)
    #expect(reconciled == 0)
  }

  @Test func aFailedMarkGoesBackToTheScreensValue() async {
    await #expect(throws: URLError.self) {
      try await marks.send("a", true) { throw URLError(.notConnectedToInternet) }
    }
    #expect(marks["a"] == nil)
    #expect(reconciled == 0)
  }

  @Test func aFailedMarkGoesBackToWhatTheServerLastTook() async throws {
    try await marks.send("a", true) {}
    try? await marks.send("a", false) { throw URLError(.notConnectedToInternet) }
    #expect(marks["a"] == true)
  }

  @Test func anOlderFailureDoesNotUndoANewerMark() async {
    let first = Gate()
    let second = Gate()
    let a = Task { try? await marks.send("a", true) { try await first.wait() } }
    await first.started()
    let b = Task { try? await marks.send("a", false) { try await second.wait() } }
    await second.started()
    #expect(marks["a"] == false)
    first.fail(URLError(.notConnectedToInternet))
    await a.value
    #expect(marks["a"] == false)
    second.open()
    await b.value
    #expect(marks["a"] == false)
    // The overtaken request's outcome is unsure, so screens fetch again.
    #expect(reconciled == 1)
  }

  @Test func theNewestFailureRestoresWhatTheServerConfirmedNotAPendingValue() async throws {
    try await marks.send("a", false) {}
    let first = Gate()
    let second = Gate()
    let a = Task { try? await marks.send("a", true) { try await first.wait() } }
    await first.started()
    let b = Task { try? await marks.send("a", true) { try await second.wait() } }
    await second.started()
    second.fail(URLError(.notConnectedToInternet))
    await b.value
    #expect(marks["a"] == false)
    first.open()
    await a.value
    // Still the newest's restore; the late success asks screens to fetch.
    #expect(marks["a"] == false)
    #expect(reconciled == 1)
  }

  @Test func aCancelledMarkRollsBackAndAsksForTheTruth() async {
    let never = Gate()
    let a = Task { try await marks.send("a", true) { try await never.wait() } }
    await never.started()
    #expect(marks["a"] == true)
    a.cancel()
    let result = await a.result
    #expect(throws: CancellationError.self) { try result.get() }
    #expect(marks["a"] == nil)
    #expect(reconciled == 1)
  }

  @Test func forgettingDropsTheMarkAndIgnoresRequestsStillOut() async {
    let first = Gate()
    let a = Task { try? await marks.send("a", true) { try await first.wait() } }
    await first.started()
    marks.forget("a")
    #expect(marks["a"] == nil)
    first.fail(URLError(.notConnectedToInternet))
    await a.value
    #expect(marks["a"] == nil)
  }

  @Test func confirmingSetsWhatAFailureLaterRestores() async {
    marks.confirm("a", true)
    try? await marks.send("a", false) { throw URLError(.notConnectedToInternet) }
    #expect(marks["a"] == true)
  }

  @Test func idsStayApart() async throws {
    try await marks.send("a", true) {}
    try? await marks.send("b", true) { throw URLError(.notConnectedToInternet) }
    #expect(marks["a"] == true)
    #expect(marks["b"] == nil)
  }
}

@MainActor final class Counter {
  var count = 0
}

/// A request held open until the test lets it answer, fail, or be cancelled.
@MainActor final class Gate {
  private var continuation: CheckedContinuation<Void, any Error>?
  private var waiters: [CheckedContinuation<Void, Never>] = []
  private var cancelled = false

  func wait() async throws {
    try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
        hold(continuation)
      }
    } onCancel: {
      Task { @MainActor in self.fail(CancellationError()) }
    }
  }

  private func hold(_ continuation: CheckedContinuation<Void, any Error>) {
    if cancelled {
      continuation.resume(throwing: CancellationError())
      return
    }
    self.continuation = continuation
    for waiter in waiters { waiter.resume() }
    waiters = []
  }

  /// Returns once a request waits here.
  func started() async {
    if continuation != nil { return }
    await withCheckedContinuation { waiters.append($0) }
  }

  func open() {
    continuation?.resume()
    continuation = nil
  }

  func fail(_ error: any Error) {
    if continuation == nil, error is CancellationError { cancelled = true }
    continuation?.resume(throwing: error)
    continuation = nil
  }
}
