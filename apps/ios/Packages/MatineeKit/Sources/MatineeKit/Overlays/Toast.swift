import Observation
import SwiftUI

/// What a toast is about, which picks its icon, as sonner's types do.
public enum ToastKind: Sendable {
  case plain, success, info, warning, error, loading
}

/// How long a toast stays.
public enum ToastDuration: Sendable {
  /// Sonner's 4 seconds.
  case short
  /// Long enough to read a line and reach its button: 8 seconds.
  case long
  /// Until it's closed, or replaced.
  case indefinite
  /// As long as something it offers lasts, like an Undo with a window of its own.
  case seconds(Double)

  var seconds: Double? {
    switch self {
    case .short: 4
    case .long: 8
    case .indefinite: nil
    case .seconds(let seconds): seconds
    }
  }
}

/// How a toast went away.
public enum ToastResult: Sendable {
  case dismissed, actionPerformed
}

/// One toast's words and what it offers.
public struct ToastMessage: Identifiable, Sendable {
  public let id = UUID()
  public var title: String
  public var description: String?
  public var kind: ToastKind
  public var action: String?
  public var closeButton: Bool
  public var duration: ToastDuration

  public init(
    _ title: String, description: String? = nil, kind: ToastKind = .plain, action: String? = nil,
    closeButton: Bool = false, duration: ToastDuration? = nil
  ) {
    self.title = title
    self.description = description
    self.kind = kind
    self.action = action
    self.closeButton = closeButton
    self.duration = duration ?? (action != nil ? .long : kind == .loading ? .indefinite : .short)
  }
}

/// The toasts waiting to show, one at a time, as Android's `ToastState`:
///
///     @State private var toasts = ToastState()
///     …
///     .toastHost(toasts)
///     …
///     if await toasts.show(ToastMessage("Removed", action: "Undo")) == .actionPerformed { undo() }
///
/// `post` shows one without waiting for it.
@Observable
public final class ToastState {
  private(set) var current: ToastMessage?
  private var queue: [(ToastMessage, CheckedContinuation<ToastResult, Never>?)] = []
  private var continuation: CheckedContinuation<ToastResult, Never>?
  private var timer: Task<Void, Never>?

  public init() {}

  /// Shows `message` after those before it, and says how it went away.
  @discardableResult
  public func show(_ message: ToastMessage) async -> ToastResult {
    await withCheckedContinuation { continuation in
      queue.append((message, continuation))
      advance()
    }
  }

  /// Shows `message` without waiting for it.
  public func post(_ message: ToastMessage) {
    queue.append((message, nil))
    advance()
  }

  /// Replaces the one showing, as a loading toast becomes its result.
  public func replace(with message: ToastMessage) {
    if current != nil { end(.dismissed, next: false) }
    queue.insert((message, nil), at: 0)
    advance()
  }

  /// Takes the one showing away.
  public func dismiss() { end(.dismissed) }

  func performAction() { end(.actionPerformed) }

  private func advance() {
    guard current == nil, !queue.isEmpty else { return }
    let (message, waiting) = queue.removeFirst()
    current = message
    continuation = waiting
    timer?.cancel()
    if let seconds = message.duration.seconds {
      timer = Task { [weak self] in
        try? await Task.sleep(for: .seconds(seconds))
        guard !Task.isCancelled else { return }
        self?.end(.dismissed)
      }
    }
    AccessibilityNotification.Announcement([message.title, message.description].compactMap(\.self).joined(separator: ". "))
      .post()
  }

  private func end(_ result: ToastResult, next: Bool = true) {
    guard current != nil else { return }
    timer?.cancel()
    current = nil
    continuation?.resume(returning: result)
    continuation = nil
    if next {
      Task { [weak self] in
        // Let the last one leave before the next arrives.
        try? await Task.sleep(for: .seconds(Motion.exitDuration + 0.05))
        self?.advance()
      }
    }
  }
}

extension View {
  /// Where `state`'s toasts show: at the bottom, as the web's sonner toasts
  /// are on a phone, full width and 16 points in, above the bottom bar when
  /// the page has one. Goes once, on the root; a toast shown while a sheet
  /// is up shows under it, as Android's do.
  ///
  /// `clearance` is how far above the bottom safe area toasts sit, for an
  /// app that knows whether its bar shows, as one that keeps pages under
  /// pages does (`BottomBar.clearance` while it shows, 0 when it doesn't).
  /// Without it, the host measures the `.bottomBar` below it.
  public func toastHost(_ state: ToastState, clearance: CGFloat? = nil) -> some View {
    modifier(ToastHostModifier(state: state, clearance: clearance))
  }
}

