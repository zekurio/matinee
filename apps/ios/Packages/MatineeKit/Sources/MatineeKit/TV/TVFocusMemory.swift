#if os(tvOS)
  import SwiftUI

  /// Where focus was on a page, kept while the page is on the navigation
  /// stack: the row and card that had it last, and the card each row had
  /// last. A row that focus comes back to by Up or Down lands on its own
  /// card, as Apple TV's rows do and Android TV's `TvFocusMemory` does, and
  /// a page coming back, or the drawer handing focus back, focuses the card
  /// that had it.
  ///
  /// A page owns one, `@State private var memory = TVFocusMemory()`, and
  /// gives it to its `TVRow`s and `TVPosterGrid`, which remember their cards
  /// by the keys they're given. Call `restore(fallback:)` to put focus back,
  /// as the page appears and when the drawer closes.
  @MainActor @Observable
  public final class TVFocusMemory {
    /// The row that had focus last, and the card in it.
    public private(set) var lastRow: String?
    public private(set) var lastItem: String?
    private var rowItems: [String: String] = [:]
    /// Where `restore` starts when nothing has had focus yet.
    private var start: (row: String, item: String)?
    /// Focus asked for in code, which the row with that key carries out.
    private(set) var request: Request?
    private var requests = 0

    struct Request: Equatable {
      let row: String
      let item: String
      let serial: Int
    }

    public init() {}

    /// The card `row` had last, if it had one.
    public func item(in row: String) -> String? { rowItems[row] }

    /// Notes that `item` in `row` took focus. Rows call it themselves.
    public func remember(row: String, item: String) {
      if lastRow != row { lastRow = row }
      if lastItem != item { lastItem = item }
      rowItems[row] = item
    }

    /// Where focus lands the first time it comes into `row`, rather than on
    /// its first card, as a season's row starts on the episode up next.
    /// Nothing once the row has had a card; it doesn't move focus.
    public func prefer(row: String, item: String) {
      if rowItems[row] == nil { rowItems[row] = item }
    }

    /// Puts focus on the card that had it last, or on `fallback` if none
    /// has yet, once its row is on screen. The fallback is kept, so a later
    /// `restore()`, as the drawer's, starts there too.
    public func restore(fallback: (row: String, item: String)? = nil) {
      if let fallback { start = fallback }
      guard let target = lastRow.flatMap({ row in lastItem.map { (row, $0) } }) ?? start else { return }
      focus(row: target.0, item: target.1)
    }

    /// Puts focus on `item` in `row`.
    public func focus(row: String, item: String) {
      requests += 1
      request = Request(row: row, item: item, serial: requests)
    }

    /// Whether focus asked for in code is on its way to `row`, which then
    /// shouldn't be sent to the card it had last.
    func isRequested(row: String) -> Bool { request?.row == row || pending == row }

    /// The row carried `request` out, so a row laid out again later doesn't.
    func consume(_ done: Request) {
      if request == done {
        request = nil
        pending = done.row
        DispatchQueue.main.async { if self.pending == done.row { self.pending = nil } }
      }
    }

    /// A request carried out this frame, whose focus change is still to come.
    private var pending: String?
  }

  extension View {
    /// Makes this a row of focus memory: a focus section that focus coming
    /// in lands on the card it left. `focused` is the row's own focus state,
    /// each card `.focused($focused, equals: key)`; `first` is where focus
    /// lands the first time. `TVRow` and `TVPosterGrid` do this themselves;
    /// it's for a row of something else, like a season's episodes.
    public func tvFocusRow(
      _ key: String, memory: TVFocusMemory, focused: FocusState<String?>.Binding, first: String?
    ) -> some View {
      modifier(FocusRow(key: key, memory: memory, focused: focused, first: first))
    }
  }

  private struct FocusRow: ViewModifier {
    let key: String
    let memory: TVFocusMemory
    let focused: FocusState<String?>.Binding
    let first: String?

    func body(content: Content) -> some View {
      content
        .focusSection()
        .defaultFocus(focused, memory.item(in: key) ?? first, priority: .userInitiated)
        .onChange(of: focused.wrappedValue) { old, item in
          guard let item else { return }
          // Focus coming into the row from outside lands where the focus
          // engine finds nearest; send it on to the card the row had last,
          // which defaultFocus alone doesn't do for a move between sections.
          if old == nil, let last = memory.item(in: key), last != item, !memory.isRequested(row: key) {
            focused.wrappedValue = last
            return
          }
          memory.remember(row: key, item: item)
        }
        .onChange(of: memory.request, initial: true) { _, request in
          guard let request, request.row == key else { return }
          memory.consume(request)
          // Once the card is laid out, a frame on, it can take focus. A page
          // still settling its first focus, as the app starts, can send it to
          // the top left, into the drawer, so for a moment focus that left
          // the row for no other row is brought back.
          let start = Date.now
          for delay in [0.0, 0.15, 0.4, 0.8, 1.2] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
              // Not once another row has had focus, or another request came.
              guard memory.request == nil, memory.lastRow == nil || memory.lastRow == key,
                Date.now.timeIntervalSince(start) < 1.5
              else { return }
              if focused.wrappedValue == nil { focused.wrappedValue = request.item }
            }
          }
        }
    }
  }
#endif
