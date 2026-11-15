import SwiftUI

/// The search field's pill on the search page: full width, with room for a
/// button at each end. `SearchField` fills it the usual way; a page that
/// lays it out itself, as Android's search page does, gives it its content.
struct SearchBarFrame<Content: View>: View {
  var action: (() -> Void)?
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette

  init(action: (() -> Void)? = nil, @ViewBuilder content: @escaping () -> Content) {
    self.action = action
    self.content = content
  }

  var body: some View {
    let pill = HStack(spacing: 0) { content() }
      .padding(.horizontal, 4)
      .frame(maxWidth: .infinity, minHeight: 48)
      .background(palette.foreground.opacity(0.06), in: Capsule())
      .overlay { Capsule().strokeBorder(palette.foreground.opacity(0.12)) }
    if let action {
      Button(action: action) { pill.contentShape(Capsule()) }.buttonStyle(CardPress())
    } else {
      pill
    }
  }
}

/// The search pill with its field: the search icon, the query, and a
/// button to clear it once there's one.
struct SearchField: View {
  @Binding var query: String
  var placeholder: String = Str.searchField
  var focused: FocusState<Bool>.Binding?
  @Environment(\.palette) private var palette

  init(_ query: Binding<String>, placeholder: String = Str.searchField, focused: FocusState<Bool>.Binding? = nil) {
    self._query = query
    self.placeholder = placeholder
    self.focused = focused
  }

  var body: some View {
    SearchBarFrame {
      LucideIcon(.search, size: 20, tint: palette.muted).frame(width: 40, height: 40)
      field
        .textStyle(.bodyLarge)
        .foregroundStyle(palette.foreground)
        .tint(palette.accent)
        .submitLabel(.search)
        .autocorrectionDisabled()
        .frame(maxWidth: .infinity)
      if !query.isEmpty {
        RoundIconButton(.x, label: Str.searchClear, size: 32, iconSize: 18, tint: palette.muted, background: .clear) {
          query = ""
        }
      }
    }
  }

  @ViewBuilder private var field: some View {
    let text = TextField("", text: $query, prompt: Text(placeholder).foregroundStyle(palette.faint))
    if let focused { text.focused(focused) } else { text }
  }
}
