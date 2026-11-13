import MatineeCore
import SwiftUI

/*
 * TitleScreens.kt. A stub from the shell's task until the title pages' task fills it in;
 * keep the types and their parameters, which Nav.swift opens them with.
 */

/// A movie's or show's page.
struct TitleScreen: View {
  let id: String

  var body: some View { Stub("TitleScreen", "id: \(id)") }
}

/// A show's season; `season` is nil for the files without a season number.
struct SeasonScreen: View {
  let titleId: String
  let season: Int?

  var body: some View { Stub("SeasonScreen", "titleId: \(titleId)", stubValue("season", season)) }
}

/// An episode's page, or any file's that isn't a movie.
struct EpisodeScreen: View {
  let itemId: String

  var body: some View { Stub("EpisodeScreen", "itemId: \(itemId)") }
}
