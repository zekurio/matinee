#if os(tvOS)
  import SwiftUI

  /// The TV's poster grid: Android TV's at two points a dp.
  public enum TVGrid {
    /// Columns across a page: posters a little narrower than a row's, so more show at once.
    public static let columns = 7
    public static let gap: CGFloat = 36
    public static let rowGap: CGFloat = 48
    /// The key `TVPosterGrid` keeps its cards under in a page's `TVFocusMemory`.
    public static let row = "grid"
    /// Where a grid page's header starts, under the top margin.
    public static let top: CGFloat = TVOverscan.vertical + 12
    /// Between the header and the line that names the focused card.
    public static let lineGap: CGFloat = 32
    /// Clear of the clock at the top right, for the line while the header is away.
    public static let clockRoom: CGFloat = 280
    /// How far down the grid's top edge fades in, as a share of its height.
    public static let fade: CGFloat = 0.07
  }

  /// Cards in columns across a TV page, under the page's `header`, with the
  /// `line` that names the focused card between, for grids whose cards have
  /// no caption. Left from the first column goes to the drawer.
  ///
  /// The header shows while focus is in the first row or above it and
  /// folds away when focus goes lower, so the grid has the screen; it comes
  /// back with the first row, as on Android TV. Each card is remembered in
  /// `memory` under `TVGrid.row` by `itemKey`, so coming back from a title,
  /// or down from the header, lands on the card it left. `onNearEnd` runs
  /// when focus is in the last three rows, to load the next page;
  /// `onHeaderChange` when the header folds away or comes back, as for the
  /// page to hide the clock while the grid has the top; `footer`
  /// goes after the cards, the width of the grid, for a spinner or a notice.
  ///
  ///     TVPosterGrid(titles, itemKey: \.id, memory: memory) { title in
  ///       TVPosterCard(title.name, url: title.poster, width: nil) { open(title) }
  ///     } header: { sortButtons } line: { TVFocusLine(focused) }
  public struct TVPosterGrid<Item, Card: View, Header: View, Line: View, Footer: View>: View {
    let items: [Item]
    let itemKey: (Item) -> String
    let memory: TVFocusMemory
    let columns: Int
    let onNearEnd: (() -> Void)?
    let onHeaderChange: ((Bool) -> Void)?
    @ViewBuilder let card: (Item) -> Card
    @ViewBuilder let header: () -> Header
    @ViewBuilder let line: () -> Line
    @ViewBuilder let footer: () -> Footer
    @FocusState private var focused: String?
    @State private var focusRow = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(
      _ items: [Item], itemKey: @escaping (Item) -> String, memory: TVFocusMemory, columns: Int = TVGrid.columns,
      onNearEnd: (() -> Void)? = nil, onHeaderChange: ((Bool) -> Void)? = nil,
      @ViewBuilder card: @escaping (Item) -> Card, @ViewBuilder header: @escaping () -> Header,
      @ViewBuilder line: @escaping () -> Line, @ViewBuilder footer: @escaping () -> Footer
    ) {
      self.items = items
      self.itemKey = itemKey
      self.memory = memory
      self.columns = columns
      self.onNearEnd = onNearEnd
      self.onHeaderChange = onHeaderChange
      self.card = card
      self.header = header
      self.line = line
      self.footer = footer
    }

    private static var top: String { "tv-grid-top" }

    public var body: some View {
      let keyed = items.map { Keyed(id: itemKey($0), item: $0) }
      let headerShown = focusRow < 1
      VStack(alignment: .leading, spacing: 0) {
        if headerShown {
          header()
            .padding(.top, TVGrid.top)
            .focusSection()
            .transition(.move(edge: .top).combined(with: .opacity))
        }
        line()
          .padding(.leading, TVPage.start)
          // Without the header, the line has the top to itself, clear of the clock.
          .padding(.trailing, headerShown ? TVPage.end : TVPage.end + TVGrid.clockRoom)
          .padding(.top, headerShown ? TVGrid.lineGap : TVGrid.top)
        ScrollViewReader { reader in
        ScrollView {
          Color.clear.frame(height: 0).id(Self.top)
          LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), spacing: TVGrid.gap, alignment: .top), count: columns),
            alignment: .leading, spacing: TVGrid.rowGap
          ) {
            ForEach(keyed) { entry in
              card(entry.item).focused($focused, equals: entry.id)
            }
          }
          .padding(.top, TVFocus.room)
          .padding(.horizontal, TVFocus.room)
          .padding(.trailing, TVPage.end)
          footer()
            .padding(.leading, TVFocus.room)
            .padding(.trailing, TVPage.end)
            .padding(.bottom, TVOverscan.vertical)
        }
        .scrollIndicators(.hidden)
        // A row scrolled half away under the line ends softly, not in a hard edge.
        .mask(
          LinearGradient(
            stops: [.init(color: .clear, location: 0), .init(color: .black, location: TVGrid.fade)], startPoint: .top,
            endPoint: .bottom))
        .padding(.leading, TVPage.start - TVFocus.room)
        .tvFocusRow(TVGrid.row, memory: memory, focused: $focused, first: keyed.first?.id)
        .onChange(of: headerShown) { _, shown in
          // Back in the first row, the grid is back at its top under the header, its room for the lift with it.
          if shown { withAnimation(Motion.move) { reader.scrollTo(Self.top, anchor: .top) } }
          onHeaderChange?(shown)
        }
        }
      }
      .animation(Motion.animation(headerShown ? Motion.enter : Motion.exit, reduceMotion: reduceMotion), value: headerShown)
      .onChange(of: focused) { _, key in
        // Focus gone to the header or the drawer keeps the row it left.
        guard let key, let index = keyed.firstIndex(where: { $0.id == key }) else { return }
        focusRow = index / max(columns, 1)
        if let onNearEnd, index >= keyed.count - columns * 3 { onNearEnd() }
      }
    }
  }

  extension TVPosterGrid where Footer == EmptyView {
    public init(
      _ items: [Item], itemKey: @escaping (Item) -> String, memory: TVFocusMemory, columns: Int = TVGrid.columns,
      onNearEnd: (() -> Void)? = nil, onHeaderChange: ((Bool) -> Void)? = nil,
      @ViewBuilder card: @escaping (Item) -> Card, @ViewBuilder header: @escaping () -> Header,
      @ViewBuilder line: @escaping () -> Line
    ) {
      self.init(
        items, itemKey: itemKey, memory: memory, columns: columns, onNearEnd: onNearEnd, onHeaderChange: onHeaderChange,
        card: card, header: header, line: line, footer: { EmptyView() })
    }
  }
#endif
