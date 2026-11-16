import Testing
@testable import MatineeCore

@MainActor private final class SlowTile {
  var continuation: CheckedContinuation<Int?, Never>?
  var cancelled = false
  var finished = false

  func load() async -> Int? {
    let value = await withCheckedContinuation { continuation = $0 }
    cancelled = Task.isCancelled
    finished = true
    return value
  }
}

@MainActor @Test func clearingTilesRejectsLateCompletion() async {
  let cache = TrickplayTileCache<Int>()
  let old = SlowTile()
  #expect(cache.tile("tile", load: old.load) == nil)
  while old.continuation == nil { await Task.yield() }
  cache.clear()
  let current = SlowTile()
  #expect(cache.tile("tile", load: current.load) == nil)
  while current.continuation == nil { await Task.yield() }
  old.continuation?.resume(returning: 1)
  while !old.cancelled { await Task.yield() }
  // The main-actor load returns directly to the cache without another suspension.
  #expect(old.cancelled)
  #expect(cache.tile("tile", load: { Issue.record("duplicate load"); return 3 }) == nil)
  current.continuation?.resume(returning: 2)
  while !current.finished { await Task.yield() }
  #expect(cache.tile("tile", load: { nil }) == 2)
  cache.clear()
  #expect(cache.tile("tile", load: { nil }) == nil)
}
