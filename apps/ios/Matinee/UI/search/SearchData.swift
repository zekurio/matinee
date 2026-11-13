import MatineeCore
import SwiftUI

/*
 * SearchData.kt's `SearchEffect`: the search page's field, handed to its
 * `SearchState` (MatineeCore's Browse/SearchData.swift) at each change,
 * which waits for typing to pause and cancels the search still out.
 */

extension View {
  /// Searches for `query` once typing pauses, into `state`; `submitted`
  /// moving searches at once, as the keyboard's Search key asks.
  func searchEffect(_ state: SearchState, query: String, submitted: Int) -> some View {
    modifier(SearchEffect(state: state, query: query, submitted: submitted))
  }
}

private struct SearchEffect: ViewModifier {
  let state: SearchState
  let query: String
  let submitted: Int
  @Environment(\.api) private var api

  func body(content: Content) -> some View {
    content
      .onAppear { update(now: false) }
      .onChange(of: query) { update(now: false) }
      .onChange(of: submitted) { update(now: true) }
  }

  private func update(now: Bool) {
    guard let api else { return }
    state.update(query, now: now) { text in try await api.search.query(query: text, limit: SEARCH_LIMIT) }
  }
}
