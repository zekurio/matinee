import MatineeCore
import SwiftUI

/// Where cards and bars send the person, as Android's `LocalNavigator`:
/// cards say what was tapped and the shell, which owns the navigation
/// stack, decides how it opens. Every action does nothing until the shell
/// fills it in, so a component works on its own, in the gallery or a preview.
///
///     @Environment(\.navigator) private var nav
///     Button { nav.title(title) } label: { … }
///
/// Back stays SwiftUI's: `@Environment(\.dismiss)`, and the edge swipe.
struct Navigator {
  /// A file's page: an episode's, or for a movie, the movie's.
  var item: (MediaItem) -> Void = { _ in }
  /// A movie's or show's page.
  var title: (TitleSummary) -> Void = { _ in }
  /// A title's page by id, from inside one of its own pages, so it doesn't stack twice.
  var titleUp: (String) -> Void = { _ in }
  var episode: (String) -> Void = { _ in }
  /// A show's season, by the title's id and the season's number (nil for files without one).
  var season: (String, Int?) -> Void = { _, _ in }
  var person: (String) -> Void = { _ in }
  /// Play a file, from where the person left off, or from `start` seconds.
  var play: (_ itemId: String, _ start: Double?) -> Void = { _, _ in }
  /// Back to the first page of Home.
  var home: () -> Void = {}
}

extension EnvironmentValues {
  @Entry var navigator = Navigator()
}
