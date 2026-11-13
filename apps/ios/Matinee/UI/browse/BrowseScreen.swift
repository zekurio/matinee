import MatineeCore
import SwiftUI

/*
 * BrowseScreen.kt. A stub from the shell's task until the browse task fills it in;
 * keep the types and their parameters, which Nav.swift opens them with.
 */

/// A genre's or a studio's titles across the server.
struct BrowseScreen: View {
  let genre: String?
  let studio: String?

  var body: some View { Stub("BrowseScreen", stubValue("genre", genre), stubValue("studio", studio)) }
}

/// A person's page: who they are and what they're in. Android keeps it in BrowseScreen.kt.
struct PersonScreen: View {
  let name: String

  var body: some View { Stub("PersonScreen", "name: \(name)") }
}
