import MatineeCore
import SwiftUI
import UIKit

/*
 * PlayerScreen.kt and PlayerActivity.kt. The shell presents the player over
 * everything, in the dark theme, in landscape on a phone, without the status
 * bar and with the home indicator tucked away (`PlayerCover` in Nav.swift);
 * it leaves with `@Environment(\.dismiss)`, and the shell turns the screen
 * back. `PlayerController` (MatineeCore/Player) plays; this draws it and
 * makes the calls its README's Lifecycle lists at their moments.
 *
 * The pieces are beside it: the video and picture in picture
 * (PlayerVideo.swift), the controls and seek bar (PlayerControls.swift),
 * the menus (PlayerMenus.swift), the subtitles (PlayerSubtitles.swift), and
 * the notes over the video (PlayerNotes.swift).
 */

/// What plays: a file, from where the person left off or from `start`
/// seconds. Each is a sitting of its own, which asks anew.
private struct PlayTarget: Hashable {
  let itemId: String
  let start: Double?
  let sitting = UUID()
}

/// Plays `itemId` from where the person left off, or from `start` seconds.
/// The next episode plays in its place, as Android's activity changes its
/// target and `key(playing)` makes a new player for it.
struct PlayerScreen: View {
  let itemId: String
  let start: Double?
  @State private var target: PlayTarget

  init(itemId: String, start: Double?) {
    self.itemId = itemId
    self.start = start
    _target = State(initialValue: PlayTarget(itemId: itemId, start: start))
  }

  var body: some View {
    PlayerSitting(itemId: target.itemId, start: target.start) { next in
      target = PlayTarget(itemId: next, start: 0)
    }
    .id(target)
  }
}

/// How long the controls stay after the last touch while it plays.
let HIDE_AFTER_MS = 3500

/// One sitting with a file: the controller made and started as it shows,
/// stopped as it goes, with the last report sent.
private struct PlayerSitting: View {
  let itemId: String
  let start: Double?
  let playInstead: (String) -> Void
  @Environment(\.api) private var api
  @Environment(\.offline) private var offline
  @Environment(\.user) private var user
  @Environment(\.dismiss) private var dismiss
  @Environment(MatineeSession.self) private var session
  @Environment(Downloads.self) private var downloads
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @State private var controller: PlayerController?
  @State private var prefs = PlayerPrefs()
  /// The sign-in it opened in; another server or account closes it, as on Android.
  @State private var made: Int?

  var body: some View {
    ZStack {
      Color.black.ignoresSafeArea()
      if let controller {
        Playback(controller: controller, prefs: prefs, close: { dismiss() })
      }
    }
    .task { await open() }
    .onDisappear(perform: close)
    .onChange(of: session.version) { _, version in
      if let made, made != version { dismiss() }
    }
  }

  private func open() async {
    guard controller == nil, let api else { return }
    made = session.version
    let device = playbackDevice(prefs)
    let session = session
    // The token for the session's server, which is the API's; the controller
    // sends it only to that server.
    let token: @Sendable () async -> String? = { @MainActor in
      session.playerHeaders()["Authorization"].map { String($0.dropFirst("Bearer ".count)) }
    }
    let saved = try? downloads.playback(itemId)
    let server = saved?.entry.server ?? session.activeServer ?? api.base.absoluteString
    let player = PlayerController(
      api: api, device: device, prefs: prefs, tokenProvider: token,
      downloads: ServerPlayerDownloads(downloads: downloads, server: server, api: offline ? nil : api),
      preferences: user?.playback ?? DEFAULT_PLAYBACK_PREFERENCES)
    player.onNext = { next in playInstead(next.id) }
    player.sceneDidBecomeActive()
    controller = player
    guard saved != nil else {
      await player.start(itemId: itemId, at: start)
      return
    }
    // A download plays from the device. Online, the server says where the
    // person got to, which may be past what the download remembers.
    var at = start
    if at == nil, !offline, let fresh = try? await api.media.get(id: itemId), let progress = fresh.progress {
      at = progress.completed ? 0 : progress.positionSeconds
    }
    await player.startLocal(itemId: itemId, at: at)
  }

  private func close() {
    guard let controller else { return }
    let viewer = viewer
    Task {
      await controller.stop()
      // Home's Continue watching and the title pages fetch again.
      viewer?.changed()
    }
  }
}

