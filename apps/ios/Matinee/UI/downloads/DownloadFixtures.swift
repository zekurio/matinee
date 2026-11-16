#if DEBUG
  import Foundation
  import MatineeCore

  /*
   * Debug builds' `-dev.downloadFixtures YES`: a made-up download in every
   * state a row can be in, beside the real ones, since most of them, like
   * waiting to try again or refused by the server, are hard to reach on a
   * simulator. They aren't in the store, so pausing, resuming, or removing
   * one does nothing, and playing a finished one finds no file. Release
   * builds don't compile this.
   */

  nonisolated enum DownloadFixtures {
    static var on: Bool { UserDefaults.standard.bool(forKey: "dev.downloadFixtures") }

    /// `-dev.downloadOpen`, what the downloads pages open once they show, to
    /// see a sheet or dialog without a finger: `actions:<itemId>` a row's
    /// sheet, `show:<titleId>` a show row's, `menu` a show page's, `remove`
    /// a show page's question about its first season, `sheet:<itemId>` the
    /// download sheet, `files:<titleId>` or `files:<titleId>:<season>` a
    /// show's or season's; `pause:<itemId>`, `resume:<itemId>`, and
    /// `remove:<itemId>` do that to a download.
    static var open: (what: String, id: String?, season: Int?)? { parse("dev.downloadOpen") }

    /// `-dev.downloadAfter`, the same as `-dev.downloadOpen`, its third part
    /// the seconds to wait first: `pause:<itemId>:5` pauses a download five
    /// seconds after the tab shows.
    static var after: (what: String, id: String?, season: Int?)? { parse("dev.downloadAfter") }

    private static func parse(_ key: String) -> (what: String, id: String?, season: Int?)? {
      guard let value = UserDefaults.standard.string(forKey: key), !value.isEmpty else { return nil }
      let parts = value.split(separator: ":", maxSplits: 2).map(String.init)
      return (parts[0], parts.count > 1 ? parts[1] : nil, parts.count > 2 ? Int(parts[2]) : nil)
    }

    /// `-dev.downloadStart`, which the download sheet presses Download for
    /// once the server has answered, without a finger: `original`, `device`,
    /// or a preset's height. Once.
    static func takeStart() -> String? {
      let value = UserDefaults.standard.string(forKey: "dev.downloadStart")
      UserDefaults.standard.removeObject(forKey: "dev.downloadStart")
      return value?.isEmpty == false ? value : nil
    }

    /// The made-up show's id, for `-dev.route downloads/fixture-show`.
    static let showId = "fixture-show"

    /// `-dev.lowStorage YES`: the worker reads the device as low on storage,
    /// 100 MB left of 64 GB, so a download started from a sheet stays
    /// Waiting, as Android's does, until the app is launched without it.
    @MainActor static func lowStorage(_ downloads: Downloads) {
      guard UserDefaults.standard.bool(forKey: "dev.lowStorage") else { return }
      downloads.worker.capacity = { DownloadCapacity(available: 100_000_000, total: 64_000_000_000) }
    }

    private static let MB: Int64 = 1_000_000

    static let entries: [OfflineItem] = {
      var list: [OfflineItem] = []
      func add(
        _ id: String, _ name: String, show: String? = nil, season: Int? = nil, episode: Int? = nil,
        state: DownloadState, bytes: Int64, total: Int64?, failure: DownloadFailure? = nil, added: Double
      ) {
        guard var entry = fixture(id, name, show: show, season: season, episode: episode) else { return }
        entry.state = state
        entry.bytes = bytes
        entry.totalBytes = total
        entry.failure = failure
        entry.addedAt = added
        list.append(entry)
      }
      add("fixture-running", "The Matrix", state: .running, bytes: 512 * MB, total: 1_210 * MB, added: 10)
      add("fixture-waiting", "Interstellar", state: .queued, bytes: 0, total: 2_140 * MB, added: 11)
      add(
        "fixture-paused", "Breaking Bad", show: showId, season: 1, episode: 3, state: .paused, bytes: 300 * MB,
        total: 420 * MB, added: 12)
      add(
        "fixture-retrying", "Dune", state: .queued, bytes: 180 * MB, total: 1_800 * MB, failure: .unreachable,
        added: 13)
      add(
        "fixture-refused", "Jurassic Park", state: .failed, bytes: 0, total: 900 * MB,
        failure: .server("This file's video can't be converted on this server."), added: 14)
      add(
        "fixture-gave-up", "Blade Runner", state: .failed, bytes: 64 * MB, total: 3_400 * MB, failure: .brokeOff,
        added: 15)
      add("fixture-movie", "Toy Story", state: .done, bytes: 640 * MB, total: 640 * MB, added: 5)
      add(
        "fixture-e1", "Breaking Bad", show: showId, season: 1, episode: 1, state: .done, bytes: 380 * MB,
        total: 380 * MB, added: 6)
      add(
        "fixture-e2", "Breaking Bad", show: showId, season: 1, episode: 2, state: .done, bytes: 395 * MB,
        total: 395 * MB, added: 7)
      add(
        "fixture-s2", "Breaking Bad", show: showId, season: 2, episode: 1, state: .done, bytes: 410 * MB,
        total: 410 * MB, added: 8)
      return list
    }()

    private static let episodes = [1: "Pilot", 2: "Cat's in the Bag...", 3: "...And the Bag's in the River"]
    private static let secondSeason = "Seven Thirty-Seven"

    private static func fixture(_ id: String, _ name: String, show: String?, season: Int?, episode: Int?)
      -> OfflineItem?
    {
      let title = season == 2 ? secondSeason : episode.flatMap { episodes[$0] }
      let label =
        show == nil
        ? #"{"show":"\#(name)","showName":"\#(name)","showKey":"\#(id)","title":"\#(name)","year":"1999","untitled":false,"group":"g","groupLabel":[]}"#
        : #"{"show":"\#(name)","showName":"\#(name)","showKey":"\#(show ?? "")","title":"\#(title ?? "")","episodeNumber":\#(episode ?? 0),"untitled":false,"group":"g","groupLabel":[]}"#
      let json = """
        {"id":"\(id)","libraryId":"fixture","fileTitle":"\(name)","relativePath":"\(id).mp4","container":"mp4",
         "mimeType":"video/mp4","sizeBytes":1,"modifiedAt":"2026-01-01T00:00:00Z","durationSeconds":1000,"favorite":false,
         "title":{"id":"\(show ?? "fixture-title-" + id)","libraryId":"fixture","kind":"\(show == nil ? "movie" : "show")",
           "name":"\(name)","year":1999,"images":{},"genres":[],"favorite":false,"watched":false},
         "seasonNumber":\(season.map(String.init) ?? "null"),"episodeNumber":\(episode.map(String.init) ?? "null"),
         "label":\(label)}
        """
      guard let item = try? JSONDecoder().decode(MediaItem.self, from: Data(json.utf8)) else { return nil }
      var entry = OfflineItem(item: item, kind: .device, file: "", server: "fixture")
      entry.file = "\(entry.key)/video.mp4"
      return entry
    }
  }
#endif
