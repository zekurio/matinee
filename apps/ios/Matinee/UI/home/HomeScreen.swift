import MatineeCore
import SwiftUI

/*
 * HomeScreen.kt. A stub from the shell's task until the home task fills it
 * in; keep the type, which Nav.swift opens as the Home tab's first page.
 */

/// Home: the featured banner, Continue watching, Next up, and what each
/// library got last. Offline mode leaves the server alone: Home is the downloads.
struct HomeScreen: View {
  @Environment(\.offline) private var offline

  var body: some View {
    if offline {
      OfflineHomeScreen()
    } else {
      Stub("HomeScreen")
    }
  }
}
