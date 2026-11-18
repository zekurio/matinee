import Foundation
import Observation

/// What a screen loads from the server, kept while the screen is on the
/// navigation stack. `state` is ready from the first answer on; a fetch after
/// that which fails leaves it and sets `refreshError` instead.
///
/// A screen holds one in `@State` and gives it its fetch with the app's
/// `.loads(_:fetch:)`, which also fetches again when the viewer's marks
/// change and when the screen comes back after a while.
@MainActor @Observable
public final class Loader<T: Sendable> {
  public private(set) var state: Load<T> = .loading

  /// Why the newest fetch failed while `state` still shows an earlier answer; nil once one comes.
  public private(set) var refreshError: String?

  /// `refreshError` came from not reaching the server, rather than from its answer.
  public private(set) var refreshDisconnected = false

  /// A fetch is out.
  public private(set) var refreshing = false

  @ObservationIgnored private var fetch: (@Sendable () async throws -> T)?
  @ObservationIgnored private var describe: @MainActor (Failure) -> String = { _ in "" }
  @ObservationIgnored private let kept: (any Kept<T>)?
  @ObservationIgnored private var task: Task<Void, Never>?
  @ObservationIgnored private var generation = 0
  @ObservationIgnored private var settledAt: ContinuousClock.Instant?

  /// With `kept`, each answer is saved, and the saved one shows while the
  /// server can't be reached.
  public init(kept: (any Kept<T>)? = nil) {
    self.kept = kept
  }

  /// Whether it has a fetch yet.
  public var configured: Bool { fetch != nil }

  /// What to fetch and how to word a failure. The first call fetches; later
  /// ones only swap the fetch, as a view's body hands it in again.
  public func configure(
    describe: @escaping @MainActor (Failure) -> String,
    fetch: @escaping @Sendable () async throws -> T
  ) {
    let first = self.fetch == nil
    self.describe = describe
    self.fetch = fetch
    if first { reload() }
  }

  /// Show what a save answered with, without fetching it again.
  public func show(_ value: T) {
    task?.cancel()
    generation += 1
    settle(Settled(state: .ready(value), refreshError: nil))
  }

  /// Fetch again. What showed stays until the answer comes, unless it failed.
  public func reload() {
    guard let fetch else { return }
    task?.cancel()
    generation += 1
    let mine = generation
    if state.isFailed { state = .loading }
    refreshing = true
    task = Task { [weak self] in
      do {
        let value = try await fetch()
        // A newer fetch or a save took over while this one was out.
        guard let self, mine == self.generation else { return }
        self.settle(Settled(state: .ready(value), refreshError: nil))
        self.kept?.write(value)
      } catch {
        guard let self, mine == self.generation else { return }
        let failure = Failure(error)
        if failure == .cancelled { return }
        let kept = self.kept
        self.settle(
          self.state.failedWith(
            self.describe(failure), disconnected: failure.isDisconnect,
            kept: kept.map { kept in { kept.read() } }))
      }
    }
  }

  /// Fetch again if none is out and the last ended at least `maxAge` ago.
  public func refreshIfStale(maxAge: Duration = REFRESH_AFTER) {
    guard !refreshing else { return }
    if let settledAt, ContinuousClock.now - settledAt < maxAge { return }
    reload()
  }

  /// Wait for the fetch that's out, as pull to refresh does.
  public func settled() async {
    await task?.value
  }

  private func settle(_ next: Settled<T>) {
    state = next.state
    refreshError = next.refreshError
    refreshDisconnected = next.refreshDisconnected
    refreshing = false
    settledAt = .now
  }
}
