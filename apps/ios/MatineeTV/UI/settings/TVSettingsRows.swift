import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvSettingsRows.kt: Playback, Subtitles, Languages, and Appearance on a
 * TV. What this TV keeps (quality, the engine, autoplay, the codecs encodes
 * come in, passthrough, how subtitles look, the color scheme) is
 * `PlayerPrefs` and `ThemeStore`, on this TV only; the skip lengths, the
 * languages, and specials are the account's, saved to the server for
 * every device it watches on.
 *
 * Left out, beside the phone's: Android TV's frame rate switch, which
 * tvOS keeps itself (Settings › Video and Audio › Match Content, which
 * AVPlayer and mpv's video layer follow), and its decoder choice, which
 * AVPlayer makes on its own and mpv makes with VideoToolbox. The player's
 * swipes, hold for speed, brightness, and on-screen buttons are a touch
 * screen's, so they aren't here either.
 */

// MARK: Playback

/// What this TV plays and how, then the account's skip lengths, the
/// codecs for encodes, and passthrough, as Android TV's Playback.
struct PlaybackRows: View {
  let focus: FocusState<String?>.Binding
  @State private var options = Loader<PlaybackOptions>()
  @State private var save = TVPlaybackSave()
  @Environment(\.user) private var user
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar
  @Environment(MatineeSession.self) private var session
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    @Bindable var prefs = PlayerPrefs.shared
    let loaded = options.state.value
    let playback = save.shown(user)
    let change = { (edit: (inout PlaybackPreferences) -> Void) in
      save.change(user, api: api, session: session, snackbar: snackbar, edit)
    }
    // The qualities this account may stream, once `playback.options` answers.
    let qualities =
      [TVOption(ORIGINAL_QUALITY, Str.playerQualityOriginal)]
      + (loaded?.qualities ?? []).map { TVOption($0.id, qualityLabel($0)) }
    // One the account may no longer use shows as the original, the best the server
    // allows; it stays saved, so a lifted limit brings it back.
    let quality = loaded == nil || qualities.contains { $0.value == prefs.quality } ? prefs.quality : ORIGINAL_QUALITY
    SettingsColumn {
      TVListHeading(Str.tvSettingsThisTv)
      SettingsChoice(
        Str.playbackQualityTitle, subtitle: loaded?.maxBitrate.map { Str.playbackQualityLimit(formatBitrate($0)) },
        options: qualities, current: quality
      ) { prefs.quality = $0 }
      .focused(focus, equals: FIRST_ROW)
      // The engines' own names, the same in every language.
      SettingsChoice(
        Str.playbackEngineTitle, options: [TVOption(PlayerEngine.mpv, "mpv"), TVOption(.avPlayer, "AVPlayer")],
        current: prefs.engine
      ) { prefs.engine = $0 }
      .focused(focus, equals: "engine")
      SettingsSwitch(Str.playbackAutoplayTitle, isOn: prefs.autoplayNext) { prefs.autoplayNext = $0 }
        .focused(focus, equals: "autoplay")

      SettingsGap()
      TVListHeading(Str.playbackSkipTitle)
      SettingsChoice(
        Str.playbackSkipBack, options: skipOptions(playback.skipBack, loaded), current: playback.skipBack
      ) { value in change { $0.skipBackSeconds = value } }
      .focused(focus, equals: "skipBack")
      SettingsChoice(
        Str.playbackSkipForward, options: skipOptions(playback.skipForward, loaded), current: playback.skipForward
      ) { value in change { $0.skipForwardSeconds = value } }
      .focused(focus, equals: "skipForward")

      TranscodingRows(prefs: prefs, options: loaded, focus: focus)
      let passthrough = Capabilities.passthrough(TVDevice.capabilities, engine: prefs.engine)
      if !passthrough.isEmpty {
        SettingsGap()
        TVListHeading(Str.playbackPassthroughTitle)
        ForEach(passthrough, id: \.self) { codec in
          SettingsSwitch(audioFormatName(codec), isOn: !prefs.convertAudio.contains(codec)) { on in
            if on { prefs.convertAudio.remove(codec) } else { prefs.convertAudio.insert(codec) }
          }
          .focused(focus, equals: "passthrough-\(codec)")
        }
      }
    }
    .loads(options) { api in try await api.playback.options() }
    .onChange(of: loaded) { _, value in if let value { viewer?.options = value } }
  }
}

/// The codecs the server converts to when this TV can't play a file as it
/// is, each only when there's a choice: what the server encodes and this TV decodes.
private struct TranscodingRows: View {
  @Bindable var prefs: PlayerPrefs
  let options: PlaybackOptions?
  let focus: FocusState<String?>.Binding

