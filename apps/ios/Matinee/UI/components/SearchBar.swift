import MatineeCore
import MatineeKit
import SwiftUI

/*
 * SearchBar.kt: the search field's pill, at the top of the search page and
 * of a library being searched. The field itself is the kit's, in its pill
 * look.
 */

/// The search pill with its field: the search icon, the query, and a button
/// to clear it once there's one. `focused` follows and moves the keyboard.
/// SwiftUI's `.onSubmit` and `.submitLabel` reach the field.
struct SearchField: View {
  @Binding var query: String
  var placeholder: String = Str.searchField
  var focused: Binding<Bool>?

  init(_ query: Binding<String>, placeholder: String = Str.searchField, focused: Binding<Bool>? = nil) {
    self._query = query
    self.placeholder = placeholder
    self.focused = focused
  }

  var body: some View {
    MatineeTextField(placeholder, text: $query, kind: .search, focused: focused, look: .pill)
      .submitLabel(.search)
      .autocorrectionDisabled()
  }
}

/// The search pill as a button, where a page leads to search rather than
/// holding the field: the icon and the placeholder, opening `action`.
struct SearchBarButton: View {
  var placeholder: String = Str.searchField
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Pressable(shape: Capsule(), action: action) {
      HStack(spacing: Space.s3) {
        LucideIcon(.search, size: 20, tint: palette.mutedForeground)
        Text(placeholder).textStyle(.base).foregroundStyle(palette.mutedForeground).lineLimit(1)
        Spacer(minLength: 0)
      }
      .padding(.horizontal, Space.s4)
      .frame(maxWidth: .infinity, minHeight: 48)
      .background(palette.foreground.opacity(0.06), in: Capsule())
      .overlay { Capsule().strokeBorder(palette.foreground.opacity(0.12)) }
    }
    .accessibilityLabel(placeholder)
    .accessibilityAddTraits(.isSearchField)
  }
}
