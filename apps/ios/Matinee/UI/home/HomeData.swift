import MatineeCore
import MatineeKit
import SwiftUI

/*
 * HomeData.kt: what Home loads, and the snapshot of Continue watching and
 * Next up that offline Home sorts the downloads by. Each load is
 * MatineeCore's `Loader`; what Home decides from them is MatineeCore's too
 * (Home/HomeSections.swift and Home/Recommendations.swift).
 */

extension View {
  /// Loads Home's sections for this page (`loadsHomeSections`), and keeps
  /// Continue watching and Next up for offline Home as they come.
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
      .loadsHomeSections(loaders)
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
