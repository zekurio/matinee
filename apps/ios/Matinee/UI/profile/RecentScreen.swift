import MatineeCore
import MatineeKit
import SwiftUI

/*
 * RecentScreen.kt: the whole list behind the profile's Recently watched
 * row. The server sends it in one answer of up to a hundred titles, so it
 * loads at once rather than page by page.
 */

/// How many titles the list goes back.
private let LIMIT = 100

/// Everything the signed-in person watched last, the latest file of each
/// title, newest first, as Favorites lists the favorites: the whole list
/// behind the profile's row of a dozen.
struct RecentScreen: View {
  @Environment(\.user) private var user

  var body: some View {
    RecentList(username: user?.username ?? "").id(user?.username)
  }
}

private struct RecentList: View {
  let username: String
  @State private var recent = Loader<[WatchedEntry]?>()
  @Environment(\.palette) private var palette

  var body: some View {
    let username = username
    Group {
      switch recent.state {
      case .failed(let message, let disconnected):
        ErrorBox(Str.profileRecentLoadFailed, message, disconnected: disconnected, onRetry: recent.reload)
      case .loading: LoadingBox()
      case .ready(let entries):
        let entries = entries ?? []
        if entries.isEmpty {
          ScrollView { Empty() }
        } else {
          ScrollView {
            CardGrid {
              ForEach(entries, id: \.item.id) { entry in EpisodeCard(entry.item) }
            }
            .padding(.top, 8)
            .padding(.bottom, 32)
          }
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(palette.background)
    .legacyTopBar(Str.profileRecent) { DisconnectedAction(recent) }
    .loads(recent) { api in try await api.profiles.recent(username: username, limit: LIMIT) }
  }
}

private struct Empty: View {
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: 12) {
      LucideIcon(.clock, size: 28, tint: palette.mutedForeground)
      Text(Str.profileRecentEmpty).textStyle(.base, weight: .semibold).foregroundStyle(palette.foreground)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity)
    .padding(.horizontal, 32)
    .padding(.vertical, 64)
    .accessibilityElement(children: .combine)
  }
}
