#if os(tvOS)
  import SwiftUI
  import UIKit

  /*
   * The Siri Remote, for screens: Play/Pause, Menu as Back that steps out
   * one layer at a time, and presses and swipes for a player's scrubber,
   * with no UIKit in the screen. Select and the arrows that move focus are
   * the focus engine's; these are for what it doesn't do.
   */

  /// A layer Menu closes before anything under it, as the player's menu,
  /// then its controls, then the player itself. `isActive` says whether it
  /// shows now; `close` takes it away.
  public struct TVBackLayer {
    let isActive: Bool
    let close: () -> Void

    public init(isActive: Bool, close: @escaping () -> Void) {
      self.isActive = isActive
      self.close = close
    }
  }

  extension View {
    /// Menu closes the first of `layers` that's active, one per press, the
    /// one on top first; with none active it goes on to the system, which
    /// leaves the page or the app. For a screen whose layers don't hold
    /// focus themselves, like the player's controls over the picture.
    ///
    ///     .tvBackLayers([
    ///       TVBackLayer(isActive: menuOpen) { menuOpen = false },
    ///       TVBackLayer(isActive: controlsShown) { controlsShown = false },
    ///     ])
    public func tvBackLayers(_ layers: [TVBackLayer]) -> some View {
      let top = layers.first(where: \.isActive)
      return onExitCommand(perform: top.map { layer in { layer.close() } })
    }

    /// Menu runs `action` while `isActive`, and goes on to the system otherwise.
    public func onTVBack(isActive: Bool = true, perform action: @escaping () -> Void) -> some View {
      tvBackLayers([TVBackLayer(isActive: isActive, close: action)])
    }

    /// Play/Pause runs `action` while this, or something in it, has focus.
    public func onTVPlayPause(perform action: @escaping () -> Void) -> some View {
      onPlayPauseCommand(perform: action)
    }
  }

  /// Something that holds focus and draws nothing, filling what it's given:
  /// the player's picture while its controls are away, so Select, the
  /// arrows, and Play/Pause have somewhere to go. Select runs `action`.
  ///
  ///     TVFocusSurface { showControls() }.disabled(controlsShown)
  public struct TVFocusSurface: View {
    let action: () -> Void

    public init(action: @escaping () -> Void) { self.action = action }

    public var body: some View {
      Button(action: action) { Color.clear.frame(maxWidth: .infinity, maxHeight: .infinity).contentShape(Rectangle()) }
        .buttonStyle(SurfaceStyle())
    }
  }

  private struct SurfaceStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { configuration.label }
  }

  /// Notes when Left was last pressed, without taking the press, so the
  /// drawer can tell a move into it from focus the engine put there itself.
  struct TVLeftPresses: UIViewRepresentable {
    @MainActor static var last = Date.distantPast

    func makeUIView(context: Context) -> LeftPressView { LeftPressView() }
    func updateUIView(_ view: LeftPressView, context: Context) {}

    static func dismantleUIView(_ view: LeftPressView, coordinator: ()) {
      view.watcher.view?.removeGestureRecognizer(view.watcher)
    }
  }

  final class LeftPressView: UIView {
    let watcher = LeftPressWatcher()

    override var canBecomeFocused: Bool { false }

    override func didMoveToWindow() {
      super.didMoveToWindow()
      if let window { window.addGestureRecognizer(watcher) } else { watcher.view?.removeGestureRecognizer(watcher) }
    }
  }

  /// Fails at once on every press, so nothing waits on it, after noting a Left.
  final class LeftPressWatcher: UIGestureRecognizer {
    init() {
      super.init(target: nil, action: nil)
      allowedTouchTypes = []
      allowedPressTypes = [NSNumber(value: UIPress.PressType.leftArrow.rawValue)]
      cancelsTouchesInView = false
      delaysTouchesBegan = false
    }

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent) {
      TVLeftPresses.last = .now
      state = .failed
    }
  }

  /// A long press of Select on what has focus, Apple TV's way to ask for
  /// more about it: half a second held, it runs `action` and notes it in
  /// `memo`, so the click the button hears on release does nothing. A
  /// short press goes on to the button as ever.
  struct TVLongPress: UIViewRepresentable {
    let isEnabled: Bool
    let memo: TVPressMemo
    let action: () -> Void

    func makeUIView(context: Context) -> LongPressView { LongPressView() }

    func updateUIView(_ view: LongPressView, context: Context) {
      view.action = { [memo, action] in
        memo.longPressed = true
        action()
      }
      view.recognizer.isEnabled = isEnabled
    }

    static func dismantleUIView(_ view: LongPressView, coordinator: ()) {
      view.recognizer.view?.removeGestureRecognizer(view.recognizer)
    }
  }

  /// Whether the press a button is about to hear the end of was a long one.
  final class TVPressMemo {
    var longPressed = false

    /// Runs `action` for a click, unless the press was a long one.
    func click(_ action: () -> Void) {
      if longPressed {
        longPressed = false
      } else {
        action()
      }
    }
  }

  final class LongPressView: UIView, UIGestureRecognizerDelegate {
    var action: (() -> Void)?
    lazy var recognizer: UILongPressGestureRecognizer = {
      let press = UILongPressGestureRecognizer(target: self, action: #selector(held(_:)))
      press.minimumPressDuration = 0.5
      press.allowedPressTypes = [NSNumber(value: UIPress.PressType.select.rawValue)]
      press.allowedTouchTypes = []
      press.delegate = self
      return press
    }()

    // The button's own press handling goes on beside it.
    func gestureRecognizer(
      _ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
    ) -> Bool { true }

    override var canBecomeFocused: Bool { false }

    override func didMoveToWindow() {
      super.didMoveToWindow()
      if let window {
        window.addGestureRecognizer(recognizer)
      } else {
        recognizer.view?.removeGestureRecognizer(recognizer)
      }
    }

    @objc private func held(_ recognizer: UILongPressGestureRecognizer) {
      if recognizer.state == .began { action?() }
    }
  }

  /// A button on the remote that `onTVPress` hears.
  public enum TVRemoteButton: CaseIterable, Sendable {
    case up, down, left, right, select, playPause

    var press: UIPress.PressType {
      switch self {
      case .up: .upArrow
      case .down: .downArrow
      case .left: .leftArrow
      case .right: .rightArrow
      case .select: .select
      case .playPause: .playPause
      }
    }
  }

  /// Where a press is: it went down, or it came up.
  public enum TVPressPhase: Sendable {
    case began, ended
  }

  /// A swipe on the remote's touch surface: `translation` from where the
  /// thumb landed, in points of a 1920-wide surface, and its `velocity`.
  public struct TVSwipe: Sendable {
    public enum Phase: Sendable { case began, changed, ended }

    public let phase: Phase
    public let translation: CGSize
    public let velocity: CGSize
  }

  extension View {
    /// Hears `buttons` going down and coming up while `isEnabled`, for a
    /// held press, as a scrubber gliding while Left is held. While it
    /// hears an arrow, that arrow doesn't move focus. Give it `isEnabled`
    /// only while what it's on has focus: the remote's presses reach every
    /// listener on screen.
    public func onTVPress(
      _ buttons: Set<TVRemoteButton>, isEnabled: Bool = true,
      perform action: @escaping (TVRemoteButton, TVPressPhase) -> Void
    ) -> some View {
      background(RemoteListener(buttons: buttons, swipes: false, isEnabled: isEnabled, press: action, swipe: nil))
    }

    /// Hears swipes on the touch surface while `isEnabled`, which then don't
    /// move focus. Give it `isEnabled` only while what it's on has focus.
    public func onTVSwipe(isEnabled: Bool = true, perform action: @escaping (TVSwipe) -> Void) -> some View {
      background(RemoteListener(buttons: [], swipes: true, isEnabled: isEnabled, press: nil, swipe: action))
    }
  }

  /// Puts gesture recognizers for the remote on the window, where every
  /// press and swipe passes on its way to what has focus, for as long as
  /// the view is on screen. SwiftUI's own gestures don't reach presses on tvOS.
  private struct RemoteListener: UIViewRepresentable {
    let buttons: Set<TVRemoteButton>
    let swipes: Bool
    let isEnabled: Bool
    let press: ((TVRemoteButton, TVPressPhase) -> Void)?
    let swipe: ((TVSwipe) -> Void)?

    func makeUIView(context: Context) -> ListenerView { ListenerView() }

    func updateUIView(_ view: ListenerView, context: Context) {
      view.configure(buttons: buttons, swipes: swipes, isEnabled: isEnabled, press: press, swipe: swipe)
    }

    static func dismantleUIView(_ view: ListenerView, coordinator: ()) { view.detach() }
  }

  final class ListenerView: UIView {
    private let pressRecognizer = PressRecognizer()
    private lazy var panRecognizer: UIPanGestureRecognizer = {
      let pan = UIPanGestureRecognizer(target: self, action: #selector(panned(_:)))
      pan.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.indirect.rawValue)]
      return pan
    }()
    private var swipes = false
    private var swipe: ((TVSwipe) -> Void)?

    override var canBecomeFocused: Bool { false }

    func configure(
      buttons: Set<TVRemoteButton>, swipes: Bool, isEnabled: Bool, press: ((TVRemoteButton, TVPressPhase) -> Void)?,
      swipe: ((TVSwipe) -> Void)?
    ) {
      pressRecognizer.buttons = buttons
      pressRecognizer.action = press
      pressRecognizer.isEnabled = isEnabled && !buttons.isEmpty
      self.swipes = swipes
      self.swipe = swipe
      panRecognizer.isEnabled = isEnabled && swipes
    }

    override func didMoveToWindow() {
      super.didMoveToWindow()
      if let window {
        window.addGestureRecognizer(pressRecognizer)
        if swipes { window.addGestureRecognizer(panRecognizer) }
      } else {
        detach()
      }
    }

    func detach() {
      pressRecognizer.view?.removeGestureRecognizer(pressRecognizer)
      panRecognizer.view?.removeGestureRecognizer(panRecognizer)
    }

    @objc private func panned(_ recognizer: UIPanGestureRecognizer) {
      let phase: TVSwipe.Phase
      switch recognizer.state {
      case .began: phase = .began
      case .changed: phase = .changed
      case .ended, .cancelled, .failed: phase = .ended
      default: return
      }
      let translation = recognizer.translation(in: recognizer.view)
      let velocity = recognizer.velocity(in: recognizer.view)
      swipe?(
        TVSwipe(
          phase: phase, translation: CGSize(width: translation.x, height: translation.y),
          velocity: CGSize(width: velocity.x, height: velocity.y)))
    }
  }

  /// Reports each of its buttons going down and coming up, and holds the
  /// press so it doesn't reach the focus engine.
  final class PressRecognizer: UIGestureRecognizer {
    var buttons: Set<TVRemoteButton> = [] {
      didSet { allowedPressTypes = buttons.map { NSNumber(value: $0.press.rawValue) } }
    }
    var action: ((TVRemoteButton, TVPressPhase) -> Void)?
    private var down: Set<UIPress.PressType> = []

    init() {
      super.init(target: nil, action: nil)
      allowedTouchTypes = []
    }

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent) {
      for press in presses {
        guard let button = TVRemoteButton.allCases.first(where: { $0.press == press.type }), buttons.contains(button)
        else { continue }
        down.insert(press.type)
        action?(button, .began)
      }
      state = state == .possible ? .began : .changed
    }

    override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent) {
      release(presses)
    }

    override func pressesCancelled(_ presses: Set<UIPress>, with event: UIPressesEvent) {
      release(presses)
    }

    private func release(_ presses: Set<UIPress>) {
      for press in presses where down.contains(press.type) {
        down.remove(press.type)
        if let button = TVRemoteButton.allCases.first(where: { $0.press == press.type }) { action?(button, .ended) }
      }
      if down.isEmpty { state = .ended }
    }

    override func reset() {
      super.reset()
      down = []
    }
  }

  /// Where Left, Right, and swipes have taken a player's scrubber, as
  /// Android TV's `KeySeek`: a press steps by `step` seconds; a held press
  /// glides on from there, faster the longer it's held, up to a tenth of
  /// the video a second; a swipe across the whole touch surface moves a
  /// tenth of the video, two minutes at least. The player seeks once, to
  /// what `release()` returns, when the press or the swipe ends.
  ///
  /// `.tvScrubbing(scrub, ...)` wires it to the remote; `target` is where to
  /// draw the scrubber's head while it's non-nil.
  @MainActor @Observable
  public final class TVScrub {
    /// Where the scrubber has got to, until it's released.
    public private(set) var target: Double?
    public var step: Double
    private var glide: Task<Void, Never>?
    private var swipeFrom: Double?

    public init(step: Double = 10) { self.step = step }

    /// A press of Left (-1) or Right (1) went down at `position` in a video `duration` long.
    public func press(_ direction: Int, from position: Double, duration: Double) {
      guard duration > 0 else { return }
      let start = target ?? position
      target = clamp(start + Double(direction.signum()) * step, duration)
      glide?.cancel()
      glide = Task { [weak self] in
        // Held past a moment, it glides.
        try? await Task.sleep(for: .milliseconds(400))
        var held = 0.0
        var last = ContinuousClock.now
        while !Task.isCancelled, let self {
          let now = ContinuousClock.now
          let elapsed = (now - last) / .seconds(1)
          last = now
          held += elapsed
          let base = self.step * 3
          let rate = min(base * pow(2, held / 1.5), max(duration * 0.1, base))
          if let current = self.target {
            self.target = self.clamp(current + Double(direction.signum()) * rate * min(elapsed, 0.25), duration)
          }
          try? await Task.sleep(for: .milliseconds(50))
        }
      }
    }

    /// A swipe moved by `translation` points across, from `position`.
    public func swipe(_ translation: CGFloat, from position: Double, duration: Double) {
      guard duration > 0 else { return }
      let from = swipeFrom ?? target ?? position
      swipeFrom = from
      let span = max(duration * 0.1, 120)
      target = clamp(from + Double(translation / 1920) * span, duration)
    }

    /// The press or swipe ended: where to seek, if it moved.
    @discardableResult
    public func release() -> Double? {
      glide?.cancel()
      glide = nil
      swipeFrom = nil
      defer { target = nil }
      return target
    }

    private func clamp(_ value: Double, _ duration: Double) -> Double { min(max(value, 0), duration) }
  }
#endif
