import MatineeCore
import SwiftUI

/*
 * LibraryScreen.kt. A stub from the shell's task until the browse task fills it in;
 * keep the types and their parameters, which Nav.swift opens them with.
 */

/// A library's titles, with sorting, a genre filter, and search. `sort` is a `TitleSort`, or nil for the library's own.
struct LibraryScreen: View {
  let id: String
  let sort: String?

  var body: some View { Stub("LibraryScreen", "id: \(id)", stubValue("sort", sort)) }
}
