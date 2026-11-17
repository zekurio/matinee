import AVKit
import MatineeCore
import MatineeKit
import SwiftUI

/*
 * SettingsScreen.kt: the first page of Settings and the category pages
 * Android keeps in the same file, Playback, Subtitles, and Downloads.
 * Account is in AccountSettings.swift, Appearance and About in theirs. The
 * words for the choices are in SettingsData.swift, the page and its rows
 * in SettingsRows.swift.
 *
 * The first page is Android's: offline mode on top, then the categories
 * in two blocks, what follows the account and what stays on this device,
 * the server's settings for an admin, and the server with the ways out.
 * The Account row carries the account's picture and name, which Android's
 * lacks, in the place Android's Account row has.
 */

/// A category of Settings, as Findroid and the web's phone menu list them:
/// each is a row on the first page, and opens a page of its own.
enum SettingsPage: String, CaseIterable {
  case account, appearance, playback, subtitles, downloads, about
  // The server's settings, for admins, as the web's admin sections. Each page lives in settings/admin.
  case libraries, users, authentication, transcoding, trickplay, jobs
  case branding

  var key: String { rawValue }

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
    case .branding: .paintbrush
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
    case .branding: Str.settingsAdminBranding
    }
  }
}

/// A category's row on the first page.
private struct PageRow: View {
  let page: SettingsPage
  @Environment(\.navigator) private var nav

  init(_ page: SettingsPage) { self.page = page }

  var body: some View {
    ListRow(page.title, icon: page.icon) { nav.settingsPage(page.key) }
  }
}

/// Settings' first page, as Android's: offline mode, the categories in two
/// blocks, what follows the account and what stays on this device, then the
/// server's settings for an admin, and the server with the ways out.
struct SettingsScreen: View {
  @Environment(MatineeSession.self) private var session
  @Environment(\.user) private var user
  @Environment(\.offline) private var offline

  var body: some View {
    SettingsScaffold(Str.shellSettings) {
      // On top, as Findroid has it: the app starts with the downloads and leaves the server alone.
      ListBlock {
        SwitchRow(
          Str.settingsOfflineMode, icon: .cloudOff,
          isOn: Binding(get: { session.offlineMode }, set: { on in Task { await session.setOfflineMode(on) } }))
      }
      ListBlock {
        // The sessions and the profile live on the server.
        if let user, !offline {
          AccountRow(user: user)
        }
        PageRow(.appearance)
        PageRow(.playback)
        PageRow(.subtitles)
      }
      ListBlock {
        PageRow(.downloads)
        PageRow(.about)
      }
      if user?.isAdmin == true && !offline {
        ListSection(Str.settingsAdmin) {
          ForEach(SettingsPage.allCases.filter(\.admin), id: \.self) { PageRow($0) }
        }
      }
      SettingsServerSection()
    }
  }
}

/// Android's Account row, with the account's picture in place of its icon
/// and its name over the page's: what the row opens, and whose it is.
private struct AccountRow: View {
  let user: User
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette

  var body: some View {
    Pressable {
      nav.settingsPage(SettingsPage.account.key)
    } label: {
      HStack(spacing: 0) {
        ProfileAvatar(user.name, url: user.avatarId.flatMap { api?.paths.avatar($0) }, size: 40)
        Spacer().frame(width: Space.s3_5)
        VStack(alignment: .leading, spacing: 0) {
          Text(user.name).textStyle(.base).foregroundStyle(palette.foreground)
          Text(Str.settingsPageAccount).textStyle(.px13).foregroundStyle(palette.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        LucideIcon(.chevronRight, size: 16, tint: palette.mutedForeground).padding(.leading, Space.s1)
      }
      .padding(.horizontal, Space.s4)
      .padding(.vertical, Space.s3)
      .frame(minHeight: 52)
      .contentShape(Rectangle())
    }
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isButton)
  }
}

/// The server in use, its version, and the two ways out: the server list and signing out.
struct SettingsServerSection: View {
  @Environment(MatineeSession.self) private var session

