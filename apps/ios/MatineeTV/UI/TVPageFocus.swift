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
 *
 * Only the page on top of the stack takes it. Whether a page is on screen
 * comes from two places, and both must say so: its own appear and
 * disappear, and where it sits on the stack (`\.tvPageOnTop`, from
 * `.tvStackPage`). The first alone isn't enough: a stack that starts with
 * a page on it, as `-dev.route` or a deep link opens one at launch, shows
 * Home for a moment and covers it without a transition, and SwiftUI never
 * tells Home it disappeared.
 */

extension EnvironmentValues {
  /// Whether the page is the one on top of the TV's stack. Screens off the
  /// stack, as those before sign-in, are always on top.
  @Entry var tvPageOnTop = true
}

extension View {
  /// Marks a page of `nav`'s stack: on top while `route` is the last on
  /// the stack, or, for Home (`route` nil), while the stack is empty. Read
  /// here rather than in the shell, so a push redraws only the pages.
  func tvStackPage(_ nav: TVNav, route: TVRoute?) -> some View {
    modifier(StackPage(nav: nav, route: route))
  }
}

private struct StackPage: ViewModifier {
  let nav: TVNav
  let route: TVRoute?

  func body(content: Content) -> some View {
    content.environment(\.tvPageOnTop, route.map { nav.path.last == $0 } ?? nav.path.isEmpty)
  }
}

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
///
/// On screen is both: appeared and not since disappeared, and on top of the
/// stack. Each is kept in state, so a claim a moment later reads it as it
/// is then. A page that comes back on top without appearing again, as Home
/// does when the page it never saw go over it goes, claims then.
private struct OnScreen: ViewModifier {
  let claim: () -> Void
  @Binding var appeared: Bool
  @Binding var top: Bool
  @Environment(\.tvPageReturn) private var returns
  @Environment(\.tvPageOnTop) private var onTop

  func body(content: Content) -> some View {
    content
      .onAppear {
        appeared = true
        top = onTop
        claim()
      }
      .onDisappear { appeared = false }
      .onChange(of: onTop) { _, now in
        top = now
        if now, appeared { claim() }
      }
      .onChange(of: returns?.count) { if appeared, top { claim() } }
  }
}

private struct ClaimsFocus: ViewModifier {
  let focused: FocusState<Bool>.Binding
  @State private var appeared = false
  @State private var top = true

  func body(content: Content) -> some View {
    content.modifier(OnScreen(claim: claim, appeared: $appeared, top: $top))
  }

  private func claim() {
    // A pushed page is laid out a frame later; a page settling as the app starts can lose it once.
    for delay in [0.0, 0.15, 0.4] {
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
        if appeared, top, !focused.wrappedValue { focused.wrappedValue = true }
      }
    }
  }
}

private struct ClaimsValueFocus<Value: Hashable>: ViewModifier {
  let focused: FocusState<Value?>.Binding
  let value: Value
  @State private var appeared = false
  @State private var top = true

  func body(content: Content) -> some View {
    content.modifier(OnScreen(claim: claim, appeared: $appeared, top: $top))
  }

  private func claim() {
    for delay in [0.0, 0.15, 0.4] {
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
        // Not over a choice the person already moved to.
        if appeared, top, focused.wrappedValue == nil { focused.wrappedValue = value }
      }
    }
  }
}

private struct RestoresFocus: ViewModifier {
  let memory: TVFocusMemory
  let fallback: () -> (row: String, item: String)?
  @State private var appeared = false
  @State private var top = true

  func body(content: Content) -> some View {
    content.modifier(OnScreen(claim: claim, appeared: $appeared, top: $top))
  }

  private func claim() {
    if top { memory.restore(fallback: fallback()) }
  }
}
