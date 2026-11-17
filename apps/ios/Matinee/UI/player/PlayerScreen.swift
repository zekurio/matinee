import MatineeCore
import MatineeKit
import MatineeMPV
import SwiftUI
import UIKit

/*
 * PlayerScreen.kt and PlayerActivity.kt, drawn as the web player draws
 * itself on a touch screen (apps/web/src/components/video-player.tsx).
 * The shell presents the player over everything, landscape on a phone
 * (`PlayerCover` in Nav.swift); it leaves with `@Environment(\.dismiss)`,
 * and the shell turns the screen back. `PlayerController` (MatineeCore/
 * Player) plays; this draws it and makes the calls its README's Lifecycle
 * lists at their moments.
 *
 * The pieces are beside it: the video, picture in picture, and AirPlay
 * (PlayerVideo.swift), the controls (PlayerControls.swift) and seek bar
 * (PlayerSeekBar.swift), the menus (PlayerMenus.swift) and their choices
 * (PlayerMenuEntries.swift), the subtitles (PlayerSubtitles.swift), the
 * touches on the video
 * (PlayerGestures.swift), and what shows over the video besides the
 * controls (PlayerNotes.swift).
 */

/// What plays: a file, from where the person left off or from `start`
/// seconds. Each is a sitting of its own, which asks anew.
private struct PlayTarget: Hashable {
  let itemId: String
  let start: Double?
  let sitting = UUID()
}

/// Plays `itemId` from where the person left off, or from `start` seconds.
/// The next or previous episode plays in its place, as Android's activity
/// changes its target and `key(playing)` makes a new player for it.
struct PlayerScreen: View {
  let itemId: String
  let start: Double?
  @State private var target: PlayTarget
  @Environment(ThemeStore.self) private var themeStore

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
    .forceDarkTheme(themeStore)
    .background(Color.black.ignoresSafeArea())
    // No status bar, the home indicator tucked away, and a swipe from the
    // top or bottom edge asked twice, so a swipe on the video stays the player's.
    .statusBarHidden()
    .persistentSystemOverlays(.hidden)
    .defersSystemGestures(on: .vertical)
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
  /// The sign-in it opened in; another server or account closes it, as on Android.
  @State private var made: Int?
  private let prefs = PlayerPrefs.shared