  var body: some View {
    ListSection(Str.settingsServer) {
      ListRow(server, subtitle: Str.iosSettingsVersion(appVersion), icon: .server)
      // Full rows, so the two ways out are easy to hit; signing out in red, as it ends the session.
      ChangeServerRow()
      ListRow(Str.shellSignOut, icon: .logOut, destructive: true) {
        Task { try? await session.signOut() }
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
    switch SettingsPage(rawValue: key) {
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
    case .branding: ServerBrandingSettings()
    }
  }
}

// MARK: Playback

/// What this device decodes, asked once: it doesn't change while the app runs.
@MainActor enum Device {
  static let capabilities = Capabilities.probe()
}

/// The account's languages, skips, and specials, then what this device
/// plays and how: quality, the engine, the gestures and buttons of the
/// player, the codecs encodes come in, and passthrough.
///
/// Android's decoder choice (hardware or software) has no row: AVPlayer
/// picks its decoders itself, and mpv decodes with VideoToolbox where it can.
struct PlaybackPage: View {
  @State private var options = Loader<PlaybackOptions>()
  @State private var save = PlaybackSave()
  @State private var specials = SpecialsSave()
  @Environment(\.user) private var user
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar
  @Environment(MatineeSession.self) private var session
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    let loaded = options.state.value
    let playback = save.shown(user)
    let store: (PlaybackPreferences) -> Void = { save.save($0, api: api, session: session, snackbar: snackbar) }
    let prefs = PlayerPrefs.shared
    SettingsScaffold(Str.settingsPagePlayback) {
      LanguagesSection(playback: playback, options: loaded, save: store)
      SkipsSection(playback: playback, options: loaded, save: store)
      ListSection(Str.playbackShowsTitle) {
        SwitchRow(
          Str.playbackSpecialsTitle,
          isOn: Binding(
            get: { specials.shown(user) },
            set: { specials.save($0, api: api, session: session, viewer: viewer, snackbar: snackbar) }))
      }
      DeviceSection(prefs: prefs, options: loaded)
      GesturesSection(prefs: prefs)
      ButtonsSection(prefs: prefs)
      TranscodingSection(prefs: prefs, options: loaded)
      let passthrough = Capabilities.passthrough(Device.capabilities, engine: prefs.engine)
      if !passthrough.isEmpty {
        PassthroughSection(prefs: prefs, codecs: passthrough)
      }
    }
    .loads(options) { api in try await api.playback.options() }
    .onChange(of: loaded) { _, value in if let value { viewer?.options = value } }
  }
}

/// A change to one of the account's playback preferences, saved whole.
private func changed(
  _ playback: PlaybackPreferences, _ save: @escaping (PlaybackPreferences) -> Void,
  _ edit: @escaping (inout PlaybackPreferences) -> Void
) {
  var next = playback
  edit(&next)
  save(next)
}

/// The account's languages, which every device of the account plays by.
private struct LanguagesSection: View {
  let playback: PlaybackPreferences
  let options: PlaybackOptions?
  let save: (PlaybackPreferences) -> Void

  var body: some View {
    ListSection(Str.playbackLanguagesTitle) {
      ChoiceRow(
        Str.playbackAudioTitle, current: playback.audioLanguage,
        options: audioLanguageChoices(options, current: playback.audioLanguage)
      ) { value in changed(playback, save) { $0.audioLanguage = value } }
      ChoiceRow(
        Str.playbackSubtitlesTitle, current: playback.subtitleMode,
        options: SubtitleMode.knownValues.map { ($0, subtitleModeLabel($0)) }
      ) { value in changed(playback, save) { $0.subtitleMode = value } }
      // With subtitles off, which language they'd be in doesn't matter.
      if playback.subtitleMode != SubtitleMode.off {
        ChoiceRow(
          Str.playbackSubtitlesLanguage, current: playback.subtitleLanguage,
          options: subtitleLanguageChoices(options, current: playback.subtitleLanguage)
        ) { value in changed(playback, save) { $0.subtitleLanguage = value } }
      }
      // The account keeps audio picks too, as the web's Playback settings offer.
      SwitchRow(
        Str.iosPlaybackAudioRemember,
        isOn: Binding(
          get: { playback.rememberAudio ?? true },
          set: { on in changed(playback, save) { $0.rememberAudio = on } }))
      SwitchRow(
        Str.playbackSubtitlesRemember,
        isOn: Binding(
          get: { playback.rememberSubtitles },
          set: { on in changed(playback, save) { $0.rememberSubtitles = on } }))
    }
  }
}

/// How far the player skips each way, which every device of the account uses.
private struct SkipsSection: View {
  let playback: PlaybackPreferences
  let options: PlaybackOptions?
  let save: (PlaybackPreferences) -> Void

