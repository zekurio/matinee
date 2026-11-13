import MatineeCore
import SwiftUI

/*
 * DownloadsScreen.kt. A stub from the shell's task until the downloads task fills it in;
 * keep the types and their parameters, which Nav.swift opens them with.
 */

/// The downloads: the Downloads tab's first page, and Home's place offline.
struct DownloadsScreen: View {

  var body: some View { Stub("DownloadsScreen") }
}

/// A downloaded show's episodes.
struct DownloadsShowScreen: View {
  let titleId: String

  var body: some View { Stub("DownloadsShowScreen", "titleId: \(titleId)") }
}
