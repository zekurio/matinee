import SwiftUI

/// A page that isn't built yet: its name, as its Android type has it, and
/// what its route gave it, with room below for what the shell needs of it
/// meanwhile. Each page's task replaces its stub's body; nothing else
/// depends on it, so this goes once the last page is in.
///
/// The name and the values are the page's identifiers, not words for the
/// person, so they don't go through `Str`.
struct Stub<Extra: View>: View {
  let name: String
  let details: [String]
  @ViewBuilder let extra: () -> Extra
  @Environment(\.palette) private var palette
  @Environment(\.offline) private var offline

  init(_ name: String, _ details: String?..., @ViewBuilder extra: @escaping () -> Extra) {
    self.name = name
    self.details = details.compactMap { $0 }
    self.extra = extra
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        VStack(alignment: .leading, spacing: 6) {
          Text(name).textStyle(.headlineSmall).foregroundStyle(palette.foreground)
          ForEach(details, id: \.self) { detail in
            Text(detail).textStyle(.bodyMedium).foregroundStyle(palette.muted)
          }
        }
        .padding(.horizontal, Gutter)
        extra()
        // Where the page's content will be, so a stub scrolls like a page.
        VStack(spacing: 12) {
          ForEach(0..<12, id: \.self) { _ in
            CardShape.fill(palette.card).frame(height: 64)
          }
        }
        .padding(.horizontal, Gutter)
        .accessibilityHidden(true)
      }
      .padding(.vertical, 16)
    }
    .scrollsToTopOnReselect()
    .background(palette.background)
    .accessibilityIdentifier("stub.\(name)")
    .topBar(name) {
      if offline { LucideIcon(.cloudOff, label: Str.downloadsOffline, size: 20, tint: palette.muted) }
    }
  }
}

extension Stub where Extra == EmptyView {
  init(_ name: String, _ details: String?...) {
    self.name = name
    self.details = details.compactMap { $0 }
    self.extra = { EmptyView() }
  }
}

/// What a stub shows of an optional value it was given.
func stubValue<T>(_ label: String, _ value: T?) -> String {
  "\(label): \(value.map { "\($0)" } ?? "nil")"
}
