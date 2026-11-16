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
      ScrollView {
        heading
        LibraryGrid { ForEach(0..<4, id: \.self) { _ in LibraryCardSkeleton() } }
      }
      .scrollDisabled(true)
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
        // TODO(requests): the ways into the catalog, Browse movies and Browse shows (Android's
        // `nav.catalogBrowse(kind)`, the web's discover.movies and discover.shows), under the libraries.
        // Nothing renders here until the requests pages exist.
        MediaCatalogSlot()
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

/// Where the catalog's ways in go, for the requests pages to fill. Empty today.
private struct MediaCatalogSlot: View {
  var body: some View { EmptyView() }
}

/// A tab's first page's name on an iPad, as the web's `PageHeader` from `sm`
/// up: `text-26px md:text-32px font-semibold tracking-tight`, with what the
/// page can do at its end.
struct PageHeading<Actions: View>: View {
  let title: String
  @ViewBuilder let actions: () -> Actions
  @Environment(\.palette) private var palette
  @Environment(\.gutter) private var gutter
  @Environment(\.windowSize) private var window

  init(_ title: String, @ViewBuilder actions: @escaping () -> Actions) {
    self.title = title
    self.actions = actions
  }

  var body: some View {
    HStack(alignment: .center, spacing: Space.s4) {
      Text(title)
        .textStyle(window.width >= 768 ? .px32 : .px26, weight: .semibold, tracking: .tight)
        .foregroundStyle(palette.foreground)
        .lineLimit(2)
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 0)
      actions()
    }
    .padding(.horizontal, gutter)
    .padding(.top, Space.s4)
    .padding(.bottom, window.width >= 768 ? Space.s6 : Space.s4)
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
    // A phone's two columns are narrow for the web's `text-2xl` beside the kind's icon.
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
            .textStyle(roomy ? .xl2 : .xl, weight: .bold, tracking: .tight)
            .foregroundStyle(art != nil ? .white : palette.foreground.opacity(0.85))
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .keepsWordsWhole(library.name, roomy ? .xl2 : .xl, weight: .bold, tracking: .tight, alignment: .center)
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

/// A library card while the libraries load, as the web's skeleton.
private struct LibraryCardSkeleton: View {
  var body: some View {
    VStack(alignment: .leading, spacing: Space.s2_5) {
      Skeleton(radius: Radius.md).aspectRatio(16 / 9, contentMode: .fit)
      Skeleton(radius: Radius.sm).frame(width: 64, height: 12)
    }
    .accessibilityHidden(true)
  }
}
