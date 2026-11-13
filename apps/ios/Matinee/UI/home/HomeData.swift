import MatineeCore
import SwiftUI

/*
 * HomeData.kt: what Home loads, and the snapshot of Continue watching and
 * Next up that offline Home sorts the downloads by.
 */

/// Home's loads: the libraries, Continue watching, Next up, and featured.
final class HomeLoaders {
  let libraries = Loader<[Library]>()
  let resume = Loader<[MediaItem]>()
  let nextUp = Loader<[MediaItem]>()
  let featured = Loader<[FeaturedTitle]>()

  var all: [any Reloadable] { [libraries, resume, nextUp, featured] }
}

/// A loader that never fetches again on its return: featured is picked at
/// random, so fetching it again would swap it under the person.
private let NEVER_STALE: Duration = .seconds(1_000_000_000)

extension View {
  /// Loads Home's sections for this page. Back on Home, what's in progress
  /// may have moved on, here or on another device, so the libraries,
  /// Continue watching, and Next up refresh on return; featured stays.
  /// Continue watching and Next up are kept for offline Home as they come.
  func loadsHome(_ loaders: HomeLoaders) -> some View {
    modifier(LoadsHome(loaders: loaders))
  }
}

private struct LoadsHome: ViewModifier {
  let loaders: HomeLoaders
  @Environment(MatineeSession.self) private var session
  @Environment(Downloads.self) private var downloads

  func body(content: Content) -> some View {
    content
      .loads(loaders.libraries) { api in try await api.libraries.list() }
      .loads(loaders.resume) { api in try await api.home.continueWatching(limit: 20) }
      .loads(loaders.nextUp) { api in try await api.home.nextUp(limit: 20).map(\.item) }
      .loads(loaders.featured, maxAge: NEVER_STALE) { api in try await api.home.featured() }
      .onChange(of: loaders.resume.state.value?.map(\.id)) { _, ids in
        if let ids { save { $0.resume = ids } }
      }
      .onChange(of: loaders.nextUp.state.value?.map(\.id)) { _, ids in
        if let ids { save { $0.nextUp = ids } }
      }
  }

  /// Offline Home's order, kept per server beside the downloads.
  private func save(_ change: (inout ServedRows) -> Void) {
    guard let server = session.activeServer else { return }
    let snapshot = HomeSnapshot(root: downloads.store.root, server: server)
    var rows = snapshot.read()
    change(&rows)
    do {
      try snapshot.save(rows)
    } catch {
      AppLog.downloads.error("Could not keep Home's rows for offline")
    }
  }
}