  var body: some View {
    let video = Capabilities.encodeVideoChoices(
      server: options?.videoCodecs ?? [TranscodeVideoCodec.h264], snapshot: TVDevice.capabilities)
    let audio = Capabilities.convertAudioCodecs(
      server: options?.audioCodecs ?? [TranscodeAudioCodec.aac], snapshot: TVDevice.capabilities)
    // The server may not encode video for this account, so there's no codec to pick for it.
    let noEncodes = options.map { $0.videoCodecs.isEmpty } ?? false
    if noEncodes || video.count > 1 || audio.count > 1 {
      SettingsGap()
      TVListHeading(Str.playbackTranscodingTitle)
      if noEncodes {
        SettingsFact(Str.playbackVideoCodecTitle, value: Str.playbackVideoCodecNone)
          .focused(focus, equals: "videoCodec")
      } else if video.count > 1 {
        SettingsChoice(
          Str.playbackVideoCodecTitle,
          options: [TVOption(AUTOMATIC, Str.playbackCodecAutomatic(videoCodecName("h264")))]
            + video.map { TVOption($0, videoCodecName($0)) },
          current: video.contains(prefs.videoCodec) ? prefs.videoCodec : AUTOMATIC
        ) { prefs.videoCodec = $0 }
        .focused(focus, equals: "videoCodec")
      }
      if audio.count > 1 {
        SettingsChoice(
          Str.playbackAudioCodecTitle,
          options: [TVOption(AUTOMATIC, Str.playbackCodecAutomatic(audioFormatName(audio[0])))]
            + audio.map { TVOption($0, audioFormatName($0)) },
          current: audio.contains(prefs.audioCodec) ? prefs.audioCodec : AUTOMATIC
        ) { prefs.audioCodec = $0 }
        .focused(focus, equals: "audioCodec")
      }
      SettingsNote(noEncodes ? Str.playbackTranscodingNoEncodes : Str.tvSettingsTranscodingNote)
    }
  }
}

// MARK: Subtitles

/// How subtitles look on this TV, over a sample that changes as they do:
/// the TV's own caption style, or the app's choices, the size stepping
/// with Left and Right.
struct SubtitleRows: View {
  let focus: FocusState<String?>.Binding
  let focused: String?
  /// Keeps focus on the row with this key through the Left it steps with.
  let hold: (String) -> Void

  var body: some View {
    @Bindable var prefs = PlayerPrefs.shared
    SettingsColumn {
      SubtitleSample(look: subtitleLook(prefs))
        .padding(.horizontal, TVListItems.inset)
        .padding(.bottom, TVSpace.s5)
      SettingsSwitch(Str.settingsSubtitlesSystem, isOn: prefs.subtitleSystemStyle) { prefs.subtitleSystemStyle = $0 }
        .focused(focus, equals: FIRST_ROW)
      if prefs.subtitleSystemStyle {
        // tvOS keeps the caption style where no app can open it, so the row says where.
        SettingsFact(Str.settingsSubtitlesSystemOpen, subtitle: Str.iosSettingsSubtitlesSystemWhere)
          .focused(focus, equals: "systemWhere")
      } else {
        let scales = SUBTITLE_SCALES
        let at = scales.firstIndex(of: prefs.subtitleScale) ?? scales.firstIndex(of: 1) ?? 0
        let step = { (by: Int) in prefs.subtitleScale = scales[min(max(at + by, 0), scales.count - 1)] }
        TVStepRow(prefs.subtitleScale.formatted(.percent.locale(.app)), title: Str.settingsSubtitlesSize, onStep: step)
          .focused(focus, equals: "size")
          // Right steps by the row's own move command, as nothing is right of it. Left would
          // leave for the categories as well as step: it steps here, and the page holds focus.
          .onTVPress([.left], isEnabled: focused == "size") { _, phase in
            if phase == .began {
              hold("size")
              step(-1)
            }
          }
        SettingsChoice(
          Str.settingsSubtitlesColor,
          options: [SubtitleColor.white, .yellow, .cyan, .green].map { TVOption($0, subtitleColorLabel($0)) },
          current: prefs.subtitleColor
        ) { prefs.subtitleColor = $0 }
        .focused(focus, equals: "color")
        SettingsChoice(
          Str.settingsSubtitlesBackground,
          options: [SubtitleBackground.none, .shaded, .black].map { TVOption($0, subtitleBackgroundLabel($0)) },
          current: prefs.subtitleBackground
        ) { prefs.subtitleBackground = $0 }
        .focused(focus, equals: "background")
        SettingsChoice(
          Str.settingsSubtitlesEdge, options: OWN_SUBTITLE_EDGES.map { TVOption($0, subtitleEdgeLabel($0)) },
          current: prefs.subtitleEdge
        ) { prefs.subtitleEdge = $0 }
        .focused(focus, equals: "edge")
      }
    }
  }
}

/// The sample's frame: a film's 2.39:1 across the rows' width.
private let SAMPLE_ASPECT: CGFloat = 2.39

