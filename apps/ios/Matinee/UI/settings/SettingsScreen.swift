import MatineeCore
import SwiftUI

/*
 * SettingsScreen.kt. A stub from the shell's task until the settings task
 * fills it in. `SettingsPage` and `SettingsPageScreen`'s dispatch are
 * Android's as they are; the pages they open are stubs in their own files
 * (AppearanceSettings, AboutSettings, admin/…) or below. The first page
 * already has what the shell needs of it, ported from Android: the offline
 * switch and the server's section, with the server list and Sign out.
 * Android passes the session; here it's the environment's `MatineeSession`.
 */

/// A category of Settings, as Findroid and the web's phone menu list them:
/// each is a row on the first page, and opens a page of its own.
enum SettingsPage: String, CaseIterable {
  case account, appearance, playback, subtitles, downloads, about
  // The server's settings, for admins, as the web's admin sections. Each page lives in settings/admin.
  case libraries, users, authentication, transcoding, trickplay, jobs
  case serverAppearance = "server-appearance"

  var key: String { rawValue }

  static func of(_ key: String) -> SettingsPage? { SettingsPage(rawValue: key) }

  var admin: Bool {
    switch self {
    case .account, .appearance, .playback, .subtitles, .downloads, .about: false
    default: true
    }
  }

  var icon: Lucide {
    switch self {
    case .account: .userRound
    case .appearance: .palette
    case .playback: .tvPlay
    case .subtitles: .captions
    case .downloads: .download
    case .about: .info
    case .libraries: .libraryBig
    case .users: .users
    case .authentication: .keyRound
    case .transcoding: .film
    case .trickplay: .galleryHorizontalEnd
    case .jobs: .listChecks
    case .serverAppearance: .paintbrush
    }
  }

  var title: String {
    switch self {
    case .account: Str.settingsPageAccount
    case .appearance: Str.settingsPageAppearance
    case .playback: Str.settingsPagePlayback
    case .subtitles: Str.settingsSubtitlesTitle
    case .downloads: Str.downloadsTitle
    case .about: Str.aboutTitle
    case .libraries: Str.settingsAdminLibraries
    case .users: Str.settingsAdminUsers
    case .authentication: Str.settingsAdminAuthentication
    case .transcoding: Str.settingsAdminTranscoding
    case .trickplay: Str.settingsAdminTrickplay
    case .jobs: Str.settingsAdminJobs
    case .serverAppearance: Str.settingsAdminAppearance
    }
  }
}

/// Settings' first page: the categories, in two groups, what follows the
/// account and what stays on this device, then the server, with the ways
/// out at the bottom.
struct SettingsScreen: View {
  @Environment(MatineeSession.self) private var session
  @Environment(\.navigator) private var nav
  @Environment(\.user) private var user
  @Environment(\.offline) private var offline

  /// The account's pages, less those the server answers while it's away, and the admin's.
  private var pages: [SettingsPage] {
    SettingsPage.allCases.filter { page in
      if page.admin { return user?.isAdmin == true && !offline }
      return !(offline && page == .account)
    }
  }

  var body: some View {
    Stub("SettingsScreen") {
      VStack(alignment: .leading, spacing: 28) {
        // On top, as Findroid has it: the app starts with the downloads and leaves the server alone.
        Panel {
          SwitchRow(
            Str.settingsOfflineMode,
            isOn: Binding(
              get: { session.offlineMode },
              set: { on in Task { await session.setOfflineMode(on) } }),
            icon: .cloudOff)
        }
        Panel {
          ForEach(Array(pages.enumerated()), id: \.offset) { index, page in
            if index > 0 { RowDivider() }
            LinkRow(page.title, icon: page.icon) { nav.settingsPage(page.key) }
          }
        }
        SettingsServerSection()
      }
      .padding(.horizontal, Gutter)
    }
  }
}

/// The server in use, its version, and the two ways out: the server list and signing out.
struct SettingsServerSection: View {
  @Environment(MatineeSession.self) private var session
  @Environment(\.palette) private var palette

  var body: some View {
    SettingsSection(Str.settingsServer) {
      Panel {
        HStack(spacing: 14) {
          LucideIcon(.server, tint: palette.muted)
          VStack(alignment: .leading, spacing: 0) {
            Text(server).textStyle(.bodyLarge).lineLimit(1)
            Text(Str.iosSettingsVersion(appVersion)).textStyle(.bodySmall).foregroundStyle(palette.muted)
          }
          Spacer(minLength: 0)
        }
        .padding(16)
        RowDivider()
        // Full rows, so the two ways out are easy to hit; signing out in red, as it ends the session.
        ChangeServerRow()
        RowDivider()
        LinkRow(Str.shellSignOut, destructive: true, icon: .logOut) {
          Task { try? await session.signOut() }
        }
      }
    }
  }

  private var server: String {
    switch session.state {
    case .signedIn(let server, _), .offline(let server, _): server
    default: ""
    }
  }
}

/// The app's version, as the root package.json has it.
var appVersion: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "" }

/// A category's page, by its key in the route.
struct SettingsPageScreen: View {
  let key: String

  var body: some View {
    switch SettingsPage.of(key) {
    case nil: SettingsScreen()
    case .account: AccountPage()
    case .appearance: AppearancePage()
    case .playback: PlaybackPage()
    case .subtitles: SubtitlesPage()
    case .downloads: DownloadsSettingsPage()
    case .about: AboutPage()
    case .libraries: LibrariesSettings()
    case .users: UsersSettings()
    case .authentication: AuthenticationSettings()
    case .transcoding: TranscodingSettings()
    case .trickplay: TrickplaySettings()
    case .jobs: JobsSettings()
    case .serverAppearance: ServerAppearanceSettings()
    }
  }
}

/// Signing in another device, then the places the account is signed in.
struct AccountPage: View {
  var body: some View { Stub("AccountPage") }
}

/// This device's quality, codecs, decoders, skip length, and the rest of playback.
struct PlaybackPage: View {
  var body: some View { Stub("PlaybackPage") }
}

/// How subtitles look: Android's Subtitles page, its `SubtitlesSection`.
struct SubtitlesPage: View {
  var body: some View { Stub("SubtitlesPage") }
}

/// Downloads' network, version, and subtitles: Android's Downloads page, its `DownloadsSection`.
struct DownloadsSettingsPage: View {
  var body: some View { Stub("DownloadsSettingsPage") }
}
