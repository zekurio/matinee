import MatineeCore
import SwiftUI

/*
 * Grid.kt: posters in as many columns as fit, a page at a time from the
 * server, for a library's page and a genre's or studio's. `TitlePages`,
 * the paging itself, is MatineeCore's (Browse/), where it's tested.
 */

/// A page's `TitlePages`, a page the size Android asks for, or in debug
/// builds the `-dev.pageSize` launch argument's, so paging shows on the
/// dev server's small libraries; `-dev.pageDelay` slows each page.
func makeTitlePages() -> TitlePages {
  #if DEBUG
    let asked = UserDefaults.standard.integer(forKey: "dev.pageSize")
    if asked > 0 { return TitlePages(pageSize: asked) }
  #endif
  return TitlePages()
}

extension View {
  /// Loads `pages` from the server for this screen, once it shows, as
  /// Android's `rememberTitlePages`: `key` names the list, and another key
  /// starts it again from the top. Marks changed elsewhere fetch what's
  /// loaded again in place, so the grid keeps its place.
  func pages(
    _ pages: TitlePages, key: String,
    fetch: @escaping @Sendable (_ api: MatineeApi, _ offset: Int, _ limit: Int) async throws -> TitleList
  ) -> some View {
    modifier(LoadsPages(pages: pages, key: key, fetch: fetch))
  }
}

private struct LoadsPages: ViewModifier {
  let pages: TitlePages
  let key: String
  let fetch: @Sendable (MatineeApi, Int, Int) async throws -> TitleList
  @Environment(\.api) private var api
  @Environment(ViewerState.self) private var viewer: ViewerState?

  func body(content: Content) -> some View {
    content
      .onAppear(perform: configure)
      .onChange(of: key, configure)
      .onChange(of: viewer?.version) { Task { await pages.refresh() } }
  }

  private func configure() {
    guard let api else { return }
    let fetch = fetch
    #if DEBUG
      // `-dev.pageDelay` (milliseconds) slows each page, to see the skeleton and the next page's spinner.
      let delay = UserDefaults.standard.integer(forKey: "dev.pageDelay")
      if delay > 0 {
        pages.configure(key: key) { offset, limit in
          try await Task.sleep(for: .milliseconds(delay))
          return try await fetch(api, offset, limit)
        }
        return
      }
    #endif
    pages.configure(key: key) { offset, limit in try await fetch(api, offset, limit) }
  }
}

/// Posters in as many columns as fit, two on a phone, with `header` across
/// the top: Android's `PosterGrid`. Loads the next page when the end comes
/// near, and the loaded ones again on a pull.
struct PosterGrid<Header: View, Empty: View>: View {
  let pages: TitlePages
  let detail: (TitleSummary) -> String?
  @ViewBuilder let empty: () -> Empty
  @ViewBuilder let header: () -> Header
  @State private var nearEnd = false
  @Environment(\.palette) private var palette

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
        header().padding(.horizontal, Gutter)
        if pages.firstLoading {
          PosterGridSkeleton()
        } else {
          CardGrid {
            ForEach(pages.items, id: \.id) { title in PosterCard(title, detail: detail(title)) }
          }
        }
        footer
      }
      .padding(.top, 8)
      .padding(.bottom, 32)
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
        ErrorBox(describeFailure(error), disconnected: error.isDisconnect, onRetry: pages.more)
          .padding(.top, 16)
      } else {
        // Android stops here quietly; a way on is kinder than a list that just ends.
        Notice(describeFailure(error), disconnected: error.isDisconnect, onRetry: pages.more).padding(.top, 20)
      }
    } else if pages.loading, !pages.items.isEmpty {
      ProgressView()
        .tint(palette.accent)
        .frame(maxWidth: .infinity)
        .padding(24)
        .accessibilityLabel(Str.loadingInProgress)
    } else if pages.done, pages.items.isEmpty {
      empty().padding(.horizontal, Gutter)
    }
  }
}

extension PosterGrid where Header == EmptyView {
  init(
    _ pages: TitlePages, detail: @escaping (TitleSummary) -> String?, @ViewBuilder empty: @escaping () -> Empty
  ) {
    self.init(pages, detail: detail, empty: empty) { EmptyView() }
  }
}

/// A grid's posters while the first page loads: blank cards with a bar for
/// the name and one for the year, as the web's `PosterGridSkeleton`.
struct PosterGridSkeleton: View {
  var count = 12
  @Environment(\.palette) private var palette

  var body: some View {
    let small = RoundedRectangle(cornerRadius: 4, style: .continuous)
    CardGrid {
      ForEach(0..<count, id: \.self) { _ in
        VStack(alignment: .leading, spacing: 0) {
          CardShape.fill(palette.card).aspectRatio(2 / 3, contentMode: .fit)
            .overlay { CardShape.strokeBorder(palette.border) }
          small.fill(palette.secondary).frame(height: 14).padding(.trailing, 40).padding(.top, 10)
          small.fill(palette.secondary).frame(width: 40, height: 12).padding(.top, 6)
        }
      }
    }
    .accessibilityElement()
    .accessibilityLabel(Str.loadingInProgress)
  }
}

/// A grid's line under its header, saying why there's nothing in it.
struct GridEmpty: View {
  let text: String
  @Environment(\.palette) private var palette

  init(_ text: String) { self.text = text }

  var body: some View {
    Text(text).textStyle(.bodyMedium).foregroundStyle(palette.muted).padding(.vertical, 48)
  }
}
