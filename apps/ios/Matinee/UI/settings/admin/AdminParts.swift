import MatineeCore
import MatineeKit
import SwiftUI
import UIKit

/*
 * AdminParts.kt: what the admin pages share, built from MatineeKit. A page
 * and its sections, as the web's settings panels lay them out; loading
 * the server's settings; saving them, one at a time; the save bar for a
 * page whose fields save together, which holds the page open while it has
 * edits; asking before something can't be undone; and the words for times
 * the pages show. The logic under the forms is MatineeCore's (Admin/),
 * where it's tested on the Mac.
 */

/// How wide a page's column gets, on an iPad or a phone on its side: the
/// web's settings panel, not the whole screen.
let ADMIN_COLUMN: CGFloat = 680

// MARK: - Pages

/// An admin page, as Android's admin pages on `SettingsScaffold`: the
/// kit's top bar, then its sections down the page, 28 apart, within the
/// gutter, in a column the web's width on an iPad. `onBack` replaces going
/// back, as a page with unsaved edits does; `actions` sit at the bar's end.
struct AdminPage<Content: View, Actions: View>: View {
  let title: String
  var onBack: (() -> Void)?
  @ViewBuilder let actions: () -> Actions
  @ViewBuilder let content: () -> Content

  init(
    _ title: String, onBack: (() -> Void)? = nil, @ViewBuilder actions: @escaping () -> Actions,
    @ViewBuilder content: @escaping () -> Content
  ) {
    self.title = title
    self.onBack = onBack
    self.actions = actions
    self.content = content
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: SETTINGS_SPACING) { content() }
        .padding(.horizontal, Space.gutter)
        .padding(.top, Space.s2)
        .padding(.bottom, Space.s5)
        .frame(maxWidth: ADMIN_COLUMN)
        .frame(maxWidth: .infinity)
    }
    .scrollDismissesKeyboard(.interactively)
    .topBar(title, onLeading: onBack, actions: actions)
  }
}

extension AdminPage where Actions == EmptyView {
  init(_ title: String, onBack: (() -> Void)? = nil, @ViewBuilder content: @escaping () -> Content) {
    self.init(title, onBack: onBack, actions: { EmptyView() }, content: content)
  }
}

/// The page's data from `loader`: a spinner while it loads, what failed
/// with a way to try again when it doesn't, and then `content`.
struct AdminLoaded<T: Sendable, Content: View>: View {
  let loader: Loader<T>
  @ViewBuilder let content: (T) -> Content
  @Environment(\.palette) private var palette

  init(_ loader: Loader<T>, @ViewBuilder content: @escaping (T) -> Content) {
    self.loader = loader
    self.content = content
  }

  var body: some View {
    switch loader.state {
    case .loading:
      Spinner(size: 24, tint: palette.mutedForeground)
        .frame(maxWidth: .infinity)
        .padding(.vertical, Space.s12)
        .accessibilityLabel(Str.loadingInProgress)
    case .failed(let message, let disconnected):
      ErrorBox(Str.adminLoadFailed, message, disconnected: disconnected, onRetry: loader.reload)
    case .ready(let value):
      content(value)
    }
  }
}

/// Runs a change, one at a time, showing what went wrong at the bottom of
/// the screen with the server's reason. It runs on in a task of its own,
/// so the sheet or dialog that started it can go.
@Observable final class Saver {
  private(set) var saving = false

  func callAsFunction(_ snackbar: Snackbar, _ block: @escaping () async throws -> Void) {
    guard !saving else { return }
    saving = true
    Task {
      defer { saving = false }
      do {
        try await block()
      } catch {
        snackbar.fail(Str.webCommonSaveBarFailed, error)
      }
    }
  }
}

// MARK: - The save bar

/// A page whose fields wait to be saved together, as the web's panels with
/// their save bar. The bar sits under the page, outside what scrolls, so
/// it never covers the last rows, and rises with the keyboard. It shows
/// while the page has edits (`dirty`), with Reset and Save.
///
/// Until the edits are saved or reset it holds the page open, as the web
/// and Android do: Back shakes the bar instead of leaving, VoiceOver hears
/// why, and the edge swipe waits. The bar reports the save itself: Save
/// turns into "Saved" for a moment before the bar goes, and a failure
/// stays in it with the server's reason until the next attempt or a reset.
///
/// `canSave` is false while a field holds something that can't be saved;
/// the field says why. `onSave` throws when the save fails.
struct SaveBarPage<Content: View>: View {
  let title: String
  let dirty: Bool
  let canSave: Bool
  let onReset: () -> Void
  let onSave: () async throws -> Void
  @ViewBuilder let content: () -> Content

  @State private var stored: SaveFeedback = .idle
  /// Moves on each attempt to leave with unsaved edits; the bar shakes.
  @State private var attention = 0

  init(
    _ title: String, dirty: Bool, canSave: Bool = true, onReset: @escaping () -> Void,
    onSave: @escaping () async throws -> Void, @ViewBuilder content: @escaping () -> Content
  ) {
    self.title = title
    self.dirty = dirty
    self.canSave = canSave
    self.onReset = onReset
    self.onSave = onSave
    self.content = content
  }

