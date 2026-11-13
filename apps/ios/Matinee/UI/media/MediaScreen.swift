import MatineeCore
import SwiftUI

/*
 * MediaScreen.kt: the Media tab, every library as a card. Search has a tab
 * of its own, and favorites are on the profile.
 */

/// The Media tab: every library as a card, which opens the library.
struct MediaScreen: View {
  @State private var libraries = Loader<[Library]>()

  var body: some View {
    Group {
      switch libraries.state {
      case .loading: LoadingBox()
      case .failed(let message, let disconnected):
        ErrorBox(Str.homeLoadFailed, message, disconnected: disconnected, onRetry: libraries.reload)
      case .ready(let list):
        ScrollView {
          if list.isEmpty { NoLibrariesNote() }
          CardGrid(minimum: 160) {
            ForEach(list, id: \.id) { library in LibraryCard(library: library) }
          }
          .padding(.top, 8)
          .padding(.bottom, 24)
        }
        .scrollsToTopOnReselect()
        .refreshable {
          libraries.reload()
          await libraries.settled()
        }
      }
    }
    // Still showing the libraries from before, while the server can't be reached.
    .topBar(Str.tabMedia) { DisconnectedAction(libraries) }
    .loads(libraries) { api in try await api.libraries.list() }
  }
}

/// A library as the backdrop the server picked for it today, with its name
/// across it, as Jellyfin shows one, and how many titles it holds below.
private struct LibraryCard: View {
  let library: Library
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette

  var body: some View {
    let art = api?.art(library.backdrop, size: .medium)
    Button { nav.library(library.id, nil) } label: {
      VStack(alignment: .leading, spacing: 8) {
        ArtFrame(library.name, aspect: 16 / 9) {
          if let art {
            Picture(art)
            Color.black.opacity(0.35)
          } else {
            LucideIcon(library.kind == "shows" ? .tv : .film, size: 28, tint: palette.muted)
              .padding(12)
              .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
          }
          // Big enough to read across the room, over the backdrop.
          Text(library.name)
            .textStyle(.headlineSmall, weight: .bold)
            .foregroundStyle(.white)
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .shadow(color: .black.opacity(0.6), radius: 4)
            .padding(.horizontal, 12)
        }
        Text(Str.browseTitleCount(library.titleCount))
          .textStyle(.bodySmall)
          .foregroundStyle(palette.muted)
          .lineLimit(1)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(CardPress())
    .hoverEffect(.highlight)
    .accessibilityElement(children: .combine)
  }
}
