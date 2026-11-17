import MatineeCore
import MatineeKit
import SwiftUI

/// Where cards and bars send the person, as Android's `LocalNavigator`:
/// cards say what was tapped and the shell, which owns the navigation
/// stacks, decides how it opens. Every action does nothing until the shell
/// fills it in (Nav.swift), so a component works on its own, in the gallery
/// or a preview.
///
///     @Environment(\.navigator) private var nav
///     Button { nav.title(title) } label: { … }
///
/// A page opens on the stack of the tab it's in. Back is SwiftUI's too:
/// `@Environment(\.dismiss)`, the back button, and the edge swipe.
struct Navigator {
  /// Back to the page under this one.
  var back: () -> Void = {}
  /// Back to the first page of Home, from any tab.
  var home: () -> Void = {}
  /// A tab's first page; picking the open one starts it over. A place the
  /// layout has no tab for opens where it lives: on a phone, search is
  /// Media with its field taking the keyboard, and the profile a page on Home.
  var tab: (ShellTab) -> Void = { _ in }

  /// A file's page: an episode's, or for a movie, the movie's.
  var item: (MediaItem) -> Void = { _ in }
  /// A movie's or show's page.
  var titleId: (String) -> Void = { _ in }
  /// A title's page by id, from inside one of its own pages: back to it
  /// when it's what came before, so it doesn't stack twice.
  var titleUp: (String) -> Void = { _ in }
  /// A show's season, by the title's id and the season's number (nil for files without one).
  var season: (String, Int?) -> Void = { _, _ in }
  /// A season's page from one of its episodes, back to it when it came before.
  var seasonUp: (String, Int?) -> Void = { _, _ in }
  var episode: (String) -> Void = { _ in }
  /// A person's page, by name, and the provider's id when the credit has one, which tells two of one name apart.
  var person: (_ name: String, _ tmdbId: String?) -> Void = { _, _ in }
  var genre: (String) -> Void = { _ in }
  var studio: (String) -> Void = { _ in }
  /// A library's page, sorted by `sort` (a `TitleSort`), or as it was.
  var library: (_ id: String, _ sort: String?) -> Void = { _, _ in }
  var favorites: () -> Void = {}
  var recent: () -> Void = {}

  var settings: () -> Void = {}
  /// One of Settings' categories, by `SettingsPage.key`.
  var settingsPage: (String) -> Void = { _ in }
  var linkDevice: () -> Void = {}
  /// An admin adding a library, or with an id, changing one.
  var libraryEditor: (String?) -> Void = { _ in }
  /// The server's folders, opening at `start`, with `added` marked.
  var folderPicker: (_ start: String?, _ added: [String]) -> Void = { _, _ in }
  /// Back to the page under this one, leaving it `value` under `key`, as a
  /// picker hands back what it picked. The page under reads it from
  /// `NavResults`.
  var backWith: (_ key: String, _ value: String) -> Void = { _, _ in }
  var identify: (String) -> Void = { _ in }
  /// An admin's image editor for a title, a season, or an episode.
  var images: (ImageTarget) -> Void = { _ in }

  var downloadsShow: (String) -> Void = { _ in }

  /// Play a file, from where the person left off, or from `start` seconds,
  /// over everything, as Android's own player activity.
  var play: (_ itemId: String, _ start: Double?) -> Void = { _, _ in }

  /// A title the server doesn't have, its catalog page; `library` is where an ask would go.
  var catalog: (_ ref: CatalogRef, _ library: String?) -> Void = { _, _ in }
  /// The library title's page in place of the catalog page on top, once the title arrived.
  var arrived: (_ titleId: String) -> Void = { _ in }
  /// What the signed-in person asked for.
  var asked: () -> Void = {}
  /// An admin's queue of requests, on a list (`RequestQueueList`), or Waiting.
  var requests: (_ list: String?) -> Void = { _ in }
  /// All the provider's movies or shows, or the viewer's recommendations
  /// of them, with filters and an order to start with, as a Discover
  /// row's heading opens its browse.
  var catalogBrowse: (_ start: CatalogBrowseStart) -> Void = { _ in }

  /// A movie's or show's page.
  func title(_ title: TitleSummary) { titleId(title.id) }
  /// Search: Media's field on a phone, the search tab on an iPad.
  func search() { tab(.search) }
  /// The profile: a page on Home on a phone, the account tab on an iPad.
  func profile() { tab(.profile) }
}

extension EnvironmentValues {
  @Entry var navigator = Navigator()
}