  var body: some View {
    let feedback = stored.shown(dirty: dirty)
    let visible = stored.barVisible(dirty: dirty)
    let back: (() -> Void)? = dirty ? { attempt() } : nil
    AdminPage<Content, EmptyView>(title, onBack: back, actions: { EmptyView() }, content: content)
      .safeAreaInset(edge: .bottom, spacing: 0) {
        Reveal(visible) {
          SaveBar(
            feedback: feedback, dirty: dirty, canSave: canSave, attention: attention, onReset: reset, onSave: save)
        }
      }
      .background(HoldsBack(held: dirty))
      .accessibilityAction(.escape) {
        if dirty { attempt() }
      }
      .task(id: stored) {
        guard stored == .success else { return }
        try? await Task.sleep(for: SAVED_SHOWN)
        if !Task.isCancelled { stored = .idle }
      }
      // Gone until the next edit, which starts calm.
      .onChange(of: visible) { _, shown in if !shown { attention = 0 } }
  }

  private func attempt() {
    attention += 1
    AccessibilityNotification.Announcement(Str.webCommonSaveBarUnsaved).post()
  }

  private func reset() {
    stored = .idle
    onReset()
  }

  private func save() {
    guard stored.shown(dirty: dirty) != .pending, dirty, canSave else { return }
    stored = .pending
    Task {
      do {
        try await onSave()
        stored = .success
      } catch {
        stored = Failure(error) == .cancelled ? .idle : saveFailure(describeFailure(error))
      }
    }
  }
}

/// The web's SettingsSaveBar: the popover's surface over a line, what
/// happened to the edits, and Reset and Save.
private struct SaveBar: View {
  let feedback: SaveFeedback
  let dirty: Bool
  let canSave: Bool
  let attention: Int
  let onReset: () -> Void
  let onSave: () -> Void
  @Environment(\.palette) private var palette
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let still = reduceMotion
    VStack(spacing: 0) {
      Separator()
      // Side by side while they fit; the words over the buttons when a
      // language or a text size makes them long.
      ViewThatFits(in: .horizontal) {
        HStack(spacing: Space.s3) {
          status.frame(maxWidth: .infinity, alignment: .leading)
          buttons.fixedSize()
        }
        VStack(alignment: .leading, spacing: Space.s2_5) {
          status.frame(maxWidth: .infinity, alignment: .leading)
          buttons.frame(maxWidth: .infinity, alignment: .trailing)
        }
      }
      .frame(maxWidth: ADMIN_COLUMN)
      .padding(.horizontal, Space.gutter)
      .padding(.vertical, Space.s3)
      .frame(maxWidth: .infinity)
      .keyframeAnimator(initialValue: CGFloat(0), trigger: attention) { content, shake in
        content.offset(x: still ? 0 : shake)
      } keyframes: { _ in
        KeyframeTrack {
          LinearKeyframe(-6, duration: 0.072)
          LinearKeyframe(6, duration: 0.072)
          LinearKeyframe(-6, duration: 0.072)
          LinearKeyframe(6, duration: 0.072)
          LinearKeyframe(0, duration: 0.072)
        }
      }
    }
    .background(palette.popover.ignoresSafeArea(edges: .bottom))
  }

  private var status: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(statusText).textStyle(.sm)
        .foregroundStyle(isFailed ? palette.destructive : palette.foreground)
      if case .failed(let message?) = feedback {
        Text(message).textStyle(.px13).foregroundStyle(palette.mutedForeground).lineLimit(3)
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.updatesFrequently)
  }

  private var buttons: some View {
    let pending = feedback == .pending
    return HStack(spacing: Space.s2) {
      MatineeButton(Str.webCommonSaveBarReset, look: .ghost, size: .md, action: onReset)
        .disabled(!dirty || pending)
      MatineeButton(look: .primary, size: .md, pending: pending, action: onSave) {
        HStack(spacing: Space.s1_5) {
          switch feedback {
          case .pending: Spinner(size: 14, tint: palette.accentForeground)
          case .success: LucideIcon(.check, size: 16, scales: false)
          default: EmptyView()
          }
          Text(saveText).textStyle(.sm, weight: .medium).lineLimit(1)
        }
      }
      .disabled(!(pending || feedback == .success || (dirty && canSave)))
    }
  }

  private var isFailed: Bool {
    if case .failed = feedback { return true }
    return false
  }

  private var statusText: String {
    switch feedback {
    case .success: Str.webCommonSaveBarSaved
    case .failed: Str.webCommonSaveBarFailed
    default: Str.webCommonSaveBarUnsaved
    }
  }

  private var saveText: String {
    switch feedback {
    case .pending: Str.webCommonSaveBarSaving
    case .success: Str.webCommonSaveBarDone
    case .failed: Str.webCommonSaveBarRetry
    case .idle: Str.webCommonSaveBarSave
    }
  }
}