  var body: some View {
    ZStack {
      Color.black.ignoresSafeArea()
      if let controller {
        Playback(controller: controller, prefs: prefs, close: { dismiss() })
      } else {
        // Nothing to control before the controller exists, but the way back.
        BackOnly(close: { dismiss() })
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
    let engine = PlayerDebug.engine ?? prefs.engine
    let player = PlayerController(
      api: api, device: device, prefs: prefs, tokenProvider: token,
      downloads: ServerPlayerDownloads(downloads: downloads, server: server, api: offline ? nil : api),
      preferences: user?.playback ?? DEFAULT_PLAYBACK_PREFERENCES, offline: offline,
      playbackEngine: engine == .mpv ? MPVPlaybackEngine() : nil)
    player.onNext = { next in playInstead(next.id) }
    player.sceneDidBecomeActive()
    controller = player
    guard saved != nil else {
      await player.start(itemId: itemId, at: start)
      await PlayerDebug.apply(to: player)
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

/// The video, the subtitles, the touches on it, and everything over them.
private struct Playback: View {
  let controller: PlayerController
  let prefs: PlayerPrefs
  let close: () -> Void
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var controls = !PlayerDebug.flag("hidden")
  /// Locked, touches on the screen do nothing; only the corner unlocks.
  @State private var locked = PlayerDebug.flag("locked")
  @State private var menu: PlayerMenu? = PlayerDebug.menu
  /// The menu that was open stays drawn while its panel slides away.
  @State private var shownMenu: PlayerMenu = PlayerDebug.menu ?? .audio
  @State private var touched = 0
  @State private var fill: Bool
  /// Counts pinches that switched, so the note shows again for each.
  @State private var zoomNote = 0
  @State private var gestures = GestureState()
  @State private var levels = DeviceLevels()
  @State private var pip = PictureInPictureModel()
  /// How far up from the screen's bottom edge the controls reach, which the
  /// subtitles and the skip button rise above while they show.
  @State private var controlsTop: CGFloat = 0
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
  /// The controls show: asked for, or the file ended, unless locked or failed.
  private var controlsShown: Bool {
    (controls || controller.ended || PlayerDebug.flag("controls")) && !locked && controller.error == nil
      && controller.item != nil && !inPip
  }

  var body: some View {
    GeometryReader { outer in
      let safe = outer.safeAreaInsets
      let screen = CGSize(
        width: outer.size.width + safe.leading + safe.trailing, height: outer.size.height + safe.top + safe.bottom)
      let rect = videoRect(aspect: controller.videoAspect, in: screen, fill: fill && !inPip)
      let visible = rect.intersection(CGRect(origin: .zero, size: screen))
      ZStack {
        ZStack {
          Color.black
          video
          VideoTouches(
            controller: controller, prefs: prefs, levels: levels, state: gestures, insets: safe,
            allowed: controller.error == nil && menu == nil && !locked, controlsShown: controlsShown,
            onTap: toggleControls,
            onDoubleTap: { forward in
              Task { await controller.skip(forward ? ahead : -back) }
              touched += 1
            },
            onStart: { kind in
              // A seek's note sits where the play button is.
              if kind == .seek { hideControls() }
              touched += 1
            },
            onPinch: { want in
              fill = want
              prefs.fillScreen = want
              zoomNote += 1
            })
          VolumeHost(levels: levels)
        }
        .ignoresSafeArea()
        overlays(screen: screen, safe: safe)
        // Over the shades, so the controls never dim them; they take no touches.
        Subtitles(
          controller: controller, look: subtitleLook(prefs), lift: controlsShown ? controlsTop : nil,
          video: visible, screen: screen, safeBottom: safe.bottom
        )
        .ignoresSafeArea()
      }
    }
    .sidePanel(isPresented: menuOpen, title: shownMenu.title) {
      PlayerMenuPanel(menu: shownMenu, controller: controller)
    }
    .dynamicTypeSize(...DynamicTypeSize.accessibility2)
    .focusable()
    .focused($focused)
    .focusEffectDisabled()
    .onKeyPress(phases: .down, action: key)
    .onAppear {
      focused = true
      // The brightness the last swipe left, when settings keep it.
      if prefs.swipeLevels, prefs.rememberBrightness, (0...1).contains(prefs.brightness) {
        levels.setBrightness(prefs.brightness)
      }
    }
    .task(id: HideKey(controls, controller.playing, menu, controller.scrubPosition != nil, touched, voiceOver, gestures.kind))
    {
      // VoiceOver reads the controls one by one, so they stay until asked away.
      guard controls, controller.playing, menu == nil, controller.scrubPosition == nil, !voiceOver, gestures.kind == nil
      else { return }
      try? await Task.sleep(for: .milliseconds(HIDE_AFTER_MS))
      guard !Task.isCancelled else { return }
      hideControls()
    }
    .onChange(of: menu) { _, open in if let open { shownMenu = open } }
    .onChange(of: controller.duration > 0) { _, known in
      // A seek swipe's note held for a screenshot lands a minute and a half on.
      guard known, PlayerDebug.gesture == .seek else { return }
      gestures.from = controller.position
      gestures.target = min(controller.duration, controller.position + 95)
    }
    .onChange(of: scenePhase) { _, phase in
      switch phase {
      case .background:
        controller.sceneDidEnterBackground()
        levels.restore()
      case .active:
        controller.sceneDidBecomeActive()
        levels.reapply()
      default: break
      }
    }
    // The screen stays on while it plays, and sleeps again when paused, as Android's window flag.
    .onChange(of: controller.playing, initial: true) { _, playing in
      UIApplication.shared.isIdleTimerDisabled = playing
    }
    .onChange(of: controller.error) { PlayerDebug.save(controller.diagnostics) }
    .task {
      #if DEBUG
        while !Task.isCancelled {
          PlayerDebug.save(controller.diagnostics)
          try? await Task.sleep(for: .seconds(2))
        }
      #endif
    }
    .onDisappear {
      PlayerDebug.save(controller.diagnostics)
      UIApplication.shared.isIdleTimerDisabled = false
      levels.restore()
      TrickplayTiles.shared.clear()
      controller.endHold()
    }
    // The lock screen and Control Center name it in the app's language, "Episode 4" for an untitled one.
    .onChange(of: controller.item?.id, initial: true) {
      if let item = controller.item { controller.enableNowPlaying(title: itemLabel(item).title) }
    }
  }

  @ViewBuilder private var video: some View {
    if let engine = controller.playbackEngine as? MPVPlaybackEngine {
      // mpv fits or fills the video itself, its own subtitles with it.
      MPVPlaybackSurface(engine: engine, fill: fill && !inPip)
    } else {
      VideoSurface(
        controller: controller, pip: pip, fill: fill && !inPip,
        autoPicture: prefs.pictureInPicture && controller.playing)
    }
  }

  private var menuOpen: Binding<Bool> {
    Binding(get: { menu != nil }, set: { if !$0 { menu = nil } })
  }

  private func toggleControls() {
    let show = !controls
    withMotion(show ? Motion.enter : Motion.exit) { controls = show }
    touched += 1
  }

  private func hideControls() {
    withMotion(Motion.exit) { controls = false }
  }

  @ViewBuilder private func overlays(screen: CGSize, safe: EdgeInsets) -> some View {
    let fade = Motion.animation(Motion.enter, reduceMotion: reduceMotion)
    // Up top, clear of the play button in the middle.
    VStack(spacing: Space.s2) {
      ZoomNote(count: zoomNote, fill: fill)
      PlayerNoticeNote(controller: controller)
      if controller.holding { HoldNote().transition(.opacity) }
    }
    .padding(.top, Space.s4)
    .padding(.horizontal, Space.s6)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .animation(fade, value: controller.holding)
    .allowsHitTesting(false)
    if !inPip { GestureNotes(state: gestures, controller: controller) }
    if controller.loading && controller.error == nil {
      // The web's spinner, `size-10 text-white/85`, where the play button is.
      Spinner(size: 40, tint: .white.opacity(0.85))
        .allowsHitTesting(false)
    }
    if !inPip {
      if controlsShown {
        PlayerControls(
          controller: controller, prefs: prefs, pip: pip, close: close,
          onMenu: { menu = $0 }, onTouch: { touched += 1 },
          onLock: prefs.lockButton
            ? {
              locked = true
              hideControls()
            } : nil,
          controlsTop: $controlsTop, screenHeight: screen.height
        )
        .transition(.opacity)
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
      }
      // How far the last skips went, a quarter of the way down as the
      // web's note, clear of the top bar and of play in the middle.
      SkipFlashNote(flash: controller.skipFlash)
        .padding(.top, max(0, screen.height * 0.25 - safe.top))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
      // Clear of the controls while they show. Held sideways, a phone has
      // no room above the seek bar for the card beside the play button, so
      // while the controls show it's a row of its buttons beside the skip.
      let compact = controlsShown && screen.height < 500
      let column = compact ? AnyLayout(HStackLayout(alignment: .center, spacing: Space.s3))
        : AnyLayout(VStackLayout(alignment: .trailing, spacing: Space.s3))
      column {
        if !locked, controller.error == nil { SkipSegmentButton(controller: controller, controls: controlsShown) }
        if controller.showsUpNext, !locked { UpNextCard(controller: controller, compact: compact) }
      }
      .padding(.trailing, Space.s5)
      .padding(.bottom, controlsShown ? max(0, controlsTop - safe.bottom) + Space.s4 : Space.s6)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
      .animation(Motion.animation(Motion.move, reduceMotion: reduceMotion), value: controlsShown)
      .animation(fade, value: controller.showsUpNext)
      .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
      if let message = controller.error {
        failure(message)
      }
      // Over everything else, so no touch reaches what's under it. It
      // steps aside while an error shows, so its buttons stay in reach.
      if locked && controller.error == nil {
        LockedScreen(
          keep: voiceOver || PlayerDebug.flag("locked"),
          onUnlock: {
            locked = false
            withMotion(Motion.enter) { controls = true }
            touched += 1
          })
      }
    }
  }

  @ViewBuilder private func failure(_ message: String) -> some View {
    if let refusal = controller.refusal {
      // Asking again gets the same answer, so there's nothing to try.
      PlayerFailure(
        title: refusalTitle(refusal), message: refusalMessage(controller.refusalReason, fallback: message), retry: nil,
        close: close)
    } else if controller.unplayable {
      PlayerFailure(title: Str.playerErrorLost, message: Str.playerUnplayable, retry: retry, close: close)
    } else {
      // The opening failed before anything played, as Android's page failing
      // to load. The server out of reach blamed no method, so Try again asks
      // for the same.
      PlayerFailure(
        title: controller.item == nil ? Str.playerLoadFailed : Str.playerErrorLost,
        message: controller.outOfReach ? Str.errorUnreachable : message, retry: retry, close: close)
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
    if menu != nil || locked { return .ignored }
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

/// The way back alone, before there's anything to control.
private struct BackOnly: View {
  let close: () -> Void

  var body: some View {
    RoundIconButton(
      .arrowLeft, label: Str.playerBack, look: .ghost, size: 52, iconSize: 26, tint: .white.opacity(0.85), action: close
    )
    .frame(height: TOP_BAR_HEIGHT)
    .padding(.horizontal, Space.s3)
    .padding(.top, Space.s2)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

/// What the controls' hiding waits on: any change starts the wait again.
private struct HideKey: Equatable {
  let controls: Bool
  let playing: Bool
  let menu: PlayerMenu?
  let scrubbing: Bool
  let touched: Int
  let voiceOver: Bool
  let gesture: GestureKind?
  init(
    _ controls: Bool, _ playing: Bool, _ menu: PlayerMenu?, _ scrubbing: Bool, _ touched: Int, _ voiceOver: Bool,
    _ gesture: GestureKind?
  ) {
    self.controls = controls
    self.playing = playing
    self.menu = menu
    self.scrubbing = scrubbing
    self.touched = touched
    self.voiceOver = voiceOver
    self.gesture = gesture
  }
}
