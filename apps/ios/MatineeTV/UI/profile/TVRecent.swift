import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvRecent.kt: everything the person watched last, a file per title,
 * newest first, as a grid of stills behind the profile's row. The heading
 * folds away while focus is below the first row. With nothing yet, it
 * says so, with the way back.
 */

/// The stills across a page: four, each a little narrower than a row's.
private let COLUMNS = 4

struct TVRecentScreen: View {
  @Environment(\.user) private var user

  var body: some View {
    if let user {
      TVRecentPage(username: user.username).id(user.username)
    }
  }
}

private struct TVRecentPage: View {
  let username: String
  @State private var recent = Loader<[WatchedEntry]?>()
  @State private var memory = TVFocusMemory()
  @FocusState private var actionFocused: Bool
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette
  @Environment(\.tvPageOnTop) private var onTop

  var body: some View {
    Group {
      switch recent.state {
      case .loading:
        VStack(alignment: .leading, spacing: 0) {
          heading.padding(.top, TVGrid.top)
          TVLoadingRow().frame(maxHeight: .infinity)
        }
      case .failed(let message, _):
        TVMessage(
          Str.profileRecentLoadFailed, message: message,
          action: TVNoticeAction(Str.commonRetry, icon: .refreshCw, action: recent.reload), actionFocus: $actionFocused
        )
        .tvPageFocus($actionFocused)
      case .ready(let entries):
        if let entries, !entries.isEmpty {
          TVPosterGrid(entries, itemKey: \.item.id, memory: memory, columns: COLUMNS) { entry in
            TVWatchedCard(item: entry.item, width: nil)
          } header: {
            heading
          } line: {
            EmptyView()
          }
          .tvPageFocus(memory) { firstFocus }
        } else {
          // Nothing to show but the way back, so focus has somewhere to be other than the drawer.
          TVMessage(
            Str.profileRecentEmpty, icon: .clock,
            action: TVNoticeAction(Str.commonBack, icon: .arrowLeft) { nav.back() }, actionFocus: $actionFocused
          )
          .tvPageFocus($actionFocused)
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(palette.background)
    .ignoresSafeArea()
    .loads(recent) { [username] api in
      let entries = try await api.profiles.recent(username: username, limit: PROFILE_RECENT_LIMIT)
      return entries
    }
    // The grid comes after the page appears: its first card takes focus once it's there.
    .onChange(of: firstFocus?.item) { _, first in
      if first != nil, onTop, memory.lastRow == nil { memory.restore(fallback: firstFocus) }
    }
  }

  private var heading: some View {
    Text(Str.profileRecent).textStyle(.headline).lineLimit(1)
      .padding(.leading, TVPage.start)
      .padding(.trailing, TVPage.end + TVGrid.clockRoom)
      .accessibilityAddTraits(.isHeader)
  }

  private var firstFocus: (row: String, item: String)? {
    recent.state.value??.first.map { (TVGrid.row, $0.item.id) }
  }
}
