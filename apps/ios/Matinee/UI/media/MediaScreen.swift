import MatineeCore
import MatineeKit
import SwiftUI

/*
 * MediaScreen.kt, after the web's media.tsx: the Media tab, every library
 * as a card, which opens the library. Search has a tab of its own, and
 * favorites are on the profile, as on Android. A tab's first page: on a
 * phone the bar names it, as Android's; on an iPad, under the tabs, it's
 * the web's page heading.
 */

/// The Media tab: every library as a card, which opens the library.
struct MediaScreen: View {
  @State private var libraries = Loader<[Library]>()
  @Environment(\.shellStyle) private var style

  var body: some View {
    Group {
      if style == .tablet {
        page.hidesSystemNavigationBar()
      } else {
        // Still showing the libraries from before, while the server can't be reached: the cloud, in the bar.
        page.topBar(Str.tabMedia, leading: .none) { DisconnectedAction(libraries).padding(.trailing, Space.s2) }
      }
    }
    .loads(libraries) { api in try await api.libraries.list() }
  }

  @ViewBuilder private var page: some View {
    switch libraries.state {
    case .loading:
      // A spinner, as Android's; on an iPad under the page's heading.
      VStack(spacing: 0) {
        heading
        LoadingBox()
      }
    case .failed(let message, let disconnected):
      ErrorBox(Str.homeLoadFailed, message, disconnected: disconnected, onRetry: libraries.reload)
    case .ready(let list):
      ScrollView {
        heading
        if list.isEmpty {
          NoLibrariesNote()
        } else {
          LibraryGrid { ForEach(list, id: \.id) { library in LibraryCard(library: library) } }
        }
      }
      .scrollsToTopOnReselect()
      .refreshable {
        libraries.reload()
        await libraries.settled()
      }
    }
  }

  /// The page's name on an iPad, where no bar carries it: the web's heading.
  @ViewBuilder private var heading: some View {
    if style == .tablet {
      PageHeading(Str.tabMedia) { DisconnectedAction(libraries) }
    } else {
      Color.clear.frame(height: Space.s2)
    }
  }
}

/// Library cards as wide as fit at 160 or more on a phone, 288 from the
/// web's `sm` up, as its `libraryGrid`; a whole row each at the largest
/// text sizes, where a name over the art needs the width.
private struct LibraryGrid<Content: View>: View {
  @ViewBuilder let content: () -> Content
  @Environment(\.windowSize) private var window
  @Environment(\.gutter) private var gutter
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    let wide = window.width >= 640
    let minimum: CGFloat = typeSize.isAccessibilitySize ? 280 : wide ? 288 : 160
    LazyVGrid(
      columns: [GridItem(.adaptive(minimum: minimum), spacing: wide ? Space.s6 : Space.s4, alignment: .top)],
      alignment: .leading, spacing: wide ? Space.s8 : Space.s5, content: content
    )
    .padding(.horizontal, gutter)
    .padding(.bottom, Space.s6)
  }
}

/// A library as the backdrop the server picked for it today, with its name
/// across it, as Jellyfin shows one, and how many titles it holds below.
private struct LibraryCard: View {
  let library: Library
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette
  @Environment(\.windowSize) private var window
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    let art = api?.art(library.backdrop, size: .medium)
    // Android's `headlineSmall` in a phone's two columns, the web's `text-2xl` with room.
    let roomy = window.width >= 640 || typeSize.isAccessibilitySize
    let icon: CGFloat = roomy ? 28 : 20
    let inset = roomy ? Space.s3 : Space.s2_5
    Pressable(shape: .kit(Radius.md), action: { nav.library(library.id, nil) }) {
      VStack(alignment: .leading, spacing: Space.s2) {
        ArtFrame(library.id, aspect: 16 / 9) {
          if let art {
            Picture(art)
            Color.black.opacity(0.35)
          } else {
            LucideIcon(library.kind == LibraryKind.shows ? .tv : .film, size: icon, tint: palette.mutedForeground)
              .padding(inset)
              .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
          }
          // Big enough to read across the room: white over the backdrop, as the web's; the
          // theme's text over the tone in its place, which here follows the theme, kept clear
          // of the icon in the corner.
          Text(library.name)
            .textStyle(roomy ? .xl2 : .px22, weight: .bold, tracking: .tight)
            .foregroundStyle(art != nil ? .white : palette.foreground.opacity(0.85))
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .keepsWordsWhole(library.name, roomy ? .xl2 : .px22, weight: .bold, tracking: .tight, alignment: .center)
            .shadow(color: .black.opacity(art != nil ? 0.6 : 0), radius: 6, y: 1)
            .padding(.horizontal, art != nil ? Space.s3 : icon + inset + Space.s1)
        }
        Text(Str.browseTitleCount(library.titleCount))
          .textStyle(.px13)
          .foregroundStyle(palette.mutedForeground)
          .lineLimit(1)
      }
      .contentShape(Rectangle())
    }
    .accessibilityElement(children: .combine)
  }
}
