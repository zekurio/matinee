import MatineeCore
import MatineeKit
import SwiftUI
import UIKit

/*
 * TvPlayback.kt: plays a file for the Siri Remote.
 *
 * With the controls away, the picture holds focus (`TVFocusSurface`):
 * Left and Right skip by the account's skip steps, and glide while held,
 * which brings the controls to show where to; Select, Up, Down, a swipe,
 * and a tap on the touch surface bring the controls; Play/Pause plays and
 * pauses at any time, and pausing brings the controls, as Apple TV's own
 * player does. With them up, focus starts on the seek bar, where
 * Left and Right go on skipping and gliding and a swipe scrubs, and Select
 * plays or pauses, as on Apple TV's own player; Down goes to the buttons.
 * Menu closes a menu, then the controls, then Skip intro or the next
 * episode alone on the picture, then the player. Any press keeps the
 * controls up a while longer; a menu or a scrub keeps them up.
 *
 * Skip intro and the next episode take focus as they appear while the
 * controls are away, as on Android TV, so Select presses them: a button a
 * remote can't reach without first bringing the controls is one nobody
 * presses. The arrows still skip, Up, Down, and a tap still bring the
 * controls, and Menu puts the button away, so taking focus costs Select
 * alone, and only while the button shows.
 */

/// How long the controls stay after the last press while it plays.
private let HIDE_AFTER: Duration = .milliseconds(3500)

/// How long a press must be held before it glides, and the controls come to show where to.
private let GLIDE_AFTER: Duration = .milliseconds(400)

struct TVPlayback: View {
  let controller: PlayerController
  let prefs: PlayerPrefs
  let close: () -> Void
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var controls = true
  @State private var menu: TVPlayerMenu? = TVPlayerDebug.menu
  /// The menu that was open stays drawn while its panel slides away.
  @State private var shownMenu: TVPlayerMenu = TVPlayerDebug.menu ?? .audio
  @State private var scrub = TVScrub()
  @State private var touched = 0
  /// A held arrow brought the controls, so focus goes to the seek bar.
  @State private var focusSeek = false
  /// Menu put the skip button away for the segment that plays.
  @State private var skipAway: String?
  @State private var skipMark: TVSkipMark?
  /// How far up from the bottom the controls reach.
  @State private var controlsTop: CGFloat = 0
  @FocusState private var focus: TVPlayerFocus?

  private var back: Double { Double(controller.preferences.skipBack) }
  private var ahead: Double { Double(controller.preferences.skipForward) }
  private var failed: Bool { controller.error != nil }

  /// The controls show: asked for, or the file ended with nothing after it.
  private var controlsShown: Bool {
    (controls || (controller.ended && controller.upNext == nil)) && !failed && controller.item != nil
  }

  /// The next episode while it's offered, else the segment's skip while
  /// its button shows: fresh, or with the controls.
  private func offer(controls: Bool) -> TVPictureAction? {
    if let upNext = controller.upNext, controller.offersNext, controls || controller.showsUpNext {
      return .next(upNext.item, seconds: controller.nextCountdown)
    }
    if let segment = controller.skippable(controls: controls) {
      let action = TVPictureAction.skip(segment)
      if !controls, skipAway == action.key { return nil }
      return action
    }
    return nil
  }

  /// What shows alone on the picture while the controls are away.
  private var pictureAction: TVPictureAction? {
    controlsShown || failed || menu != nil ? nil : offer(controls: false)
  }

  /// The arrows move the seek bar's head: with the controls away, on the seek bar, or through a press still held.
  private var arrowsSeek: Bool {
    menu == nil && !failed && controller.item != nil && seekable(controller.duration)
      && (!controlsShown || focus == .seek || scrub.target != nil)
  }

