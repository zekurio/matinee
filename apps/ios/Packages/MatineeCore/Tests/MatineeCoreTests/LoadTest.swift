import Foundation
import Testing

@testable import MatineeCore

/// Android's LoadTest.kt.
struct LoadTest {
  @Test func aFailedRefreshKeepsWhatLoadedBefore() {
    let settled = Load.ready([1, 2]).failedWith("offline")
    #expect(settled.state == .ready([1, 2]))
    #expect(settled.refreshError == "offline")
  }

  @Test func aFailedFirstLoadFails() {
    let before: Load<[Int]> = .loading
    let settled = before.failedWith("offline")
    #expect(settled.state == .failed("offline"))
    #expect(settled.refreshError == nil)
  }

  @Test func notReachingTheServerIsADisconnect() {
    #expect(isDisconnect(URLError(.cannotConnectToHost)))
    #expect(isDisconnect(URLError(.timedOut)))
    #expect(isDisconnect(URLError(.cannotFindHost)))
    // Reached, then cut off mid-answer.
    #expect(isDisconnect(URLError(.networkConnectionLost)))
  }

  @Test func theServerAnsweringWithAnErrorIsNot() {
    #expect(!isDisconnect(ApiException(status: 500, code: nil, message: "Something broke on the server.")))
    struct NotANetworkFailure: Error {}
    #expect(!isDisconnect(NotANetworkFailure()))
  }

  @Test func anAnswerThatDoesNotParseIsUnreadable() {
    let error = DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "bad"))
    #expect(Failure(error) == .unreadable)
    #expect(!isDisconnect(error))
  }

  @Test func cancellingIsNeitherShownNorADisconnect() {
    #expect(Failure(CancellationError()) == .cancelled)
    #expect(Failure(URLError(.cancelled)) == .cancelled)
    #expect(!isDisconnect(CancellationError()))
  }

  @Test func aFirstLoadRemembersItCouldNotReachTheServer() {
    let before: Load<[Int]> = .loading
    let settled = before.failedWith("unreachable", disconnected: true)
    #expect(settled.state == .failed("unreachable", disconnected: true))
    #expect(!settled.refreshDisconnected)
  }

  @Test func aRefreshRemembersItCouldNotReachTheServer() {
    let settled = Load.ready([1]).failedWith("unreachable", disconnected: true)
    #expect(settled.state == .ready([1]))
    #expect(settled.refreshError == "unreachable")
    #expect(settled.refreshDisconnected)
  }

  @Test func aServerErrorIsNotADisconnect() {
    let before: Load<[Int]> = .loading
    #expect(before.failedWith("broke").state == .failed("broke"))
    #expect(!Load.ready([1]).failedWith("broke").refreshDisconnected)
  }

  @Test func aFirstLoadOutOfReachShowsWhatWasKept() {
    let before: Load<[Int]> = .loading
    let settled = before.failedWith("unreachable", disconnected: true) { [3] }
    #expect(settled.state == .ready([3]))
    #expect(settled.refreshError == "unreachable")
    #expect(settled.refreshDisconnected)
  }

  @Test func aServerErrorDoesNotFallBackToWhatWasKept() {
    let before: Load<[Int]> = .loading
    #expect(before.failedWith("broke") { [3] }.state == .failed("broke"))
  }

  @Test func nothingKeptStillFails() {
    let before: Load<[Int]> = .loading
    #expect(
      before.failedWith("unreachable", disconnected: true) { nil }.state
        == .failed("unreachable", disconnected: true))
  }
}

/// The loader around those rules: what shows while it fetches, after an
/// answer, and after a refresh that failed.
@MainActor struct LoaderTest {
  @Test func showsTheAnswer() async {
    let loader = Loader<Int>()
    loader.configure(describe: { _ in "failed" }) { 7 }
    #expect(loader.state == .loading)
    #expect(loader.refreshing)
    await loader.settled()
    #expect(loader.state == .ready(7))
    #expect(!loader.refreshing)
  }

  @Test func aFailedRefreshKeepsTheAnswerAndSaysWhy() async {
    let loader = Loader<Int>()
    let answers = FetchAnswers([.success(1), .failure(URLError(.cannotConnectToHost))])
    loader.configure(describe: { "\($0)" }) { try await answers.next() }
    await loader.settled()
    loader.reload()
    #expect(loader.state == .ready(1))
    await loader.settled()
    #expect(loader.state == .ready(1))
    #expect(loader.refreshError == "unreachable")
    #expect(loader.refreshDisconnected)
  }

  @Test func aFailedFirstLoadShowsLoadingAgainOnRetry() async {
    let loader = Loader<Int>()
    let answers = FetchAnswers([.failure(ApiException(status: 500, code: nil, message: "broke")), .success(2)])
    loader.configure(describe: { failure in
      if case .server(let message) = failure { return message }
      return "other"
    }) { try await answers.next() }
    await loader.settled()
    #expect(loader.state == .failed("broke"))
    loader.reload()
    #expect(loader.state == .loading)
    await loader.settled()
    #expect(loader.state == .ready(2))
  }

  @Test func showingASaveDropsTheFetchStillOut() async {
    let loader = Loader<Int>()
    loader.configure(describe: { _ in "" }) {
      try await Task.sleep(for: .seconds(5))
      return 1
    }
    loader.show(9)
    await loader.settled()
    #expect(loader.state == .ready(9))
    #expect(!loader.refreshing)
  }

  @Test func refreshesOnlyWhenStale() async {
    let loader = Loader<Int>()
    let answers = FetchAnswers([.success(1), .success(2)])
    loader.configure(describe: { _ in "" }) { try await answers.next() }
    await loader.settled()
    loader.refreshIfStale()
    #expect(!loader.refreshing)
    loader.refreshIfStale(maxAge: .zero)
    await loader.settled()
    #expect(loader.state == .ready(2))
  }
}

/// Answers handed out in order, one per fetch.
actor FetchAnswers {
  private var queue: [Result<Int, any Error>]

  init(_ queue: [Result<Int, any Error>]) { self.queue = queue }

  func next() throws -> Int { try queue.removeFirst().get() }
}