/// A line of subtitles over a stand-in for a bright frame, drawn by the
/// player's own line (Matinee/UI/player/PlayerSubtitles.swift), at the
/// size the TV's player draws a cue across a frame this wide.
private struct SubtitleSample: View {
  let look: SubtitleLook
  @Environment(\.palette) private var palette

  var body: some View {
    LinearGradient(
      colors: [RGB(0x9DB3D1).color, RGB(0x55657F).color, RGB(0x2B2622).color, RGB(0x6E5A45).color],
      startPoint: .topLeading, endPoint: .bottomTrailing
    )
    .aspectRatio(SAMPLE_ASPECT, contentMode: .fit)
    .frame(maxWidth: .infinity)
    .overlay(alignment: .bottom) {
      GeometryReader { proxy in
        // The player's size, a 19.5th of a 16:9 frame's height, for a frame this wide.
        SubtitleLine(cue: Cue(text: Str.settingsSubtitlesPreview), look: look, size: proxy.size.width * 9 / 16 / 19.5)
          .padding(.horizontal, TVSpace.s6)
          .padding(.bottom, proxy.size.height * 0.08)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
      }
    }
    .clipShape(RoundedRectangle.kit(TVRadius.lg))
    .overlay { RoundedRectangle.kit(TVRadius.lg).strokeBorder(palette.border, lineWidth: 2) }
    .accessibilityElement(children: .combine)
  }
}

// MARK: Languages

/// The account's languages, which every device of the account plays by,
/// and whether a show's specials list with its seasons.
struct LanguageRows: View {
  let focus: FocusState<String?>.Binding
  @State private var options = Loader<PlaybackOptions>()
  @State private var save = TVPlaybackSave()
  @State private var specials = TVSpecialsSave()
  @Environment(\.user) private var user
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar
  @Environment(MatineeSession.self) private var session
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    let loaded = options.state.value
    let playback = save.shown(user)
    let change = { (edit: (inout PlaybackPreferences) -> Void) in
      save.change(user, api: api, session: session, snackbar: snackbar, edit)
    }
    SettingsColumn {
      SettingsChoice(
        Str.playbackAudioTitle, options: audioLanguageOptions(loaded, current: playback.audioLanguage),
        current: playback.audioLanguage
      ) { value in change { $0.audioLanguage = value } }
      .focused(focus, equals: FIRST_ROW)
      SettingsChoice(
        Str.playbackSubtitlesTitle, options: SubtitleMode.knownValues.map { TVOption($0, subtitleModeLabel($0)) },
        current: playback.subtitleMode
      ) { value in change { $0.subtitleMode = value } }
      .focused(focus, equals: "subtitleMode")
      // With subtitles off, which language they'd be in doesn't matter.
      if playback.subtitleMode != SubtitleMode.off {
        SettingsChoice(
          Str.playbackSubtitlesLanguage, options: subtitleLanguageOptions(loaded, current: playback.subtitleLanguage),
          current: playback.subtitleLanguage
        ) { value in change { $0.subtitleLanguage = value } }
        .focused(focus, equals: "subtitleLanguage")
      }
      // The account keeps audio picks too, as the web's Playback settings offer.
      SettingsSwitch(Str.iosPlaybackAudioRemember, isOn: playback.rememberAudio ?? true) { on in
        change { $0.rememberAudio = on }
      }
      .focused(focus, equals: "rememberAudio")
      SettingsSwitch(Str.playbackSubtitlesRemember, isOn: playback.rememberSubtitles) { on in
        change { $0.rememberSubtitles = on }
      }
      .focused(focus, equals: "rememberSubtitles")
      SettingsSwitch(Str.playbackSpecialsTitle, isOn: specials.shown(user)) {
        specials.save($0, api: api, session: session, viewer: viewer, snackbar: snackbar)
      }
      .focused(focus, equals: "specials")
      SettingsNote(Str.tvSettingsLanguagesNote)
    }
    .loads(options) { api in try await api.playback.options() }
    .onChange(of: loaded) { _, value in if let value { viewer?.options = value } }
  }
}

// MARK: Appearance

/// The color scheme. A TV follows its own light or dark (Settings ›
/// General › Appearance) unless one is picked here; the accent is the
/// server's, and the language the TV's.
struct AppearanceRows: View {
  let focus: FocusState<String?>.Binding
  @Environment(ThemeStore.self) private var theme

  var body: some View {
    SettingsColumn {
      SettingsChoice(
        Str.webAppearanceColorScheme, options: ThemeMode.allCases.map { TVOption($0, themeModeLabel($0)) },
        current: theme.mode
      ) { mode in withMotion(Motion.color) { theme.setMode(mode) } }
      .focused(focus, equals: FIRST_ROW)
      SettingsFact(Str.webAppearanceLanguageTitle, value: languageName(Bundle.main.preferredLocalizations.first ?? "en"))
        .focused(focus, equals: "language")
      SettingsNote(Str.iosAppearanceLanguageDescription)
    }
  }
}