  var body: some View {
    GeometryReader { proxy in
      let screen = proxy.size
      let fill = prefs.fillScreen
      let rect = tvVideoRect(aspect: controller.videoAspect, in: screen, fill: fill)
      ZStack {
        TVVideo(controller: controller, fill: fill)
        // With the controls away, the picture holds focus.
        TVFocusSurface(action: showControls)
          .focused($focus, equals: .surface)
          .disabled(controlsShown || failed)
          .onMoveCommand { _ in if !controlsShown { showControls() } }
        if controller.loading && !failed {
          Spinner(size: 80, tint: .white.opacity(0.85)).allowsHitTesting(false)
        }
        TVSkipMarkView(mark: controlsShown ? nil : skipMark)
        if controlsShown {
          TVOverlay(
            controller: controller, focus: $focus, back: back, ahead: ahead, scrub: scrub.target,
            action: offer(controls: true), runAction: { run(offer(controls: true)) }, onSelectSeek: selectSeek,
            onMenu: openMenu, onTop: { controlsTop = $0 }
          )
          .transition(.opacity)
        }
        // Over the shade, so the controls never dim them; they rise clear of the controls.
        Subtitles(
          controller: controller, look: subtitleLook(prefs), lift: controlsShown ? controlsTop : nil,
          video: rect.intersection(CGRect(origin: .zero, size: screen)), screen: screen,
          safeBottom: TVOverscan.vertical
        )
        TVPlayerNoticeNote(controller: controller)
          .padding(TVOverscan.insets)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        if let action = pictureAction { corner(action) }
        if let message = controller.error { failure(message) }
      }
      .animation(Motion.animation(controlsShown ? Motion.enter : Motion.exit, reduceMotion: reduceMotion), value: controlsShown)
      .animation(Motion.animation(Motion.enter, reduceMotion: reduceMotion), value: pictureAction?.key)
    }
    .ignoresSafeArea()
    .background { TVDisplayMode(controller: controller) }
    .tvSidePanel(isPresented: menuOpen, title: shownMenu.title) {
      TVMenuRows(menu: shownMenu, controller: controller, prefs: prefs)
    }
    .onTVPlayPause {
      touched += 1
      // Paused, the controls come to say so and where it stopped, as on Apple TV's own player.
      if controller.playing, !controlsShown, !failed { showControls() }
      controller.togglePlay()
    }
    .onTVPress([.left, .right], isEnabled: arrowsSeek, perform: arrow)
    .onTVPress([.up, .down], isEnabled: menu == nil && !failed && (!controlsShown || focus == .seek)) { button, phase in
      guard phase == .began else { return }
      touched += 1
      if !controlsShown {
        showControls()
      } else if button == .down {
        // Down from the seek bar goes to play, not to whatever sits under the bar's middle.
        focus = .play
      }
    }
    .onTVSwipe(isEnabled: menu == nil && !failed && focus == .seek, perform: swipe)
    .onTVTap(isEnabled: menu == nil && !failed && focus != .corner) {
      touched += 1
      if !controlsShown { showControls() }
    }
    .tvBackLayers([
      TVBackLayer(isActive: menu != nil) { menu = nil },
      TVBackLayer(isActive: controlsShown && controls) { hideControls() },
      TVBackLayer(isActive: pictureAction != nil) { putAway(pictureAction) },
      TVBackLayer(isActive: true, close: close),
    ])
    .onChange(of: menu) { _, open in if let open { shownMenu = open } }
    .onChange(of: focus) { touched += 1 }
    .onChange(of: FocusKey(controlsShown, pictureAction?.key, failed), initial: true) { _, _ in placeFocus() }
    .onChange(of: controller.segment) { skipAway = nil }
    .task(id: HideKey(controls, controller.playing, menu, scrub.target != nil, touched, voiceOver)) {
      // VoiceOver reads the controls one by one, so they stay until asked away.
      guard controls, controller.playing, menu == nil, scrub.target == nil, !voiceOver else { return }
      try? await Task.sleep(for: HIDE_AFTER)
      guard !Task.isCancelled else { return }
      hideControls()
    }
    .task(id: skipMark) {
      guard skipMark != nil else { return }
      try? await Task.sleep(for: .milliseconds(900))
      guard !Task.isCancelled else { return }
      skipMark = nil
    }
    .onChange(of: scenePhase) { _, phase in
      switch phase {
      case .background: controller.sceneDidEnterBackground()
      case .active: controller.sceneDidBecomeActive()
      default: break
      }
    }
    // The screen saver stays away while it plays and comes as ever once it's paused, as Android's window flag.
    .onChange(of: controller.playing, initial: true) { _, playing in
      UIApplication.shared.isIdleTimerDisabled = playing
    }
    // Control Center and the remote's Now Playing name it in the app's language, "Episode 4" for an untitled one.
    .onChange(of: controller.item?.id, initial: true) {
      if let item = controller.item { controller.enableNowPlaying(title: itemLabel(item).title) }
    }
    .onChange(of: controller.error) { TVPlayerDebug.save(controller.diagnostics) }
    .task {
      #if DEBUG
        while !Task.isCancelled {
          TVPlayerDebug.save(controller.diagnostics)
          try? await Task.sleep(for: .seconds(2))
        }
      #endif
    }
    .onDisappear {
      TVPlayerDebug.save(controller.diagnostics)
      UIApplication.shared.isIdleTimerDisabled = false
      TVTrickplayTiles.shared.clear()
      _ = scrub.release()
    }
  }

  private var menuOpen: Binding<Bool> {
    Binding(get: { menu != nil }, set: { if !$0 { menu = nil } })
  }

  // MARK: Focus

  /// Focus follows the controls: on the seek bar, or on the action in their
  /// row, as they come; on the action alone on the picture, or the picture
  /// itself, as they go.
  private func placeFocus() {
    guard !failed, menu == nil else { return }
    // A frame later, once what takes it is there.
    DispatchQueue.main.async {
      if controlsShown {
        let target: TVPlayerFocus = focusSeek || offer(controls: true) == nil ? .seek : .action
        focusSeek = false
        if !isInControls(focus) { focus = target }
      } else {
        focus = pictureAction != nil ? .corner : .surface
      }
    }
  }

