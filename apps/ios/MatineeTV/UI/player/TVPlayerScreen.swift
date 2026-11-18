import MatineeCore
import MatineeKit
import MatineeMPV
import SwiftUI

/*
 * ui/player/tv/: TvPlayback.kt's `TvPlayerScreen` and the phone's
 * PlayerScreen.kt sitting, on Apple TV. The shell presents it over
 * everything (`.fullScreenCover` in TVShell.swift) and takes it away with
 * `close`; the focus engine then puts focus back on the card that opened it.
 * `PlayerController` (MatineeCore/Player) plays; this makes it, starts and
 * stops it, and makes its calls at the moments of the view's life
 * (PlayerController+Screen.swift). The rest is beside it:
 *
 * - TVPlayback.swift: the remote, focus, the layers Menu steps out of, and
 *   what shows when, Android's `TvPlayback`.
 * - TVOverlay.swift: the controls, Android's `TvOverlay`.
 * - TVPictureAction.swift: Skip intro and the next episode, alone on the
 *   picture while the controls are away, `TvPictureButton`.
 * - TVPlayerMenus.swift: the menus' panels, `TvMenuPanel`.
 * - TVPlayerNotes.swift: the failure, the server's notices, a skip's mark.
 * - TVVideo.swift: either engine's picture, and trickplay tiles.
 * - TVDisplayMode.swift: the display following the video, `DisplayMode.kt`.
 *
 * The subtitle lines are the phone's (Matinee/UI/player/PlayerSubtitles.swift,
 * shared in project.yml). A TV has no picture in picture, AirPlay to send,
 * downloads, gestures, or lock, so none of the phone's pieces for those.
 */

/// What plays: a file, from where the person left off or from `start`
/// seconds. Each is a sitting of its own, which asks anew.
private struct PlayTarget: Hashable {
  let itemId: String
  let start: Double?
  let sitting = UUID()
}

/// The player, over everything: `request`'s file, and the episodes either
/// side in its place, until Menu or Back closes it.
struct TVPlayerScreen: View {
  let request: TVPlayerRequest
  let close: () -> Void
  @State private var target: PlayTarget
  @Environment(ThemeStore.self) private var themeStore

  init(request: TVPlayerRequest, close: @escaping () -> Void) {
    self.request = request
    self.close = close
    _target = State(initialValue: PlayTarget(itemId: request.itemId, start: request.start))
  }

  var body: some View {
    // The next or previous episode plays in its place, as Android's activity
    // changes its target and `key(playing)` makes a new player for it.
    TVPlayerSitting(itemId: target.itemId, start: target.start, close: close) { next in
      target = PlayTarget(itemId: next, start: 0)
    }
    .id(target)
    .forceDarkTheme(themeStore.theme)
    .background(Color.black)
    .ignoresSafeArea()
  }
}

/// One sitting with a file: the controller made and started as it shows,
/// stopped as it goes, with the last report sent.
private struct TVPlayerSitting: View {
  let itemId: String
  let start: Double?
  let close: () -> Void
  let playInstead: (String) -> Void
  @Environment(\.api) private var api
  @Environment(\.user) private var user
  @Environment(MatineeSession.self) private var session
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @State private var controller: PlayerController?
  /// The sign-in it opened in; another server or account closes it, as on Android.
  @State private var made: Int?
  private let prefs = PlayerPrefs.shared

  var body: some View {
    ZStack {
      Color.black
      if let controller {
        TVPlayback(controller: controller, prefs: prefs, close: close)
      } else {
        Spinner(size: 80, tint: .white.opacity(0.85))
      }
    }
    .task { await open() }
    .onDisappear(perform: stop)
    .onChange(of: session.version) { _, version in
      if let made, made != version { close() }
    }
  }

  private func open() async {
    guard controller == nil, let api else { return }
    made = session.version
    let session = session
    // The token for the session's server, which is the API's; the controller sends it only there.
    let token: @Sendable () async -> String? = { @MainActor in
      session.playerHeaders()["Authorization"].map { String($0.dropFirst("Bearer ".count)) }
    }
    // A TV has no downloads, so nothing waits offline and every file asks the server.
    let player = PlayerController(
      api: api, device: playbackDevice(prefs), prefs: prefs, tokenProvider: token,
      preferences: user?.playback ?? DEFAULT_PLAYBACK_PREFERENCES,
      playbackEngine: prefs.engine == .mpv ? MPVPlaybackEngine() : nil)
    player.onNext = { next in playInstead(next.id) }
    player.sceneDidBecomeActive()
    controller = player
    await player.start(itemId: itemId, at: start)
  }

  private func stop() {
    guard let controller else { return }
    let viewer = viewer
    Task {
      await controller.stop()
      // Home's Continue watching and the title pages fetch again.
      viewer?.changed()
    }
  }
}
