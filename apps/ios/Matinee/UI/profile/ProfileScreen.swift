import MatineeCore
import SwiftUI

/*
 * ProfileScreen.kt. A stub from the shell's task until the profile task
 * fills it in; keep the type, which Nav.swift opens as the profile tab's
 * first page. Android passes the session; here it's the environment's
 * `MatineeSession`, and the account is `\.user`.
 */

/// The signed-in person: their statistics, favorites, and what they watched
/// last, with the way to Settings in the header.
struct ProfileScreen: View {
  @Environment(\.navigator) private var nav
  @Environment(\.user) private var user

  var body: some View {
    // Settings stays reachable while this is a stub: the server list and signing out live there.
    Stub("ProfileScreen", user.map { "user: \($0.username)" }) {
      Panel {
        LinkRow(Str.shellSettings, icon: .settings, action: nav.settings)
      }
      .padding(.horizontal, Gutter)
    }
  }
}
