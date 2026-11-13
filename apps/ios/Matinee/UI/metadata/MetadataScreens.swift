import MatineeCore
import SwiftUI

/*
 * MetadataScreens.kt. A stub from the shell's task until the metadata task fills it in;
 * keep the types and their parameters, which Nav.swift opens them with.
 */

/// An admin picking the provider entry a title is, when its match is wrong or missing.
struct IdentifyScreen: View {
  let titleId: String

  var body: some View { Stub("IdentifyScreen", "titleId: \(titleId)") }
}

/// An admin's image editor for a title, a season, or an episode.
struct ImagesScreen: View {
  let target: ImageTarget

  var body: some View { Stub("ImagesScreen", "titleId: \(target.titleId)", stubValue("season", target.season), stubValue("episode", target.episode)) }
}
