import Foundation

/*
 * Android's `setRequiresStorageNotLow` on every download's work: a
 * download doesn't start while the device is low on storage, and one
 * running stops back to waiting when storage runs low, to go on once
 * there's room again. Android doesn't weigh the server's size estimate
 * against the room left and says nothing of it: the row reads "Waiting",
 * as it does for any download waiting its turn. The worker here does the
 * same, checking before each start and as a download goes on.
 */

/// The room on the volume downloads go to: what's free for important
/// usage, as the storage line reads it, and the volume's size.
public struct DownloadCapacity: Sendable, Hashable {
  public var available: Int64
  public var total: Int64
  public init(available: Int64, total: Int64) {
    self.available = available
    self.total = total
  }
}

/// Android's low storage: free space at or under the lesser of 5% of the
/// volume and 500 MiB, as its storage monitor works it out
/// (`StorageManager.getStorageLowBytes`), with its own defaults.
public func storageLow(_ capacity: DownloadCapacity) -> Bool {
  capacity.available <= min(capacity.total * 5 / 100, 500 * 1024 * 1024)
}

extension DownloadStore {
  /// The room on the volume the downloads are on, nil where it can't be
  /// read, which holds no download back.
  public func capacity() -> DownloadCapacity? {
    #if os(tvOS)
    return nil
    #else
    guard
      let values = try? root.resourceValues(forKeys: [
        .volumeAvailableCapacityForImportantUsageKey, .volumeTotalCapacityKey,
      ]),
      let available = values.volumeAvailableCapacityForImportantUsage, let total = values.volumeTotalCapacity
    else { return nil }
    return DownloadCapacity(available: available, total: Int64(total))
    #endif
  }
}
