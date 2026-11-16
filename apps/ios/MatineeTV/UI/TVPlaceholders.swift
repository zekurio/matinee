import MatineeCore
import MatineeKit
import SwiftUI

/*
 * The TV pages not built yet, each a plain page that names itself, its
 * route, and the Android TV screen it will port, with a way back: Menu, or
 * its one button. Every route has one, so Home's cards and the drawer go
 * somewhere real.
 *
 * `TVRouteScreen` (TVNav.swift) already names every page by the type it
 * will have, so building one never edits it: write the page as that type in
 * its own file, in the folder of its Android screen (MatineeTV/README.md,
 * "What's left"), and delete its placeholder here. Each area's placeholders
 * sit under their own heading, so areas built side by side delete apart.
 * When the last is gone, so is this file.
 */

// MARK: Browse: ui/tv/browse

struct TVSearchScreen: View {
  var body: some View { TVPlaceholderPage(Str.searchTitle, path: "search", port: "browse/TvSearch.kt") }
}

struct TVFavoritesScreen: View {
  var body: some View { TVPlaceholderPage(Str.favoritesTitle, path: "favorites", port: "browse/TvFavorites.kt") }
}

struct TVKindScreen: View {
  /// A `TitleKind`.
  let kind: String
  var body: some View {
    TVPlaceholderPage(
      kind == TitleKind.show ? Str.browseKindShow : Str.browseKindMovie,
      path: kind == TitleKind.show ? "shows" : "movies", port: "browse/TvKind.kt")
  }
}

struct TVBrowseScreen: View {
  let genre: String?
  let studio: String?
  var body: some View {
    TVPlaceholderPage(
      genre ?? studio ?? "", path: genre.map { "genre/\($0)" } ?? "studio/\(studio ?? "")", port: "browse/TvBrowse.kt")
  }
}

// MARK: Profile: ui/tv/profile

struct TVProfileScreen: View {
  var body: some View { TVPlaceholderPage(Str.tabProfile, path: "profile", port: "profile/TvProfile.kt") }
}

struct TVRecentScreen: View {
  var body: some View { TVPlaceholderPage(Str.tabProfile, path: "recent", port: "profile/TvRecent.kt") }
}

// MARK: Settings: ui/tv/settings

struct TVSettingsScreen: View {
  /// One of Settings' categories, by its key, or nil for Settings itself.
  var page: String? = nil
  var body: some View {
    TVPlaceholderPage(
      Str.shellSettings, path: page.map { "settings/\($0)" } ?? "settings", port: "settings/TvSettings.kt")
  }
}

// MARK: The placeholder

/// A page still to be built: its name, its route as `-dev.route` takes it,
/// and the Android TV file it ports, with a way back.
struct TVPlaceholderPage: View {
  let title: String
  let path: String
  let port: String
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette
  @FocusState private var focused: Bool

  init(_ title: String, path: String, port: String) {
    self.title = title
    self.path = path
    self.port = port
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(title).textStyle(.headline).foregroundStyle(palette.foreground)
      // Not words for anyone watching: the route and its source, for whoever builds the page.
      Text(verbatim: "\(path) · ui/tv/\(port)").textStyle(.caption).foregroundStyle(palette.mutedForeground)
        .padding(.top, TVSpace.s2)
      TVButton(Str.commonBack, icon: .arrowLeft) { nav.back() }
        .focused($focused)
        .padding(.top, TVSpace.s8)
    }
    .tvPageFocus($focused)
    .padding(.leading, TVPage.start)
    .padding(.trailing, TVPage.end)
    .padding(.top, TVOverscan.vertical + 120)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(palette.background)
    .ignoresSafeArea()
  }
}