  var body: some View {
    ListSection(Str.playbackSkipTitle) {
      ChoiceRow(Str.playbackSkipBack, current: playback.skipBack, options: skipChoices(playback.skipBack, options)) {
        value in changed(playback, save) { $0.skipBackSeconds = value }
      }
      ChoiceRow(
        Str.playbackSkipForward, current: playback.skipForward, options: skipChoices(playback.skipForward, options)
      ) { value in changed(playback, save) { $0.skipForwardSeconds = value } }
    }
  }
}

/// Whether this device can keep playing in a small window.
private var pictureInPictureSupported: Bool {
  ClientCapabilities.pictureInPicture && AVPictureInPictureController.isPictureInPictureSupported()
}

/// What stays with this device: quality, the engine, and how the player behaves.
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
    ListSection(Str.playbackDeviceTitle, footer: options?.maxBitrate.map { Str.playbackQualityLimit(formatBitrate($0)) }) {
      ChoiceRow(Str.playbackQualityTitle, current: current, options: qualities, enabled: options == nil || qualities.count > 1) {
        prefs.quality = $0
      }
      // The engines' own names, the same in every language, as Android's ExoPlayer and mpv.
      ChoiceRow(Str.playbackEngineTitle, selection: $prefs.engine, options: [(.mpv, "mpv"), (.avPlayer, "AVPlayer")])
      SwitchRow(Str.playbackAutoplayTitle, isOn: $prefs.autoplayNext)
      if pictureInPictureSupported {
        SwitchRow(Str.playbackPipTitle, isOn: $prefs.pictureInPicture)
      }
    }
  }
}

/// The swipes and the hold on the video, which this device keeps.
private struct GesturesSection: View {
  @Bindable var prefs: PlayerPrefs

  var body: some View {
    ListSection(Str.playbackGesturesTitle) {
      SwitchRow(Str.playbackGesturesLevels, isOn: $prefs.swipeLevels)
      if prefs.swipeLevels {
        SwitchRow(
          Str.playbackGesturesRememberBrightness,
          isOn: Binding(get: { prefs.rememberBrightness }, set: { prefs.setRememberBrightness($0) }))
      }
      SwitchRow(Str.playbackGesturesSeek, isOn: $prefs.swipeSeek)
      SwitchRow(Str.playbackGesturesHold, isOn: $prefs.holdSpeed)
    }
  }
}

/// Which buttons the player's controls show, which this device keeps. Back,
/// play, and the settings menu always show, so none of them strands anyone.
private struct ButtonsSection: View {
  @Bindable var prefs: PlayerPrefs

