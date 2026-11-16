import MatineeKit
import SwiftUI

/*
 * First focus on a browsing page: `.tvPageFocus(memory)` for its cards,
 * with two more places focus can start and come back to that aren't
 * cards: the search field, and a grid's sort button, where focus starts
 * when the grid has nothing to focus. Each binds its focus as a `Bool`,
 * so it stands in the page's `TVFocusMemory` as a row of its own that this
 * carries out itself. The header's controls aren't a focus row: one would
 * send Left from the search field to the control it remembers, not the
 * one beside it.
 */

/// Where a browsing page's focus starts.
enum BrowseFocusTarget: Equatable {
  /// A card, by its row and key in the page's focus memory.
  case card(row: String, item: String)
  /// The search field.
  case field
  /// The sort button, for a grid with nothing in it.
  case sort
}

/// The search field's and the sort button's places in a page's focus memory.
private enum BrowseFocusRow {
  static let field = "field"
  static let sort = "sort"
}

extension View {
  /// Puts focus back where it was as the page appears and each time the
  /// drawer hands focus back: on the search field or the sort button when
  /// one had it last, else on the card `memory` had last; the first time,
  /// on `start`. `start` is read each time and focus goes to it once it's
  /// known, so a page still loading its first cards takes focus when they
  /// come.
  func tvBrowseFocus(
    _ memory: TVFocusMemory, field: FocusState<Bool>.Binding? = nil, sort: FocusState<Bool>.Binding? = nil,
    start: @escaping () -> BrowseFocusTarget?
  ) -> some View {
    modifier(BrowseFocus(memory: memory, field: field, sort: sort, start: start))
  }
}

private struct BrowseFocus: ViewModifier {
  let memory: TVFocusMemory
  let field: FocusState<Bool>.Binding?
  let sort: FocusState<Bool>.Binding?
  let start: () -> BrowseFocusTarget?
  @Environment(\.tvPageReturn) private var returns
  @State private var onScreen = false

  func body(content: Content) -> some View {
    content
      .onAppear {
        onScreen = true
        restore()
      }
      .onDisappear { onScreen = false }
      .onChange(of: returns?.count) { if onScreen { restore() } }
      .onChange(of: field?.wrappedValue ?? false) { _, on in
        if on { memory.remember(row: BrowseFocusRow.field, item: BrowseFocusRow.field) }
      }
      .onChange(of: sort?.wrappedValue ?? false) { _, on in
        if on { memory.remember(row: BrowseFocusRow.sort, item: BrowseFocusRow.sort) }
      }
      // The first cards came after the page appeared, with nothing focused on it yet.
      .onChange(of: start()) { _, target in
        if onScreen, target != nil, memory.lastRow == nil { restore() }
      }
  }

  private func restore() {
    switch memory.lastRow {
    case BrowseFocusRow.field: claim(field)
    case BrowseFocusRow.sort: claim(sort)
    case nil:
      switch start() {
      case .field: claim(field)
      case .sort: claim(sort)
      case .card(let row, let item): memory.restore(fallback: (row, item))
      case nil: break
      }
    default:
      if case .card(let row, let item) = start() {
        memory.restore(fallback: (row, item))
      } else {
        memory.restore()
      }
    }
  }

  /// Focuses `control` once it's laid out: a frame after a page is pushed,
  /// later still on a busy TV, and again if a page settling as the app
  /// starts loses it. Not once focus has gone somewhere else on the page.
  private func claim(_ control: FocusState<Bool>.Binding?) {
    guard let control else { return }
    let last = memory.lastRow
    for delay in [0.0, 0.15, 0.4, 0.8, 1.2] {
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
        if onScreen, !control.wrappedValue, memory.lastRow == last { control.wrappedValue = true }
      }
    }
  }
}
