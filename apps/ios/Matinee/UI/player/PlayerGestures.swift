import AVFoundation
import MatineeCore
import MatineeKit
import MediaPlayer
import SwiftUI
import UIKit

/*
 * VideoGestures.kt: touches on the video, as Android's phone player has
 * them. A tap shows and hides the controls, a double tap on either half
 * skips, two fingers spreading fill the screen and pinching show it whole.
 * Up or down on the left half sets the brightness, on the right half the
 * volume; sideways seeks to where the finger lifts; a finger held still
 * plays at double speed until it lifts. Which swipe it is goes by the way
 * the finger first moves. A touch that starts where the system takes its
 * own gestures, at the screen's edges, is no swipe, and a second finger
 * hands the touch to the pinch without seeking.
 *
 * The volume. iOS gives an app no call to set the system volume. Android's
 * swipe sets the media volume, which is what the buttons on the side set,
 * so this one does too, through the slider inside an `MPVolumeView` that
 * stays in the player's window (hidden, so the system's volume indicator
 * gives way to the player's note). Should a future iOS take that slider
 * away, the swipe on the right turns itself off rather than change the
 * player's own gain behind the system's back.
 */

/// What a touch on the video does: one of the swipes, or a hold that plays faster.
enum GestureKind: String, Equatable {
  case brightness, volume, seek, hold
}

/// The gesture under the finger now, which the notes over the video show.
@Observable final class GestureState {
  /// What the finger does, or nil between gestures.
  var kind: GestureKind? = PlayerDebug.gesture
  /// The brightness or volume it set, from 0 to 1.
  var level = 0.6
  /// Where a seek swipe started, in seconds.
  var from = 0.0
  /// Where a seek swipe lands when the finger lifts.
  var target = 0.0
}

/// The screen's brightness and the system volume, which swipes up and down
/// change. The brightness is the screen's own, so it goes back to what it
/// was when the player closes or the app goes away, as Android's window
/// brightness does by itself.
@Observable final class DeviceLevels {
  /// The brightness before the player first changed it.
  @ObservationIgnored private var original: CGFloat?
  /// The brightness the player set, to put back when the app returns.
  @ObservationIgnored private var own: CGFloat?
  /// The system's volume slider, which the swipe moves.
  @ObservationIgnored let volumeView = MPVolumeView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))

  private var screen: UIScreen? {
    UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first?.screen
  }

  /// The slider inside `volumeView`, if iOS still puts one there.
  private var slider: UISlider? {
    func find(_ view: UIView) -> UISlider? {
      if let slider = view as? UISlider { return slider }
      for child in view.subviews { if let found = find(child) { return found } }
      return nil
    }
    return find(volumeView)
  }

  /// There's a volume to set; without the slider the swipe on the right does nothing.
  var hasVolume: Bool { slider != nil }

  func brightness() -> Double { Double(screen?.brightness ?? 0.5) }

  func setBrightness(_ level: Double) {
    guard let screen else { return }
    if original == nil { original = screen.brightness }
    own = CGFloat(min(1, max(0, level)))
    screen.brightness = own!
  }

  /// The brightness before the player, as it leaves or the app goes away.
  func restore() {
    guard let original, let screen else { return }
    screen.brightness = original
  }

  /// The player's brightness again, as the app comes back.
  func reapply() {
    guard let own, let screen else { return }
    original = screen.brightness
    screen.brightness = own
  }

  func volume() -> Double { Double(AVAudioSession.sharedInstance().outputVolume) }

  /// Sets the system volume to `level`, and says where it is now.
  func setVolume(_ level: Double) -> Double {
    guard let slider else { return volume() }
    slider.value = Float(min(1, max(0, level)))
    slider.sendActions(for: .valueChanged)
    return Double(slider.value)
  }
}

/// Keeps the volume view in the player's window, which is what keeps the
/// system's own volume indicator away while the player shows its note.
struct VolumeHost: UIViewRepresentable {
  let levels: DeviceLevels

  func makeUIView(context: Context) -> MPVolumeView {
    let view = levels.volumeView
    view.alpha = 0.01
    view.isUserInteractionEnabled = false
    view.accessibilityElementsHidden = true
    return view
  }

  func updateUIView(_ view: MPVolumeView, context: Context) {}

  func sizeThatFits(_ proposal: ProposedViewSize, uiView: MPVolumeView, context: Context) -> CGSize? {
    CGSize(width: 1, height: 1)
  }
}