  private func isInControls(_ target: TVPlayerFocus?) -> Bool {
    switch target {
    case nil, .surface, .corner: false
    default: true
    }
  }

  private func showControls() {
    touched += 1
    controls = true
  }

  private func hideControls() {
    controls = false
  }

  private func openMenu(_ which: TVPlayerMenu) {
    touched += 1
    shownMenu = which
    menu = which
  }

  // MARK: The remote

  /// Left and Right: a press steps by the skip step that way, a held one
  /// glides on, and the player seeks where they got to as it comes up.
  private func arrow(_ button: TVRemoteButton, _ phase: TVPressPhase) {
    touched += 1
    let direction = button == .left ? -1 : 1
    switch phase {
    case .began:
      let pressed = scrub.target == nil
      scrub.step = direction < 0 ? back : ahead
      scrub.press(direction, from: controller.position, duration: controller.duration)
      if !controlsShown {
        let total = skipMark.map { $0.direction == direction ? $0.total : 0 } ?? 0
        skipMark = TVSkipMark(direction: direction, total: total + Int(scrub.step), id: (skipMark?.id ?? 0) + 1)
      }
      guard pressed else { return }
      // Held, it glides, and the controls come to show where to.
      Task {
        try? await Task.sleep(for: GLIDE_AFTER)
        guard scrub.target != nil, !controlsShown else { return }
        focusSeek = true
        skipMark = nil
        showControls()
      }
    case .ended:
      if let to = scrub.release() { Task { await controller.seekTo(to) } }
    }
  }

  /// A swipe across the touch surface while the seek bar has focus scrubs, and seeks as it ends.
  private func swipe(_ swipe: TVSwipe) {
    touched += 1
    switch swipe.phase {
    case .began, .changed: scrub.swipe(swipe.translation.width, from: controller.position, duration: controller.duration)
    case .ended: if let to = scrub.release() { Task { await controller.seekTo(to) } }
    }
  }

  /// Select on the seek bar: seeks where a scrub got to, or plays and pauses.
  private func selectSeek() {
    touched += 1
    if let to = scrub.release() {
      Task { await controller.seekTo(to) }
    } else {
      controller.togglePlay()
    }
  }

  // MARK: The picture's action

  private func run(_ action: TVPictureAction?) {
    touched += 1
    switch action {
    case .skip?: Task { await controller.skipSegment() }
    case .next?: controller.playNext()
    case nil: break
    }
  }

  /// Menu on the action alone on the picture: the skip goes for this
  /// segment; the next episode stops counting down and goes until the file
  /// ends, when it comes back, waiting for Play. The controls still have it.
  private func putAway(_ action: TVPictureAction?) {
    switch action {
    case .skip(let segment)?: skipAway = TVPictureAction.skip(segment).key
    case .next?: controller.hideNext()
    case nil: break
    }
  }

  @ViewBuilder private func corner(_ action: TVPictureAction) -> some View {
    Group {
      switch action {
      case .next(let item, _):
        TVUpNextCard(item: item) {
          TVPictureActionButton(action: action, inCard: true) { run(action) }.focused($focus, equals: .corner)
        }
      case .skip:
        TVPictureActionButton(action: action) { run(action) }.focused($focus, equals: .corner)
      }
    }
    .padding(TVOverscan.insets)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
    .transition(.opacity)
  }

  // MARK: Failing

  @ViewBuilder private func failure(_ message: String) -> some View {
    if let refusal = controller.refusal {
      // Asking again gets the same answer, so there's nothing to try.
      TVPlayerFailure(title: tvRefusalTitle(refusal), message: message, retry: nil, close: close)
    } else if controller.unplayable {
      TVPlayerFailure(title: Str.playerErrorLost, message: Str.playerUnplayable, retry: retry, close: close)
    } else {
      // The opening failed before anything played, as Android's page failing to load.
      TVPlayerFailure(
        title: controller.item == nil ? Str.playerLoadFailed : Str.playerErrorLost, message: message, retry: retry,
        close: close)
    }
  }

  private func retry() { Task { await controller.retry() } }
}

/// What the controls' hiding waits on: any change starts the wait again.
private struct HideKey: Equatable {
  let controls: Bool
  let playing: Bool
  let menu: TVPlayerMenu?
  let scrubbing: Bool
  let touched: Int
  let voiceOver: Bool
  init(_ controls: Bool, _ playing: Bool, _ menu: TVPlayerMenu?, _ scrubbing: Bool, _ touched: Int, _ voiceOver: Bool) {
    self.controls = controls
    self.playing = playing
    self.menu = menu
    self.scrubbing = scrubbing
    self.touched = touched
    self.voiceOver = voiceOver
  }
}

/// What focus follows.
private struct FocusKey: Equatable {
  let controls: Bool
  let action: String?
  let failed: Bool
  init(_ controls: Bool, _ action: String?, _ failed: Bool) {
    self.controls = controls
    self.action = action
    self.failed = failed
  }
}
