import AVKit
import MatineeCore
import MatineeKit
import SwiftUI
import UIKit

/*
 * SettingsScreen.kt: the first page of Settings and the category pages
 * Android keeps in the same file, Account, Playback, Subtitles, and
 * Downloads. The words for their choices are in SettingsData.swift, the
 * rows in SettingsRows.swift. Android passes the session; here it's the
 * environment's `MatineeSession`.
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

/// A category's row on the first page.
private struct PageRow: View {
  let page: SettingsPage
  @Environment(\.navigator) private var nav

  init(_ page: SettingsPage) { self.page = page }

  var body: some View {
    LinkRow(page.title, icon: page.icon) { nav.settingsPage(page.key) }
  }
}

/// Settings' first page: the categories, in two groups, what follows the
/// account and what stays on this device, then the server, with the ways
/// out at the bottom.
struct SettingsScreen: View {
  @Environment(MatineeSession.self) private var session
  @Environment(\.user) private var user
  @Environment(\.offline) private var offline

  var body: some View {
    SettingsScaffold(Str.shellSettings) {
      // On top, as Findroid has it: the app starts with the downloads and leaves the server alone.
      Panel {
        LegacySwitchRow(
          Str.settingsOfflineMode,
          isOn: Binding(
            get: { session.offlineMode },
            set: { on in Task { await session.setOfflineMode(on) } }),
          icon: .cloudOff)
      }
      Panel {
        // The sessions live on the server.
        if !offline {
          PageRow(.account)
          RowDivider()
        }
        PageRow(.appearance)
        RowDivider()
        PageRow(.playback)
        RowDivider()
        PageRow(.subtitles)
      }
      Panel {
        PageRow(.downloads)
        RowDivider()
        PageRow(.about)
      }
      if user?.isAdmin == true && !offline {
        SettingsSection(Str.settingsAdmin) {
          Panel {
            let pages = SettingsPage.allCases.filter(\.admin)
            ForEach(Array(pages.enumerated()), id: \.offset) { index, page in
              if index > 0 { RowDivider() }
              PageRow(page)
            }
          }
        }
      }
      SettingsServerSection()
    }
    .scrollsToTopOnReselect()
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
          LucideIcon(.server, tint: palette.mutedForeground)
          VStack(alignment: .leading, spacing: 0) {
            Text(server).textStyle(.base).lineLimit(1)
            Text(Str.iosSettingsVersion(appVersion)).textStyle(.px13).foregroundStyle(palette.mutedForeground)
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

/// A little more than the server's poll interval for devices signing in with a code.
private let DEVICE_POLL: Duration = .seconds(6)

/// Signing in another device, then the places the account is signed in,
/// each but this one with a way to sign it out.
struct AccountPage: View {
  @State private var sessions = Loader<[Session]>()
  @State private var shown = false
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.snackbar) private var snackbar
  @Environment(\.palette) private var palette

  var body: some View {
    SettingsScaffold(Str.settingsPageAccount) {
      Panel {
        LinkRow(Str.linkTitle, icon: .scanQrCode, description: Str.linkRowDescription) { nav.linkDevice() }
      }
      // The sessions as one group under their title, closer together than Android's
      // list has them, so a long list reads as one.
      SettingsSection(Str.accountSessionsTitle) {
        LazyVStack(alignment: .leading, spacing: 10) {
          switch sessions.state {
          case .loading:
            Text(verbatim: "…").textStyle(.base).foregroundStyle(palette.mutedForeground)
              .accessibilityLabel(Str.loadingInProgress)
          case .failed(let message, _):
            Text(Str.accountSessionsLoadFailed(message)).textStyle(.sm).foregroundStyle(palette.mutedForeground)
          case .ready(let list):
            ForEach(list, id: \.id) { item in
              SessionRow(session: item) { signOut(item) }
            }
          }
        }
      }
    }
    .loads(sessions) { api in try await api.account.sessions.list() }
    .task(id: shown) {
      // Back from signing in a device: show it. The device gets its session
      // on its next poll, up to five seconds after the approval, so ask once
      // more after that.
      guard shown, sessions.state.value != nil else { return }
      sessions.reload()
      try? await Task.sleep(for: DEVICE_POLL)
      sessions.reload()
    }
    .onAppear { shown = true }
    .onDisappear { shown = false }
  }

  private func signOut(_ item: Session) {
    guard let api else { return }
    launchShowing(snackbar, Str.accountSessionsSignOutFailed) {
      try await api.account.sessions.revoke(id: item.id)
      sessions.reload()
    }
  }
}

private struct SessionRow: View {
  let session: Session
  let onSignOut: () -> Void
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType

  var body: some View {
    let name = sessionName(session)
    HStack(spacing: 14) {
      LucideIcon(platformIcon(session.platform), tint: palette.mutedForeground)
        .frame(width: 40, height: 40)
        .background(palette.secondary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      VStack(alignment: .leading, spacing: 0) {
        ViewThatFits(in: .horizontal) {
          HStack(spacing: 8) {
            Text(name).textStyle(.base).lineLimit(1)
            if session.current { ThisDevice() }
          }
          // At large text sizes the badge goes under the name rather than squeeze it.
          VStack(alignment: .leading, spacing: 4) {
            Text(name).textStyle(.base)
            if session.current { ThisDevice() }
          }
        }
        Text(detail).textStyle(.px13).foregroundStyle(palette.mutedForeground)
          .lineLimit(dynamicType.isAccessibilitySize ? nil : 2)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .combine)
      if !session.current {
        LegacyRoundIconButton(
          .logOut, label: Str.accountSessionsSignOutNamed(name), size: 40, iconSize: 18,
          background: .clear, action: onSignOut)
      }
    }
    .padding(14)
    .background(palette.card, in: PanelShape)
    .overlay { PanelShape.strokeBorder(palette.border) }
  }

  private var detail: String {
    [
      session.platform.map { Str.accountDeviceApp(platformLabel($0)) },
      Str.accountSessionsSignedIn(formatInstant(session.createdAt)),
    ].compactMap { $0 }.joined(separator: " · ")
  }
}

private struct ThisDevice: View {
  @Environment(\.palette) private var palette

  var body: some View {
    Text(Str.accountSessionsThisDevice).textStyle(.px11, weight: .medium).foregroundStyle(palette.foreground)
      .padding(.horizontal, 8)
      .padding(.vertical, 2)
      .background(palette.secondary, in: Capsule())
  }
}

/// What this device decodes, asked once: it doesn't change while the app runs.
@MainActor private enum Device {
  static let capabilities = Capabilities.probe()
  static let passthrough = Capabilities.passthrough(capabilities)
}

/// The account's languages and skips, then what this device plays and how.
///
/// Android's engine (ExoPlayer or mpv) and decoder (hardware or software)
/// choices have no rows: iOS has the one engine, and AVPlayer picks its
/// decoders itself.
struct PlaybackPage: View {
  @State private var options = Loader<PlaybackOptions>()
  @State private var save = PlaybackSave()
  @Environment(\.user) private var user
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar
  @Environment(MatineeSession.self) private var session
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    let loaded = options.state.value
    let playback = save.shown(user)
    let store: (PlaybackPreferences) -> Void = { save.save($0, api: api, session: session, snackbar: snackbar) }
    SettingsScaffold(Str.settingsPagePlayback) {
      Panel {
        PickerRow(Str.playbackEngineTitle, options: PlayerEngine.allCases.map { ($0, $0 == .mpv ? "mpv" : "AVPlayer") }, current: PlayerPrefs.shared.engine) {
          PlayerPrefs.shared.engine = $0
        }
      }
      LanguagesSection(playback: playback, options: loaded, save: store)
      SkipsSection(playback: playback, options: loaded, save: store)
      DeviceSection(prefs: PlayerPrefs.shared, options: loaded)
      TranscodingSection(prefs: PlayerPrefs.shared, options: loaded)
      if !Device.passthrough.isEmpty {
        PassthroughSection(prefs: PlayerPrefs.shared, codecs: Device.passthrough)
      }
    }
    .loads(options) { api in try await api.playback.options() }
    .onChange(of: loaded) { _, value in if let value { viewer?.options = value } }
  }
}

/// The account's languages, which every device of the account plays by.
private struct LanguagesSection: View {
  let playback: PlaybackPreferences
  let options: PlaybackOptions?
  let save: (PlaybackPreferences) -> Void

  var body: some View {
    SettingsSection(Str.playbackLanguagesTitle) {
      Panel {
        ListPickerRow(Str.playbackAudioTitle, options: audioLanguageChoices(options), current: playback.audioLanguage) {
          var changed = playback
          changed.audioLanguage = $0
          save(changed)
        }
        RowDivider()
        PickerRow(
          Str.playbackSubtitlesTitle, options: SubtitleMode.knownValues.map { ($0, subtitleModeLabel($0)) },
          current: playback.subtitleMode
        ) {
          var changed = playback
          changed.subtitleMode = $0
          save(changed)
        }
        // With subtitles off, which language they'd be in doesn't matter.
        Reveal(playback.subtitleMode != SubtitleMode.off) {
          RowDivider()
          ListPickerRow(
            Str.playbackSubtitlesLanguage, options: subtitleLanguageChoices(options),
            current: playback.subtitleLanguage
          ) {
            var changed = playback
            changed.subtitleLanguage = $0
            save(changed)
          }
        }
        RowDivider()
        // The account keeps audio picks too, as the web's Playback settings offer.
        LegacySwitchRow(
          Str.iosPlaybackAudioRemember,
          isOn: Binding(
            get: { playback.rememberAudio ?? true },
            set: {
              var changed = playback
              changed.rememberAudio = $0
              save(changed)
            }))
        RowDivider()
        LegacySwitchRow(
          Str.playbackSubtitlesRemember,
          isOn: Binding(
            get: { playback.rememberSubtitles },
            set: {
              var changed = playback
              changed.rememberSubtitles = $0
              save(changed)
            }))
      }
    }
  }
}

/// How far the player skips each way, which every device of the account uses.
private struct SkipsSection: View {
  let playback: PlaybackPreferences
  let options: PlaybackOptions?
  let save: (PlaybackPreferences) -> Void

  var body: some View {
    SettingsSection(Str.playbackSkipTitle) {
      Panel {
        PickerRow(Str.playbackSkipBack, options: skipChoices(playback.skipBack, options), current: playback.skipBack) {
          var changed = playback
          changed.skipBackSeconds = $0
          save(changed)
        }
        RowDivider()
        PickerRow(
          Str.playbackSkipForward, options: skipChoices(playback.skipForward, options),
          current: playback.skipForward
        ) {
          var changed = playback
          changed.skipForwardSeconds = $0
          save(changed)
        }
      }
    }
  }
}

/// What stays with this device: quality and how the player behaves.
private struct DeviceSection: View {
  @Bindable var prefs: PlayerPrefs
  let options: PlaybackOptions?

  var body: some View {
    // The qualities this account may stream, once `playback.options` answers.
    let qualities =
      [(ORIGINAL_QUALITY, Str.playerQualityOriginal)] + (options?.qualities ?? []).map { ($0.id, qualityLabel($0)) }
    // One the account may no longer use shows as the original, the best the server
    // allows; it stays saved, so a lifted limit brings it back.
    let current =
      options == nil || qualities.contains { $0.0 == prefs.quality } ? prefs.quality : ORIGINAL_QUALITY
    SettingsSection(Str.playbackDeviceTitle) {
      VStack(spacing: 0) {
        Panel {
          PickerRow(
            Str.playbackQualityTitle, options: qualities, current: current,
            enabled: options == nil || qualities.count > 1
          ) { prefs.quality = $0 }
          RowDivider()
          LegacySwitchRow(Str.playbackAutoplayTitle, isOn: $prefs.autoplayNext)
          if AVPictureInPictureController.isPictureInPictureSupported() {
            RowDivider()
            LegacySwitchRow(Str.playbackPipTitle, isOn: $prefs.pictureInPicture)
          }
        }
        if let limit = options?.maxBitrate {
          Note(Str.playbackQualityLimit(formatBitrate(limit))).padding(.top, 8)
        }
      }
    }
  }
}

/// The codecs the server converts to when this device can't play a file as
/// it is. Downloads don't use them; they have a codec of their own.
private struct TranscodingSection: View {
  @Bindable var prefs: PlayerPrefs
  let options: PlaybackOptions?

  var body: some View {
    // A codec shows only when there's a choice: what the server encodes and this device decodes.
    let video = Capabilities.encodeVideoChoices(
      server: options?.videoCodecs ?? [TranscodeVideoCodec.h264], snapshot: Device.capabilities)
    let audio = Capabilities.convertAudioCodecs(
      server: options?.audioCodecs ?? [TranscodeAudioCodec.aac], snapshot: Device.capabilities)
    // The server may not encode video for this account, so there's no codec to pick for it.
    let noEncodes = options.map { $0.videoCodecs.isEmpty } ?? false
    if noEncodes || video.count > 1 || audio.count > 1 {
      SettingsSection(Str.playbackTranscodingTitle) {
        VStack(spacing: 0) {
          Panel {
            if noEncodes {
              LegacyValueRow(Str.playbackVideoCodecTitle, value: Str.playbackVideoCodecNone)
            } else if video.count > 1 {
              PickerRow(
                Str.playbackVideoCodecTitle,
                options: [(AUTOMATIC, Str.playbackCodecAutomatic(videoCodecName("h264")))]
                  + video.map { ($0, videoCodecName($0)) },
                current: video.contains(prefs.videoCodec) ? prefs.videoCodec : AUTOMATIC
              ) { prefs.videoCodec = $0 }
            }
            if audio.count > 1 {
              if noEncodes || video.count > 1 { RowDivider() }
              PickerRow(
                Str.playbackAudioCodecTitle,
                options: [(AUTOMATIC, Str.playbackCodecAutomatic(audioFormatName(audio[0])))]
                  + audio.map { ($0, audioFormatName($0)) },
                current: audio.contains(prefs.audioCodec) ? prefs.audioCodec : AUTOMATIC
              ) { prefs.audioCodec = $0 }
            }
          }
          Note(noEncodes ? Str.playbackTranscodingNoEncodes : Str.playbackTranscodingNote).padding(.top, 8)
        }
      }
    }
  }
}

/// A switch per format this device plays that the server could convert, as the web's passthrough.
private struct PassthroughSection: View {
  let prefs: PlayerPrefs
  let codecs: [String]

  var body: some View {
    SettingsSection(Str.playbackPassthroughTitle) {
      Panel {
        ForEach(Array(codecs.enumerated()), id: \.offset) { index, codec in
          if index > 0 { RowDivider() }
          LegacySwitchRow(
            audioFormatName(codec),
            isOn: Binding(
              get: { !prefs.convertAudio.contains(codec) },
              set: { on in
                if on { prefs.convertAudio.remove(codec) } else { prefs.convertAudio.insert(codec) }
              }))
        }
      }
    }
  }
}

/// How subtitles look here, with a sample: the system's caption style, which
/// leaves only the way to its settings, or the app's own choices.
struct SubtitlesPage: View {
  @Bindable private var prefs = PlayerPrefs.shared
  @Environment(\.horizontalSizeClass) private var sizeClass

  var body: some View {
    SettingsScaffold(Str.settingsSubtitlesTitle) {
      // Side by side across an iPad, the sample as big as the rows beside it; above them on a phone.
      if sizeClass == .regular {
        HStack(alignment: .top, spacing: 16) {
          SubtitlePreview(look: subtitleLook(prefs), wide: true)
          rows
        }
      } else {
        VStack(spacing: 12) {
          SubtitlePreview(look: subtitleLook(prefs))
          rows
        }
      }
    }
  }

  private var rows: some View {
    Panel {
      LegacySwitchRow(Str.settingsSubtitlesSystem, isOn: $prefs.subtitleSystemStyle)
      RowDivider()
      // One set of rows closes as the other opens, rather than the panel jumping.
      Reveal(prefs.subtitleSystemStyle) {
        // iOS keeps the caption style where no app can open it, so the row says where.
        NoteRow(Str.settingsSubtitlesSystemOpen, description: Str.iosSettingsSubtitlesSystemWhere)
      }
      Reveal(!prefs.subtitleSystemStyle) {
        OwnSubtitleLook(prefs: prefs)
      }
    }
  }
}

/// The app's own subtitle look.
private struct OwnSubtitleLook: View {
  @Bindable var prefs: PlayerPrefs

  var body: some View {
    PickerRow(
      Str.settingsSubtitlesSize,
      options: SUBTITLE_SCALES.map { ($0, $0.formatted(.percent.locale(.app))) },
      current: prefs.subtitleScale
    ) { prefs.subtitleScale = $0 }
    RowDivider()
    PickerRow(
      Str.settingsSubtitlesColor, options: [SubtitleColor.white, .yellow, .cyan, .green].map { ($0, subtitleColorLabel($0)) },
      current: prefs.subtitleColor
    ) { prefs.subtitleColor = $0 }
    RowDivider()
    PickerRow(
      Str.settingsSubtitlesBackground,
      options: [SubtitleBackground.none, .shaded, .black].map { ($0, subtitleBackgroundLabel($0)) },
      current: prefs.subtitleBackground
    ) { prefs.subtitleBackground = $0 }
    RowDivider()
    PickerRow(
      Str.settingsSubtitlesEdge, options: OWN_SUBTITLE_EDGES.map { ($0, subtitleEdgeLabel($0)) },
      current: prefs.subtitleEdge
    ) { prefs.subtitleEdge = $0 }
  }
}

/// A line of subtitles over a stand-in for a bright frame, as the player would draw it.
private struct SubtitlePreview: View {
  let look: SubtitleLook
  /// Beside the rows on an iPad: a frame of a video's shape, with the size the player starts from.
  var wide = false
  @Environment(\.palette) private var palette

  var body: some View {
    let shape = PanelShape
    LinearGradient(
      colors: [RGB(0x9DB3D1).color, RGB(0x55657F).color, RGB(0x2B2622).color, RGB(0x6E5A45).color],
      startPoint: .topLeading, endPoint: .bottomTrailing
    )
    .frame(maxWidth: .infinity)
    .frame(height: wide ? nil : 140)
    .aspectRatio(wide ? 16 / 9 : nil, contentMode: .fit)
    .overlay(alignment: .bottom) {
      // The player's own cue line, so the sample is what plays.
      SubtitleLine(cue: Cue(text: Str.settingsSubtitlesPreview), look: look, size: wide ? 20 : 16)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }
    .clipShape(shape)
    .overlay { shape.strokeBorder(palette.border) }
    .accessibilityElement(children: .combine)
  }
}

/// Downloads' network, version, and subtitles, the room they take, and
/// removing them all, as Android has them here rather than on the tab.
struct DownloadsSettingsPage: View {
  @State private var options = Loader<PlaybackOptions>()
  @State private var confirm = false
  /// Read from the disk, as the system's storage settings count it.
  @State private var storage: DownloadStorage?
  @Environment(Downloads.self) private var downloads
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.snackbar) private var snackbar
  @Environment(\.palette) private var palette

  var body: some View {
    @Bindable var downloads = downloads
    let loaded = options.state.value
    // An account that may not download keeps what's on the phone, and nothing more to set.
    let off = loaded?.downloads == false
    let items = downloads.store.items
    let total = formatBytes(storage?.used ?? items.values.reduce(0) { $0 + $1.bytes })
    SettingsScaffold(Str.downloadsTitle) {
      if off {
        VStack(alignment: .leading, spacing: 4) {
          Text(Str.downloadsOffTitle).textStyle(.base, weight: .semibold)
          Text(Str.downloadsOffDescription).textStyle(.sm).foregroundStyle(palette.mutedForeground)
        }
      }
      Panel {
        LegacyValueRow(Str.downloadsStorage, value: Str.downloadsStorageValue(total, storage?.free.map(formatBytes) ?? "–"))
        if !off {
          RowDivider()
          LegacySwitchRow(Str.downloadsUnmetered, isOn: $downloads.unmeteredOnly)
        }
      }
      if !off {
        // What the download sheet starts on.
        SettingsSection(Str.downloadsDefaults) {
          VStack(spacing: 0) {
            Panel {
              PickerRow(
                Str.downloadsDefaultTitle,
                options: [(DEFAULT_DEVICE, Str.downloadsChoiceDevice)]
                  + (loaded?.downloadVideoPresets ?? []).map {
                    ("\($0.height)", ungrouped(Str.downloadsChoicePreset($0.height, mbps($0.bitrate)), $0.height))
                  } + [(DEFAULT_ORIGINAL, Str.downloadsChoiceOriginal)],
                current: downloads.defaultVersion
              ) { downloads.defaultVersion = $0 }
              RowDivider()
              PickerRow(
                Str.downloadsDefaultSubtitles,
                options: [
                  (DownloadSubtitles.used, Str.downloadsSubtitlesUsed), (.all, Str.downloadsSubtitlesAll),
                  (.none, Str.downloadsSubtitlesNone),
                ],
                current: downloads.subtitles
              ) { downloads.subtitles = $0 }
              // What an encoded download comes in: of the server's codecs, those this device decodes.
              let codecs = Capabilities.encodeVideoChoices(
                server: loaded?.videoCodecs ?? [TranscodeVideoCodec.h264], snapshot: Device.capabilities)
              if codecs.count > 1 {
                RowDivider()
                PickerRow(
                  Str.downloadsCodec,
                  options: [(AUTOMATIC, Str.playbackCodecAutomatic(videoCodecName("h264")))]
                    + codecs.map { ($0, videoCodecName($0)) },
                  current: codecs.contains(downloads.videoCodec) ? downloads.videoCodec : AUTOMATIC
                ) { downloads.videoCodec = $0 }
              }
            }
            Note(Str.downloadsCodecNote).padding(.top, 8)
          }
        }
      }
      if !items.isEmpty {
        Panel {
          LinkRow(Str.downloadsRemoveAll, destructive: true) { confirm = true }
        }
      }
    }
    .loads(options) { api in try await api.playback.options() }
    .onChange(of: loaded) { _, value in if let value { viewer?.options = value } }
    // Again as files come and go, and as they grow.
    .task(id: items.values.reduce(Int64(items.count)) { $0 + $1.bytes }) {
      storage = await downloads.store.storage()
    }
    .alert(Str.downloadsRemoveAllConfirm, isPresented: $confirm) {
      Button(Str.commonRemove, role: .destructive) {
        let downloads = downloads
        launchShowing(snackbar, Str.downloadsFailed) { try await downloads.removeAll() }
      }
      Button(Str.commonCancel, role: .cancel) {}
    } message: {
      Text(Str.downloadsRemoveAllBody(total))
    }
  }
}

/// "2.5" for 2.5 Mbps, "8" for 8, in the app's language.
private func mbps(_ bitrate: Int) -> String {
  (Double(bitrate) / 1_000_000).formatted(.number.precision(.fractionLength(0...1)).locale(.app))
}