/// How far from the top and bottom, and from the sides, a swipe starts for the system's own gestures.
private let EDGE_VERTICAL: CGFloat = 48
private let EDGE_SIDE: CGFloat = 24
/// How far a finger moves before it's a swipe rather than a tap or a hold.
private let TOUCH_SLOP: CGFloat = 10
/// How long a finger stays put to become a hold.
private let HOLD_AFTER: Duration = .milliseconds(500)
/// How soon a second tap makes a double tap.
private let DOUBLE_TAP: TimeInterval = 0.28
/// How far two fingers spread, or pinch by its inverse, before the video switches.
private let PINCH_FILL: CGFloat = 1.15

/// The touches on the video. A finger's gesture is followed by hand from a
/// drag that starts at once, as Android's `awaitEachGesture` does, so a
/// tap, a double tap, a hold, and each swipe are told apart in one place.
/// VoiceOver gets the tap as the video's one action.
struct VideoTouches: View {
  let controller: PlayerController
  let prefs: PlayerPrefs
  let levels: DeviceLevels
  let state: GestureState
  /// The screen's safe area, where the system takes its own gestures.
  let insets: EdgeInsets
  /// Gestures work at all now: not under an error, a menu, or the lock.
  let allowed: Bool
  let controlsShown: Bool
  let onTap: () -> Void
  let onDoubleTap: (_ forward: Bool) -> Void
  let onStart: (GestureKind) -> Void
  let onPinch: (_ fill: Bool) -> Void

  /// The finger down now.
  @State private var touch: Touch?
  @State private var lastTap: Date?
  @State private var pendingTap: Task<Void, Never>?
  @State private var holdTimer: Task<Void, Never>?
  @State private var pinching = false
  @State private var pinchSwitched = false
  @Environment(\.layoutDirection) private var direction

  private struct Touch {
    var start: CGPoint
    var kind: GestureKind?
    /// Moved past the slop: not a tap, and not a hold unless one began.
    var moved = false
    /// No swipe for this touch: started at an edge, or its swipe is off.
    var ignored = false
    /// A second finger came, so the touch is the pinch's.
    var cancelled = false
    var startLevel = 0.0
  }

  var body: some View {
    GeometryReader { geo in
      Color.clear
        .contentShape(Rectangle())
        .gesture(drag(geo.size))
        .simultaneousGesture(pinch)
    }
    .accessibilityElement()
    .accessibilityLabel(Str.a11yPlayerVideo)
    .accessibilityAddTraits(.isButton)
    .accessibilityHint(controlsShown ? Str.a11yPlayerHideControls : Str.a11yPlayerShowControls)
    .accessibilityAction { onTap() }
  }

  private func drag(_ size: CGSize) -> some Gesture {
    DragGesture(minimumDistance: 0, coordinateSpace: .local)
      .onChanged { value in changed(value, size) }
      .onEnded { value in ended(value, size) }
  }

  private var pinch: some Gesture {
    MagnifyGesture()
      .onChanged { value in
        if !pinching {
          pinching = true
          // The finger that was down hands its touch over without seeking.
          holdTimer?.cancel()
          touch?.cancelled = true
          if touch?.kind == .hold { controller.endHold() }
        }
        let zoom = value.magnification
        let want: Bool? = zoom > PINCH_FILL ? true : zoom < 1 / PINCH_FILL ? false : nil
        if !pinchSwitched, let want, want != prefs.fillScreen {
          pinchSwitched = true
          onPinch(want)
        }
      }
      .onEnded { _ in
        pinching = false
        pinchSwitched = false
      }
  }

  private func nearEdge(_ point: CGPoint, _ size: CGSize) -> Bool {
    let left = max(insets.leading, EDGE_SIDE)
    let right = max(insets.trailing, EDGE_SIDE)
    let top = max(insets.top, EDGE_VERTICAL)
    let bottom = max(insets.bottom, EDGE_VERTICAL)
    return point.x < left || point.x > size.width - right || point.y < top || point.y > size.height - bottom
  }