/// The video, the subtitles, the gestures, and everything over them.
private struct Playback: View {
  let controller: PlayerController
  let prefs: PlayerPrefs
  let close: () -> Void
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
  @Environment(\.palette) private var palette
  @State private var controls = true
  @State private var menu: PlayerMenu?
  @State private var touched = 0
  @State private var fill: Bool
  /// Counts pinches that switched, so the note shows again for each.
  @State private var zoomNote = 0
  /// This pinch switched already, so it switches once.
  @State private var pinched = false
  @FocusState private var focused: Bool

  init(controller: PlayerController, prefs: PlayerPrefs, close: @escaping () -> Void) {
    self.controller = controller
    self.prefs = prefs
    self.close = close
    _fill = State(initialValue: prefs.fillScreen)
  }

  private var back: Double { Double(controller.preferences.skipBack) }
  private var ahead: Double { Double(controller.preferences.skipForward) }
  private var inPip: Bool { controller.pictureInPictureActive }

  var body: some View {
    GeometryReader { outer in
      let safe = outer.safeAreaInsets
      let screen = CGSize(
        width: outer.size.width + safe.leading + safe.trailing, height: outer.size.height + safe.top + safe.bottom)
      let rect = videoRect(aspect: controller.videoAspect, in: screen, fill: fill)
      let visible = rect.intersection(CGRect(origin: .zero, size: screen))
      ZStack {
        ZStack {
          Color.black
          VideoSurface(controller: controller, fill: fill, autoPicture: prefs.pictureInPicture && controller.playing)
          Subtitles(
            controller: controller, look: subtitleLook(prefs), lifted: controls && !inPip, video: visible,
            screen: screen, safeBottom: safe.bottom)
          touches(width: screen.width)
        }
        .ignoresSafeArea()
        overlays(safe: safe)
      }
    }
    .focusable()
    .focused($focused)
    .focusEffectDisabled()
    .onKeyPress(phases: .down, action: key)
    .onAppear { focused = true }
    .task(id: HideKey(controls, controller.playing, menu, controller.scrubPosition != nil, touched, voiceOver)) {
      // VoiceOver reads the controls one by one, so they stay until asked away.
      guard controls, controller.playing, menu == nil, controller.scrubPosition == nil, !voiceOver else { return }
      try? await Task.sleep(for: .milliseconds(HIDE_AFTER_MS))
      guard !Task.isCancelled else { return }
      withMotion(Motion.exit) { controls = false }
    }
    .onChange(of: scenePhase) { _, phase in
      switch phase {
      case .background: controller.sceneDidEnterBackground()
      case .active: controller.sceneDidBecomeActive()
      default: break
      }
    }
    // The screen stays on while it plays, and sleeps again when paused, as Android's window flag.
    .onChange(of: controller.playing, initial: true) { _, playing in
      UIApplication.shared.isIdleTimerDisabled = playing
    }
    .onDisappear {
      UIApplication.shared.isIdleTimerDisabled = false
      TrickplayTiles.shared.clear()
    }
    // The lock screen and Control Center name it in the app's language, "Episode 4" for an untitled one.
    .onChange(of: controller.item?.id, initial: true) {
      if let item = controller.item { controller.enableNowPlaying(title: itemLabel(item).title) }
    }
  }

  /// Taps show and hide the controls; a double tap on either side skips;
  /// spreading two fingers fills the screen, and pinching shows it whole.
  /// VoiceOver gets the tap as this area's one action.
  private func touches(width: CGFloat) -> some View {
    Color.clear
      .contentShape(Rectangle())
      .onTapGesture(count: 2, coordinateSpace: .local) { point in
        let step = point.x < width / 2 ? -back : ahead
        Task { await controller.skip(step) }
        touched += 1
      }
      .onTapGesture { toggleControls() }
      .simultaneousGesture(
        MagnifyGesture()
          .onChanged { value in
            let zoom = value.magnification
            let want: Bool? = zoom > PINCH_FILL ? true : zoom < 1 / PINCH_FILL ? false : nil
            if !pinched, let want, want != fill {
              pinched = true
              fill = want
              prefs.fillScreen = want
              zoomNote += 1
            }
          }
          .onEnded { _ in pinched = false }
      )
      .accessibilityElement()
      .accessibilityLabel(Str.a11yPlayerVideo)
      .accessibilityAddTraits(.isButton)
      .accessibilityHint(controls ? Str.a11yPlayerHideControls : Str.a11yPlayerShowControls)
      .accessibilityAction { toggleControls() }
  }

