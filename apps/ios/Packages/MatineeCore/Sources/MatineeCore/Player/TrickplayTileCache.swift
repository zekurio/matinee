import Foundation
import Observation

/// Sheets shared by scrubbing frames, with loads scoped to the current player.
@MainActor @Observable public final class TrickplayTileCache<Sheet> {
  private var sheets: [String: Sheet] = [:]
  @ObservationIgnored private var loads: [String: Task<Void, Never>] = [:]
  @ObservationIgnored private var generation = UUID()

  public init() {}

  /// Returns a loaded sheet, starting at most one load per address otherwise.
  public func tile(_ address: String, load: @escaping @MainActor () async -> Sheet?) -> Sheet? {
    if let sheet = sheets[address] { return sheet }
    guard loads[address] == nil else { return nil }
    let generation = generation
    loads[address] = Task { [weak self] in
      let sheet = await load()
      guard let self, self.generation == generation, !Task.isCancelled else { return }
      if let sheet { self.sheets[address] = sheet }
      self.loads[address] = nil
    }
    return nil
  }

  public func clear() {
    generation = UUID()
    for load in loads.values { load.cancel() }
    loads = [:]
    sheets = [:]
  }
}