  private func changed(_ value: DragGesture.Value, _ size: CGSize) {
    if touch == nil {
      let edge = !allowed || nearEdge(value.startLocation, size)
      touch = Touch(start: value.startLocation, ignored: edge)
      if !edge, prefs.holdSpeed, controller.playing { startHoldTimer() }
    }
    guard var current = touch, !current.cancelled, !pinching else { return }
    let moved = value.translation
    if current.kind == nil {
      guard hypot(moved.width, moved.height) >= TOUCH_SLOP else { return }
      current.moved = true
      holdTimer?.cancel()
      if current.ignored {
        touch = current
        return
      }
      let vertical = abs(moved.height) > abs(moved.width)
      let kind: GestureKind? =
        if vertical, prefs.swipeLevels, value.startLocation.x < size.width / 2 { .brightness }
        else if vertical, prefs.swipeLevels, levels.hasVolume { .volume }
        else if !vertical, prefs.swipeSeek, seekable(controller.duration) { .seek }
        else { nil }
      guard let kind else {
        // A swipe that's turned off stays the taps' and the pinch's.
        current.ignored = true
        touch = current
        return
      }
      switch kind {
      case .brightness: current.startLevel = levels.brightness()
      case .volume: current.startLevel = levels.volume()
      case .seek:
        state.from = controller.position
        state.target = controller.position
      case .hold: break
      }
      current.kind = kind
      state.level = current.startLevel
      state.kind = kind
      onStart(kind)
    }
    switch current.kind {
    case .brightness:
      let level = swipeLevel(start: current.startLevel, dragY: moved.height, height: size.height)
      levels.setBrightness(level)
      state.level = level
    case .volume:
      state.level = levels.setVolume(swipeLevel(start: current.startLevel, dragY: moved.height, height: size.height))
    case .seek:
      // Right is later whatever the language, as the seek bar runs.
      state.target = swipeSeek(from: state.from, dragX: moved.width, duration: controller.duration)
    case .hold, nil:
      // Moving a held finger keeps the hold.
      break
    }
    touch = current
  }

  private func ended(_ value: DragGesture.Value, _ size: CGSize) {
    holdTimer?.cancel()
    guard let current = touch else { return }
    touch = nil
    switch current.kind {
    case .seek:
      if !current.cancelled {
        let target = state.target
        Task { await controller.seekTo(target) }
      }
    case .brightness:
      if prefs.rememberBrightness { prefs.brightness = state.level }
    case .hold:
      controller.endHold()
    case .volume:
      break
    case nil:
      // Lifting from a hold or a swipe isn't a tap.
      if !current.moved, !current.cancelled, !pinching { tapped(at: value.location, size) }
    }
    if current.kind != nil { state.kind = nil }
  }

  private func startHoldTimer() {
    holdTimer?.cancel()
    holdTimer = Task {
      try? await Task.sleep(for: HOLD_AFTER)
      guard !Task.isCancelled, var current = touch, current.kind == nil, !current.moved, !current.cancelled,
        controller.startHold()
      else { return }
      current.kind = .hold
      touch = current
      state.kind = .hold
      onStart(.hold)
    }
  }

  /// A tap waits a moment for a second one: two make a double tap, which
  /// skips back on the left half and forward on the right; one alone shows
  /// or hides the controls.
  private func tapped(at point: CGPoint, _ size: CGSize) {
    let now = Date()
    if let last = lastTap, now.timeIntervalSince(last) < DOUBLE_TAP {
      pendingTap?.cancel()
      lastTap = nil
      guard allowed else { return }
      onDoubleTap(point.x >= size.width / 2)
      return
    }
    lastTap = now
    pendingTap?.cancel()
    pendingTap = Task {
      try? await Task.sleep(for: .seconds(DOUBLE_TAP))
      guard !Task.isCancelled else { return }
      lastTap = nil
      onTap()
    }
  }
}

/// How long a note stays after the finger lifts.
private let SWIPE_LINGER: Duration = .milliseconds(800)