  private func toggleControls() {
    withMotion(controls ? Motion.exit : Motion.enter) { controls.toggle() }
    touched += 1
  }

  @ViewBuilder private func overlays(safe: EdgeInsets) -> some View {
    // Up top, clear of the play button in the middle.
    VStack(spacing: 8) {
      ZoomNote(count: zoomNote, fill: fill)
      PlayerNoticeNote(controller: controller)
    }
    .padding(.top, 16)
    .padding(.horizontal, 24)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .allowsHitTesting(false)
    if controller.loading && controller.error == nil {
      ProgressView()
        .controlSize(.large)
        .tint(palette.foreground)
        .frame(width: 48, height: 48)
        .allowsHitTesting(false)
        .accessibilityLabel(Str.loadingInProgress)
    }
    if !inPip {
      if controller.item == nil {
        // Nothing to control before the server answers, but the way back.
        RoundIconButton(.arrowLeft, label: Str.playerBack, size: 52, iconSize: 26, background: .clear, action: close)
          .padding(.horizontal, 12)
          .padding(.vertical, 8)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      } else if controls || controller.ended {
        PlayerControls(
          controller: controller, close: close, onMenu: { menu = $0 },
          onTouch: { touched += 1 }
        )
        .transition(Motion.fade)
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
      }
      if let message = controller.error {
        ZStack {
          Color.black.opacity(0.8).ignoresSafeArea()
          failure(message)
        }
      }
      if controller.ended, let next = controller.next {
        UpNext(controller: controller, upcoming: next)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
          .transition(Motion.fade)
          .dynamicTypeSize(...DynamicTypeSize.accessibility2)
      }
    }
    PlayerPanel(open: menu, controller: controller, safe: safe) { menu = nil }
  }

  @ViewBuilder private func failure(_ message: String) -> some View {
    if let refusal = controller.refusal {
      // Asking again gets the same answer, so there's nothing to try.
      PlayerFailure(title: refusalTitle(refusal), message: message, retry: nil, close: close)
    } else if controller.unplayable {
      PlayerFailure(title: Str.playerErrorLost, message: Str.playerUnplayable, retry: retry, close: close)
    } else {
      // The opening failed before anything played, as Android's page failing to load.
      PlayerFailure(
        title: controller.item == nil ? Str.playerLoadFailed : Str.playerErrorLost, message: message, retry: retry,
        close: close)
    }
  }

  private func retry() { Task { await controller.retry() } }

  /// Keyboards: space plays and pauses, the arrows skip, and the rest
  /// bring the controls back. Escape closes a menu, then the player.
  private func key(_ press: KeyPress) -> KeyPress.Result {
    touched += 1
    if press.key == .escape {
      if menu != nil { menu = nil } else { close() }
      return .handled
    }
    if menu != nil { return .ignored }
    switch press.key {
    case .space: controller.togglePlay()
    case .leftArrow: Task { await controller.skip(-back) }
    case .rightArrow: Task { await controller.skip(ahead) }
    case .upArrow, .downArrow, .return:
      guard !controls else { return .ignored }
      withMotion(Motion.enter) { controls = true }
    default: return .ignored
    }
    return .handled
  }
}

/// How far two fingers spread, or pinch by its inverse, before the video switches.
private let PINCH_FILL: CGFloat = 1.15

/// What the controls' hiding waits on: any change starts the wait again.
private struct HideKey: Equatable {
  let controls: Bool
  let playing: Bool
  let menu: PlayerMenu?
  let scrubbing: Bool
  let touched: Int
  let voiceOver: Bool
  init(_ controls: Bool, _ playing: Bool, _ menu: PlayerMenu?, _ scrubbing: Bool, _ touched: Int, _ voiceOver: Bool) {
    self.controls = controls
    self.playing = playing
    self.menu = menu
    self.scrubbing = scrubbing
    self.touched = touched
    self.voiceOver = voiceOver
  }
}
