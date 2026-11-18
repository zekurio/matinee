import SwiftUI

/*
 * A hardware keyboard's shortcut for something a page does without a
 * control of its own on screen, such as ⌘F to search a page whose search
 * field sits behind an icon or is always there. The bars give their tabs
 * ⌘1, ⌘2, … on their own buttons; this is the same for the rest.
 */

extension View {
  /// Runs `action` on `key` with `modifiers`, ⌘ unless given, while the
  /// view is on screen. `label` is what a held ⌘ lists it as on an iPad.
  /// Draws nothing; on tvOS, which has no such keyboard, it does nothing.
  ///
  ///     .keyCommand("f", label: Str.searchTitle) { focused = true }
  public func keyCommand(
    _ key: KeyEquivalent, modifiers: EventModifiers = .command, label: String, action: @escaping () -> Void
  ) -> some View {
    modifier(KeyCommand(key: key, modifiers: modifiers, label: label, action: action))
  }
}

private struct KeyCommand: ViewModifier {
  let key: KeyEquivalent
  let modifiers: EventModifiers
  let label: String
  let action: () -> Void

  func body(content: Content) -> some View {
    #if os(iOS)
      content.background {
        // A shortcut needs a control to hang on; this one is never seen or read.
        Button(label, action: action)
          .keyboardShortcut(key, modifiers: modifiers)
          .hidden()
          .accessibilityHidden(true)
      }
    #else
      content
    #endif
  }
}