/// Stops the edge swipe back while `held`, which the kit's top bar
/// otherwise always allows, and lets it go again when the page leaves.
private struct HoldsBack: UIViewControllerRepresentable {
  let held: Bool

  func makeUIViewController(context: Context) -> Controller { Controller() }

  func updateUIViewController(_ controller: Controller, context: Context) {
    controller.held = held
    controller.apply()
  }

  final class Controller: UIViewController {
    var held = false

    override func viewDidAppear(_ animated: Bool) {
      super.viewDidAppear(animated)
      apply()
    }

    override func viewWillDisappear(_ animated: Bool) {
      super.viewWillDisappear(animated)
      set(enabled: true)
    }

    func apply() { set(enabled: !held) }

    private func set(enabled: Bool) {
      guard let navigation = navigationController else { return }
      var gestures = [navigation.interactivePopGestureRecognizer]
      if #available(iOS 26, *) { gestures.append(navigation.interactiveContentPopGestureRecognizer) }
      for case let gesture? in gestures where gesture.isEnabled != enabled { gesture.isEnabled = enabled }
    }
  }
}

// MARK: - Rows and words

/// A line under a section: what the server found or what a change will do,
/// `text-13px` muted, as Android's Note, or in `color`, as a warning.
struct Note: View {
  let text: String
  var color: Color?
  @Environment(\.palette) private var palette

  init(_ text: String, color: Color? = nil) {
    self.text = text
    self.color = color
  }

  var body: some View {
    Text(text).textStyle(.px13).foregroundStyle(color ?? palette.mutedForeground)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A row in a block that does something, such as Add folder, as Android's:
/// its icon, 18, and words in `text-base`, both in the accent, the whole
/// row one tap.
struct AdminActionRow: View {
  let title: String
  let icon: Lucide
  var pending = false
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Pressable(action: action) {
      HStack(spacing: Space.s3) {
        Group {
          if pending {
            Spinner(size: 18, tint: palette.accent)
          } else {
            LucideIcon(icon, size: 18, tint: palette.accent)
          }
        }
        .frame(width: 18)
        Text(title).textStyle(.base).foregroundStyle(palette.accent)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.horizontal, Space.s4)
      .padding(.vertical, Space.s3_5)
      .frame(minHeight: 52)
      .contentShape(Rectangle())
    }
    .disabled(pending)
  }
}

/// A question before something that can't be undone; `confirm` names it.
struct Confirmation: Identifiable {
  let id = UUID()
  let title: String
  var message: String?
  let confirm: String
  /// Whether it takes something away, which paints its button in the danger color.
  var destructive = true
  let action: () -> Void
}

extension View {
  /// Asks `confirmation`'s question in the kit's dialog while it's set, and
  /// runs it on a yes, once the dialog has gone.
  func confirming(_ confirmation: Binding<Confirmation?>) -> some View {
    modifier(Confirming(confirmation: confirmation))
  }
}

private struct Confirming: ViewModifier {
  @Binding var confirmation: Confirmation?
  /// The question shown last, kept while its dialog fades, so its words don't go first.
  @State private var shown: Confirmation?

  func body(content: Content) -> some View {
    let asked = confirmation ?? shown
    content
      .confirmDialog(
        isPresented: Binding(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } }),
        title: asked?.title ?? "", message: asked?.message, confirm: asked?.confirm ?? "",
        destructive: asked?.destructive ?? true
      ) { asked?.action() }
      .onChange(of: confirmation?.id, initial: true) { if let confirmation { shown = confirmation } }
  }
}

/// "5 minutes ago", "in 2 hours", in the app's language, lowercase, as it
/// stands inside a sentence. An unreadable time shows as it came.
func relativeTime(_ at: String, now: Date = .now) -> String {
  guard let date = parseInstant(at) else { return at }
  let formatter = RelativeDateTimeFormatter()
  formatter.locale = .app
  formatter.unitsStyle = .full
  formatter.dateTimeStyle = .named
  // Seconds would change under the reader while the page follows the server.
  let rounded = abs(date.timeIntervalSince(now)) < 60 ? now : date
  let text = formatter.localizedString(for: rounded, relativeTo: now)
  return text.prefix(1).lowercased(with: .app) + text.dropFirst()
}

/// A message the web has for an id, like a queue's name, or `fallback`, the
/// server's English, when it has none: `web_jobs_queue_<id>_name`.
func webMessage(_ key: String, fallback: String) -> String {
  let value = Bundle.main.localizedString(forKey: key, value: "\u{0}", table: "Localizable")
  return value == "\u{0}" ? fallback : value
}

/// The text, or nil when it's blank, for a placeholder that falls back.
func nonBlank(_ text: String) -> String? {
  text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : text
}

/// Something picked to show in a sheet, by its id, for a model that isn't
/// `Identifiable` itself.
struct Picked<Value>: Identifiable {
  let id: String
  let value: Value

  init(_ id: String, _ value: Value) {
    self.id = id
    self.value = value
  }
}
