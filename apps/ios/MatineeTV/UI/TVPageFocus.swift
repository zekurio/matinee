import MatineeKit
import SwiftUI

/*
 * First focus on a TV page. The focus engine starts at the top left, which
 * on a signed-in page is the drawer, and a page pushed while focus is in
 * the drawer doesn't take it by itself. So every page says where focus
 * goes as it appears and when the drawer hands focus back:
 *
 * - A page of rows or a grid keeps a `TVFocusMemory` and calls
 *   `.tvPageFocus(memory, fallback:)`: the card that had focus last, or the
 *   fallback the first time.
 * - Any other page binds its first control with `@FocusState` and calls
 *   `.tvPageFocus($focused)`.
 */

extension View {
  /// Puts focus on `focused`'s control as the page appears and each time
  /// the drawer hands focus back.
  func tvPageFocus(_ focused: FocusState<Bool>.Binding) -> some View {
    modifier(ClaimsFocus(focused: focused))
  }

  /// Puts focus on the control `focused` binds as `value`, as the screen
  /// appears and each time the drawer hands focus back: a screen whose
  /// controls are told apart by a value, like the screens before sign-in.
  /// A `defaultFocus` alone doesn't reach a screen that replaces one with
  /// nothing focusable, as the unreachable screen replaces Connecting.
  func tvPageFocus<Value: Hashable>(_ focused: FocusState<Value?>.Binding, on value: Value) -> some View {
    modifier(ClaimsValueFocus(focused: focused, value: value))
  }

  /// Puts focus back on the card `memory` had last, or on `fallback` the
  /// first time, as the page appears and each time the drawer hands focus
  /// back. `fallback` is read each time, so a page whose rows are still
  /// loading can give nil until it knows its first card.
  func tvPageFocus(_ memory: TVFocusMemory, fallback: @escaping () -> (row: String, item: String)?) -> some View {
    modifier(RestoresFocus(memory: memory, fallback: fallback))
  }
}

/// A page under another on the stack stays alive and keeps its modifiers,
/// so each one notes whether its page is on screen: a hand-back is for the
/// page on top only. A page beneath asking for focus sends it to the top
/// left, into the drawer, which hands it back again, without end.
private struct ClaimsFocus: ViewModifier {
  let focused: FocusState<Bool>.Binding
  @Environment(\.tvPageReturn) private var returns
  @State private var onScreen = false

  func body(content: Content) -> some View {
    content
      .onAppear {
        onScreen = true
        claim()
      }
      .onDisappear { onScreen = false }
      .onChange(of: returns?.count) { if onScreen { claim() } }
  }

  private func claim() {
    // A pushed page is laid out a frame later; a page settling as the app starts can lose it once.
    for delay in [0.0, 0.15, 0.4] {
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
        if onScreen, !focused.wrappedValue { focused.wrappedValue = true }
      }
    }
  }
}

private struct ClaimsValueFocus<Value: Hashable>: ViewModifier {
  let focused: FocusState<Value?>.Binding
  let value: Value
  @Environment(\.tvPageReturn) private var returns
  @State private var onScreen = false

  func body(content: Content) -> some View {
    content
      .onAppear {
        onScreen = true
        claim()
      }
      .onDisappear { onScreen = false }
      .onChange(of: returns?.count) { if onScreen { claim() } }
  }

  private func claim() {
    for delay in [0.0, 0.15, 0.4] {
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
        // Not over a choice the person already moved to.
        if onScreen, focused.wrappedValue == nil { focused.wrappedValue = value }
      }
    }
  }
}

private struct RestoresFocus: ViewModifier {
  let memory: TVFocusMemory
  let fallback: () -> (row: String, item: String)?
  @Environment(\.tvPageReturn) private var returns
  @State private var onScreen = false

  func body(content: Content) -> some View {
    content
      .onAppear {
        onScreen = true
        memory.restore(fallback: fallback())
      }
      .onDisappear { onScreen = false }
      .onChange(of: returns?.count) { if onScreen { memory.restore(fallback: fallback()) } }
  }
}