private struct ToastHostModifier: ViewModifier {
  let state: ToastState
  let clearance: CGFloat?
  @State private var measured: CGFloat = 0
  @State private var drag: CGFloat = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func body(content: Content) -> some View {
    content
      .onPreferenceChange(BottomBarHeightKey.self) { measured = $0 }
      .overlay(alignment: .bottom) {
        ZStack {
          if let message = state.current {
            Toast(
              message, onAction: { state.performAction() },
              onClose: message.closeButton ? { state.dismiss() } : nil
            )
            .id(message.id)
            .offset(y: max(0, drag))
            .gesture(swipe)
            .transition(
              reduceMotion
                ? .opacity
                : .asymmetric(
                  insertion: .move(edge: .bottom).combined(with: .opacity),
                  removal: .opacity.combined(with: .scale(scale: 0.96))))
          }
        }
        .padding(.horizontal, Space.gutter)
        .padding(.bottom, (clearance ?? measured) + Space.s4)
        .motion(Motion.move, value: clearance ?? measured)
        .animation(Motion.animation(state.current == nil ? Motion.exit : Motion.move, reduceMotion: reduceMotion), value: state.current?.id)
      }
  }

  private var swipe: some Gesture {
    #if os(iOS)
      DragGesture(minimumDistance: 8)
        .onChanged { drag = $0.translation.height }
        .onEnded { gesture in
          if gesture.translation.height > 40 || gesture.predictedEndTranslation.height > 120 { state.dismiss() }
          withMotion(Motion.move) { drag = 0 }
        }
    #else
      TapGesture().onEnded {}
    #endif
  }
}

/// One toast, as the web's sonner toasts draw it (globals.css,
/// `.matinee-toast`): frosted popover, `rounded-xl`, a border and a shadow;
/// the status icon on the title's line, the description under it, the
/// action at the end in the primary color, and the round close button over
/// the top corner.
public struct Toast: View {
  let message: ToastMessage
  let onAction: () -> Void
  let onClose: (() -> Void)?
  @Environment(\.palette) private var palette
  @Environment(\.locale) private var locale

  public init(_ message: ToastMessage, onAction: @escaping () -> Void = {}, onClose: (() -> Void)? = nil) {
    self.message = message
    self.onAction = onAction
    self.onClose = onClose
  }

  public var body: some View {
    let shape = RoundedRectangle.kit(Radius.xl)
    HStack(alignment: .top, spacing: 10) {
      if let icon {
        icon.frame(height: 20).padding(.top, message.action == nil ? 0 : 4)
      }
      VStack(alignment: .leading, spacing: 2) {
        Text(message.title)
          .textStyle(.sm, weight: .semibold)
          .foregroundStyle(palette.foreground)
        if let description = message.description {
          Text(description)
            .font(Font(RedHatText.uiFont(size: 13, weight: .regular)))
            .foregroundStyle(palette.mutedForeground)
        }
      }
      .padding(.top, message.action == nil ? 0 : 4)
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .combine)
      .accessibilitySortPriority(2)
      if let action = message.action {
        Button(action: onAction) {
          Text(action)
            .textStyle(.px13, weight: .medium)
            .foregroundStyle(palette.accentForeground)
            .lineLimit(1)
            .padding(.horizontal, 12)
            .frame(minHeight: 28)
            .background(palette.accent, in: RoundedRectangle.kit(Radius.md))
        }
        .buttonStyle(KitPressStyle(shape: RoundedRectangle.kit(Radius.md), hitInset: 8))
        .padding(.leading, 4)
      }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .frame(maxWidth: 560)
    .glassBackground(in: shape)
    .overlay { shape.strokeBorder(palette.border) }
    .kitShadow(.toast)
    .overlay(alignment: .topTrailing) {
      if let onClose {
        Button(action: onClose) {
          LucideIcon(.x, size: 12, tint: palette.mutedForeground, scales: false)
            .frame(width: 20, height: 20)
            .background(palette.popover, in: Circle())
            .overlay { Circle().strokeBorder(palette.input) }
        }
        .buttonStyle(KitPressStyle(shape: Circle(), hitInset: 12))
        .accessibilityLabel(KitText.closeToast(locale))
        // A third of it outside the corner.
        .offset(x: 7, y: -7)
      }
    }
    .accessibilityElement(children: .contain)
  }

  private var icon: AnyView? {
    switch message.kind {
    case .plain: nil
    case .success: AnyView(LucideIcon(.circleCheck, size: 16, tint: palette.success))
    case .info: AnyView(LucideIcon(.info, size: 16, tint: palette.mutedForeground))
    case .warning: AnyView(LucideIcon(.triangleAlert, size: 16, tint: palette.warning))
    case .error: AnyView(LucideIcon(.octagonX, size: 16, tint: palette.destructive))
    case .loading: AnyView(Spinner(size: 20, tint: palette.mutedForeground))
    }
  }
}