/// What a gesture does, while it does and for a moment after: the
/// brightness on the left, the volume on the right, and where a seek lands
/// in the middle. VoiceOver has its own ways to set these, so they stay silent.
struct GestureNotes: View {
  let state: GestureState
  let controller: PlayerController
  @State private var shown: GestureKind?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    ZStack {
      if shown == .brightness {
        LevelNote(icon: .sun, level: state.level)
          .padding(.leading, MatineeKit.Space.s8)
          .frame(maxWidth: .infinity, alignment: .leading)
          .transition(.opacity)
      }
      if shown == .volume {
        LevelNote(icon: state.level <= 0 ? .volumeX : .volume, level: state.level)
          .padding(.trailing, MatineeKit.Space.s8)
          .frame(maxWidth: .infinity, alignment: .trailing)
          .transition(.opacity)
      }
      if shown == .seek {
        SeekNote(controller: controller, from: state.from, to: state.target)
          .transition(.opacity)
      }
    }
    // The levels sit on their own sides of the screen whatever the language, as the swipes do.
    .environment(\.layoutDirection, .leftToRight)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .animation(MatineeKit.Motion.animation(MatineeKit.Motion.enter, reduceMotion: reduceMotion), value: shown)
    .allowsHitTesting(false)
    .accessibilityHidden(true)
    .task(id: state.kind) {
      if let kind = state.kind, kind != .hold {
        shown = kind
      } else {
        try? await Task.sleep(for: SWIPE_LINGER)
        guard !Task.isCancelled else { return }
        shown = nil
      }
    }
  }
}

/// A brightness or volume: how much as a number, as a bar filling up, and
/// which one, in the web player's note glass.
private struct LevelNote: View {
  let icon: MatineeKit.Lucide
  let level: Double
  @Environment(\.playerPalette) private var palette

  var body: some View {
    let percent = FloatingPointFormatStyle<Double>.Percent.percent.precision(.fractionLength(0)).locale(.app)
    VStack(spacing: MatineeKit.Space.s2_5) {
      // As wide as the fullest level, so the box and its bar hold still.
      ZStack {
        Text(1.0.formatted(percent)).hidden()
        Text(level.formatted(percent))
      }
      .textStyle(.sm, weight: .medium)
      .monospacedDigit()
      .foregroundStyle(.white)
      Capsule().fill(.white.opacity(0.25))
        .frame(width: 6, height: 120)
        .overlay(alignment: .bottom) {
          Capsule().fill(palette.accent).frame(width: 6, height: 120 * min(1, max(0, level)))
        }
        .clipShape(Capsule())
      MatineeKit.LucideIcon(icon, size: 20, tint: .white, scales: false)
    }
    .padding(.horizontal, MatineeKit.Space.s3)
    .padding(.vertical, MatineeKit.Space.s3_5)
    .pictureGlass(in: RoundedRectangle.kit(MatineeKit.Radius.xl2), shade: .medium)
  }
}

/// Where a seek swipe lands: its trickplay frame, how far it moves, and the time it lands at.
private struct SeekNote: View {
  let controller: PlayerController
  let from: Double
  let to: Double

  var body: some View {
    let delta = to - from
    let total = formatClock(controller.duration)
    let longest = formatClock(controller.duration).replacing(/[0-9]/, with: "0")
    VStack(spacing: MatineeKit.Space.s1) {
      if let images = controller.trickplay, images.width > 0 {
        TrickplayFrameView(controller: controller, seconds: to)
          .frame(width: 200, height: 200 * CGFloat(images.height) / CGFloat(images.width))
          .clipShape(RoundedRectangle.kit(MatineeKit.Radius.md))
          .padding(.bottom, MatineeKit.Space.s1)
      }
      ZStack {
        Text("+\(longest)").hidden()
        Text((delta < 0 ? "-" : "+") + formatClock(abs(delta)))
      }
      .textStyle(.xl, weight: .semibold)
      .foregroundStyle(.white)
      ZStack {
        Text("\(longest) / \(total)").hidden()
        Text("\(formatClock(to)) / \(total)")
      }
      .textStyle(.sm)
      .foregroundStyle(.white.opacity(0.75))
    }
    .monospacedDigit()
    .padding(MatineeKit.Space.s3)
    .pictureGlass(in: RoundedRectangle.kit(MatineeKit.Radius.xl), shade: .medium)
  }
}

/// Says the video plays faster while the finger holds it: the web's flash note.
struct HoldNote: View {
  var body: some View {
    HStack(spacing: MatineeKit.Space.s2) {
      MatineeKit.LucideIcon(.fastForward, size: 16, tint: .white, scales: false)
      Text(Str.playerSpeedRate(speedText(HOLD_SPEED)))
        .textStyle(.sm, weight: .medium)
        .monospacedDigit()
        .foregroundStyle(.white)
    }
    .padding(.horizontal, MatineeKit.Space.s4)
    .padding(.vertical, MatineeKit.Space.s2)
    .pictureGlass(in: Capsule(), shade: .medium, ring: 0)
    .accessibilityElement(children: .combine)
  }
}