  var body: some View {
    ListSection(Str.playbackButtonsTitle) {
      SwitchRow(Str.playbackButtonsSkip, isOn: $prefs.skipButtons)
      // With picture in picture off, there's no button to hide.
      if pictureInPictureSupported && prefs.pictureInPicture {
        SwitchRow(Str.playbackPipTitle, isOn: $prefs.pictureInPictureButton)
      }
      SwitchRow(Str.playbackButtonsLock, isOn: $prefs.lockButton)
      SwitchRow(Str.playbackButtonsAudio, isOn: $prefs.audioButton)
      SwitchRow(Str.playbackButtonsSubtitles, isOn: $prefs.subtitlesButton)
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
      ListSection(
        Str.playbackTranscodingTitle, footer: noEncodes ? Str.playbackTranscodingNoEncodes : Str.playbackTranscodingNote
      ) {
        if noEncodes {
          ValueRow(Str.playbackVideoCodecTitle, value: Str.playbackVideoCodecNone)
        } else if video.count > 1 {
          ChoiceRow(
            Str.playbackVideoCodecTitle, current: video.contains(prefs.videoCodec) ? prefs.videoCodec : AUTOMATIC,
            options: [(AUTOMATIC, Str.playbackCodecAutomatic(videoCodecName("h264")))]
              + video.map { ($0, videoCodecName($0)) }
          ) { prefs.videoCodec = $0 }
        }
        if audio.count > 1 {
          ChoiceRow(
            Str.playbackAudioCodecTitle, current: audio.contains(prefs.audioCodec) ? prefs.audioCodec : AUTOMATIC,
            options: [(AUTOMATIC, Str.playbackCodecAutomatic(audioFormatName(audio[0])))]
              + audio.map { ($0, audioFormatName($0)) }
          ) { prefs.audioCodec = $0 }
        }
      }
    }
  }
}

/// A switch per format the engine plays as it is that the server could
/// convert, as the web's passthrough. mpv plays all of them; AVPlayer what
/// AudioToolbox decodes.
private struct PassthroughSection: View {
  let prefs: PlayerPrefs
  let codecs: [String]

