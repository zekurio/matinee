import MatineeKit
import SwiftUI

/*
 * First focus on a browsing page with a search field as well as rows or a
 * grid: `.tvPageFocus(memory)` for the cards, with the field as one more
 * place focus can be left and come back to. The kit's `TVSearchField`
 * binds its focus as a `Bool`, so the field stands in the page's
 * `TVFocusMemory` as a row of its own that this carries out itself.
 */

/// The search field's place in a page's focus memory.
enum SearchFieldFocus {
  static let row = "field"
}

extension View {
  /// Puts focus back where it was as the page appears and each time the
  /// drawer hands focus back: on the search field when it had it last, or
  /// the first time when `fallback` is nil and `startOnField`; otherwise on
  /// the card `memory` had last, or on `fallback` the first time.
  /// `fallback` is read each time, and focus goes to it once it's known,
  /// so a page still loading its first cards takes focus when they come.
  func tvBrowseFocus(
    _ memory: TVFocusMemory, field: FocusState<Bool>.Binding, startOnField: Bool = false,
    fallback: @escaping () -> (row: String, item: String)?
  ) -> some View {
    modifier(BrowseFocus(memory: memory, field: field, startOnField: startOnField, fallback: fallback))
  }
}

private struct BrowseFocus: ViewModifier {
  let memory: TVFocusMemory
  let field: FocusState<Bool>.Binding
  let startOnField: Bool
  let fallback: () -> (row: String, item: String)?
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
      .onChange(of: field.wrappedValue) { _, on in
        if on { memory.remember(row: SearchFieldFocus.row, item: SearchFieldFocus.row) }
      }
      // The first cards came after the page appeared, with nothing focused on it yet.
      .onChange(of: fallback()?.item) { _, first in
        if onScreen, first != nil, memory.lastRow == nil, !startOnField { memory.restore(fallback: fallback()) }
      }
  }

  private func restore() {
    let last = memory.lastRow
    if last == SearchFieldFocus.row || (last == nil && startOnField) {
      // A pushed page is laid out a frame later, and later still on a busy TV; a page settling as
      // the app starts can lose it once. Not once focus has gone to a card on the page.
      for delay in [0.0, 0.15, 0.4, 0.8, 1.2] {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
          if onScreen, !field.wrappedValue, memory.lastRow == last { field.wrappedValue = true }
        }
      }
    } else {
      memory.restore(fallback: fallback())
    }
  }
}
