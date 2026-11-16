import MatineeCore
import MatineeKit
import SwiftUI

/*
 * RecentScreen.kt: the whole list behind the profile's Recently watched
 * row. The server sends it in one answer of up to a hundred titles
 * (`PROFILE_RECENT_LIMIT`), so it loads at once rather than page by page.
 */

/// Everything the signed-in person watched last, the latest file of each
/// title, newest first, as Favorites lists the favorites: the whole list
/// behind the profile's row of a dozen.
struct RecentScreen: View {
  @Environment(\.user) private var user

  var body: some View {
    RecentList(username: user?.username ?? "").id(user?.username)
  }
}

/// The least a still takes in the grid from a tablet's width up, so a row
/// of them reads as the rails' stills do.
private let STILL_MINIMUM: CGFloat = 240

private struct RecentList: View {
  let username: String
  @State private var recent = Loader<[WatchedEntry]?>()

  var body: some View {
    let username = username
    Group {
      switch recent.state {
      case .loading: LoadingBox()
      case .failed(let message, let disconnected):
        ErrorBox(Str.profileRecentLoadFailed, message, disconnected: disconnected, onRetry: recent.reload)
      case .ready(let entries):
        let entries = entries ?? []
        if entries.isEmpty {
          ScrollView {
            EmptyState(icon: .clock, title: Str.profileRecentEmpty).padding(.vertical, Space.s12)
          }
        } else {
          ScrollView {
            CardGrid(minimum: STILL_MINIMUM) {
              ForEach(entries, id: \.item.id) { entry in EpisodeCard(entry.item) }
            }
            .padding(.top, Space.s2)
            .padding(.bottom, Space.s8)
          }
          .refreshable {
            recent.reload()
            await recent.settled()
          }
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .topBar(Str.profileRecent) { DisconnectedAction(recent) }
    .loads(recent) { api in
      let entries = try await api.profiles.recent(username: username, limit: PROFILE_RECENT_LIMIT)
      #if DEBUG
        if StatsFixtures.mode == .empty { return [] }
      #endif
      return entries
    }
  }
}