  var body: some View {
    ListSection(Str.playbackPassthroughTitle) {
      ForEach(codecs, id: \.self) { codec in
        SwitchRow(
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

// MARK: Subtitles

/// How subtitles look here, with a sample: the system's caption style, which
/// iOS keeps in its own Settings, or the app's own choices.
struct SubtitlesPage: View {
  @Bindable private var prefs = PlayerPrefs.shared

  var body: some View {
    SettingsScaffold(Str.settingsSubtitlesTitle) {
      VStack(alignment: .leading, spacing: Space.s3) {
        SubtitlePreview(look: subtitleLook(prefs))
        ListBlock {
          SwitchRow(Str.settingsSubtitlesSystem, isOn: $prefs.subtitleSystemStyle)
          if prefs.subtitleSystemStyle {
            // iOS keeps the caption style where no app can open it, so the row says where.
            ListRow(Str.settingsSubtitlesSystemOpen, subtitle: Str.iosSettingsSubtitlesSystemWhere)
          } else {
            ChoiceRow(
              Str.settingsSubtitlesSize, selection: $prefs.subtitleScale,
              options: SUBTITLE_SCALES.map { ($0, $0.formatted(.percent.locale(.app))) })
            ChoiceRow(
              Str.settingsSubtitlesColor, selection: $prefs.subtitleColor,
              options: [SubtitleColor.white, .yellow, .cyan, .green].map { ($0, subtitleColorLabel($0)) })
            ChoiceRow(
              Str.settingsSubtitlesBackground, selection: $prefs.subtitleBackground,
              options: [SubtitleBackground.none, .shaded, .black].map { ($0, subtitleBackgroundLabel($0)) })
            ChoiceRow(
              Str.settingsSubtitlesEdge, selection: $prefs.subtitleEdge,
              options: OWN_SUBTITLE_EDGES.map { ($0, subtitleEdgeLabel($0)) })
          }
        }
      }
    }
  }
}

/// A line of subtitles over a stand-in for a bright frame, as the player
/// would draw it: a frame of a video's shape, `rounded-xl` with the block's
/// border, the cue at the size the player starts from.
private struct SubtitlePreview: View {
  let look: SubtitleLook
  @Environment(\.palette) private var palette
  @Environment(\.settingsWide) private var wide

  var body: some View {
    LinearGradient(
      colors: [
        RGB(0x9DB3D1).color, RGB(0x55657F).color, RGB(0x2B2622).color,
        RGB(0x6E5A45).color,
      ],
      startPoint: .topLeading, endPoint: .bottomTrailing
    )
    // A phone's frame is Android's, 140 tall across the column; across an
    // iPad's wider column, a film's 2.39:1, so the sample doesn't stand
    // taller than the rows under it.
    .aspectRatio(wide ? 2.39 : nil, contentMode: .fit)
    .frame(maxWidth: .infinity)
    .frame(height: wide ? nil : 140)
    .overlay(alignment: .bottom) {
      // The player's own cue line, so the sample is what plays, at a phone
      // player's size scaled to the frame's width.
      GeometryReader { proxy in
        SubtitleLine(cue: Cue(text: Str.settingsSubtitlesPreview), look: look, size: min(26, max(14, proxy.size.width / 22)))
          .padding(.horizontal, Space.s4)
          .padding(.bottom, proxy.size.height * 0.07)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
      }
    }
    .clipShape(PanelShape)
    .overlay { PanelShape.strokeBorder(palette.border) }
    .accessibilityElement(children: .combine)
  }
}

// MARK: Downloads

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
        VStack(alignment: .leading, spacing: Space.s1) {
          Text(Str.downloadsOffTitle).textStyle(.base, weight: .semibold)
            .foregroundStyle(palette.foreground)
          Text(Str.downloadsOffDescription).textStyle(.sm).foregroundStyle(palette.mutedForeground)
        }
        // Android's 20 to the block under it, closer than a section.
        .padding(.bottom, Space.s5 - SETTINGS_SPACING)
      }
      ListBlock {
        ValueRow(
          Str.downloadsStorage, value: Str.downloadsStorageValue(total, storage?.free.map(formatBytes) ?? "–"))
        if !off {
          SwitchRow(Str.downloadsUnmetered, isOn: $downloads.unmeteredOnly)
        }
      }
      if !off {
        // What an encoded download comes in: of the server's codecs, those this device decodes.
        let codecs = Capabilities.encodeVideoChoices(
          server: loaded?.videoCodecs ?? [TranscodeVideoCodec.h264], snapshot: Device.capabilities)
        // What the download sheet starts on; the note is the codec's, so it goes with it.
        ListSection(Str.downloadsDefaults, footer: codecs.count > 1 ? Str.downloadsCodecNote : nil) {
          ChoiceRow(
            Str.downloadsDefaultTitle, selection: $downloads.defaultVersion,
            options: [(DEFAULT_DEVICE, Str.downloadsChoiceDevice)]
              + (loaded?.downloadVideoPresets ?? []).map {
                ("\($0.height)", ungrouped(Str.downloadsChoicePreset($0.height, mbps($0.bitrate, locale: .app)), $0.height))
              } + [(DEFAULT_ORIGINAL, Str.downloadsChoiceOriginal)])
          ChoiceRow(
            Str.downloadsDefaultSubtitles, selection: $downloads.subtitles,
            options: [
              (DownloadSubtitles.used, Str.downloadsSubtitlesUsed), (.all, Str.downloadsSubtitlesAll),
              (.none, Str.downloadsSubtitlesNone),
            ])
          if codecs.count > 1 {
            ChoiceRow(
              Str.downloadsCodec, current: codecs.contains(downloads.videoCodec) ? downloads.videoCodec : AUTOMATIC,
              options: [(AUTOMATIC, Str.playbackCodecAutomatic(videoCodecName("h264")))]
                + codecs.map { ($0, videoCodecName($0)) }
            ) { downloads.videoCodec = $0 }
          }
        }
      }
      if !items.isEmpty {
        ListBlock {
          ListRow(Str.downloadsRemoveAll, destructive: true) { confirm = true }
        }
      }
    }
    .loads(options) { api in try await api.playback.options() }
    .onChange(of: loaded) { _, value in if let value { viewer?.options = value } }
    // Again as files come and go, and as they grow.
    .task(id: items.values.reduce(Int64(items.count)) { $0 + $1.bytes }) {
      storage = await downloads.store.storage()
    }
    .confirmDialog(
      isPresented: $confirm, title: Str.downloadsRemoveAllConfirm, message: Str.downloadsRemoveAllBody(total),
      confirm: Str.commonRemove
    ) {
      let downloads = downloads
      launchShowing(snackbar, Str.downloadsFailed) { try await downloads.removeAll() }
    }
  }
}
