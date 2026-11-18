import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Grid.kt: posters in as many columns as fit, a page at a time from the
 * server, for a library's page and a genre's or studio's. `TitlePages`,
 * the paging itself, is MatineeCore's (Browse/), where it's tested.
 */

/// Posters in as many columns as fit, two on a phone, with `header` across
/// the top: Android's `PosterGrid`. Loads the next page when the end comes
/// near, and the loaded ones again on a pull. `header` spans the page and
/// lays out its own margins, as a row of chips runs to the edge.
struct PosterGrid<Header: View, Empty: View>: View {
  let pages: TitlePages
  let detail: (TitleSummary) -> String?
  @ViewBuilder let empty: () -> Empty
  @ViewBuilder let header: () -> Header
  @State private var nearEnd = false
  @Environment(\.palette) private var palette
  @Environment(\.homeAction) private var homeAction

  init(
    _ pages: TitlePages, detail: @escaping (TitleSummary) -> String?, @ViewBuilder empty: @escaping () -> Empty,
    @ViewBuilder header: @escaping () -> Header
  ) {
    self.pages = pages
    self.detail = detail
    self.empty = empty
    self.header = header
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        header()
        if pages.firstLoading {
          PosterGridSkeleton()
        } else {
          CardGrid {
            ForEach(pages.items, id: \.id) { title in PosterCard(title, detail: detail(title)) }
          }
        }
        footer
      }
      .padding(.top, Space.s2)
      .padding(.bottom, Space.s8)
    }
    .onScrollGeometryChange(for: Bool.self) { geometry in
      scrolledNearEnd(
        offset: geometry.contentOffset.y + geometry.contentInsets.top,
        visible: geometry.containerSize.height,
        content: geometry.contentSize.height)
    } action: { _, near in nearEnd = near }
    .onChange(of: nearEnd) { more() }
    .onChange(of: pages.items.count) { more() }
    .refreshable { await pages.refresh() }
    .scrollDismissesKeyboard(.immediately)
  }

  private func more() {
    if nearEnd, pages.error == nil { pages.more() }
  }

  @ViewBuilder private var footer: some View {
    if let error = pages.error {
      if pages.items.isEmpty {
        ErrorState(
          Str.gridLoadFailed, describeFailure(error), disconnected: error.isDisconnect, onRetry: pages.more,
          onHome: homeAction
        )
        .frame(maxWidth: .infinity)
        .padding(.vertical, Space.s12)
      } else {
        // Android stops here quietly; a way on is kinder than a list that just ends.
        ErrorSection(Str.gridMoreFailed, disconnected: error.isDisconnect, onRetry: pages.more)
      }
    } else if pages.loading, !pages.items.isEmpty {
      Spinner(size: 32, tint: palette.accent)
        .frame(maxWidth: .infinity)
        .padding(Space.s6)
        .accessibilityLabel(Str.loadingInProgress)
    } else if pages.done, pages.items.isEmpty {
      empty()
    }
  }
}

/// A grid's posters while the first page loads: blank cards with a bar for
/// the name and one for the year, as the web's `PosterGridSkeleton`.
struct PosterGridSkeleton: View {
  var count = 12

  var body: some View {
    CardGrid {
      ForEach(0..<count, id: \.self) { _ in
        VStack(alignment: .leading, spacing: 0) {
          Skeleton(radius: Radius.md).aspectRatio(2 / 3, contentMode: .fit)
          Skeleton(radius: Radius.sm).frame(height: 14).padding(.trailing, Space.s10).padding(.top, Space.s2_5)
          Skeleton(radius: Radius.sm).frame(width: 40, height: 12).padding(.top, Space.s2)
        }
      }
    }
    .accessibilityElement()
    .accessibilityLabel(Str.loadingInProgress)
  }
}

/// Why a grid has nothing in it, as the web's `EmptyList`: an icon, what
/// happened, and a way to take back what caused it.
struct GridEmpty: View {
  let icon: Lucide
  let title: String
  var action: (label: String, run: () -> Void)?

  var body: some View {
    EmptyState(icon: icon, title: title) {
      if let action { MatineeButton(action.label, look: .outline, size: .md, action: action.run) }
    }
    .padding(.vertical, Space.s10)
  }
}
