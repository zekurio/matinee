import MatineeCore
import SwiftUI

/*
 * AdminParts.kt: what the admin pages share. Loading the server's
 * settings, saving them, the save bar for a page whose fields save
 * together, text rows, asking before something can't be undone, and the
 * words for times the pages show. The logic under the forms is
 * MatineeCore's (Admin/), where it's tested on the Mac.
 */

/// The page's data from `loader`: a spinner while it loads, the error with
/// a way to try again when it doesn't, which `failed` words, and then
/// `content`. While the server can't be reached, the disconnect icon every
/// page shows instead.
struct AdminLoaded<T: Sendable, Content: View>: View {
  let loader: Loader<T>
  let failed: (String) -> String
  @ViewBuilder let content: (T) -> Content
  @Environment(\.palette) private var palette

  init(_ loader: Loader<T>, failed: @escaping (String) -> String, @ViewBuilder content: @escaping (T) -> Content) {
    self.loader = loader
    self.failed = failed
    self.content = content
  }

  var body: some View {
    switch loader.state {
    case .loading:
      ProgressView().controlSize(.large).tint(palette.accent)
        .frame(maxWidth: .infinity)
        .padding(32)
        .accessibilityLabel(Str.loadingInProgress)
    case .failed(let message, let disconnected):
      if disconnected {
        Disconnected(onRetry: loader.reload).frame(maxWidth: .infinity).padding(.vertical, 32)
      } else {
        VStack(alignment: .leading, spacing: 12) {
          Text(failed(message)).textStyle(.bodyMedium).foregroundStyle(palette.muted)
          RetryButton(action: loader.reload)
        }
      }
    case .ready(let value):
      content(value)
    }
  }
}

/// Runs a save, one at a time, showing what went wrong at the bottom of the
/// screen, with the server's reason. It runs on in a task of its own, so a
/// menu or sheet that started it can go.
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
        let failure = Failure(error)
        guard failure != .cancelled else { return }
        snackbar.show("\(Str.webCommonSaveBarFailed): \(describeFailure(failure))")
      }
    }
  }
}

/// A settings page whose fields wait to be saved together, as the web's
/// panels with its save bar. The bar sits under the list, outside what
/// scrolls, so it never covers the last rows; it shows while the page has
/// unsaved edits (`dirty`), with Reset and Save, and stays above the
/// keyboard.
///
/// Until the edits are saved or reset, it holds the page open, as the web
/// and Android do: back, from the bar's button, shakes the bar instead of
/// leaving, and the edge swipe waits. The bar reports the save itself:
/// Save turns into "Saved" for a moment before the bar goes, and a failure
/// stays in it with the server's reason until the next attempt or a reset.
///
/// `canSave` is false while a field holds something that can't be saved;
/// the field says why. `onSave` throws when the save fails.
struct SaveBarScaffold<Content: View>: View {
  let title: String
  let dirty: Bool
  var canSave = true
  let onReset: () -> Void
  let onSave: () async throws -> Void
  @ViewBuilder let content: () -> Content

  @State private var stored: SaveFeedback = .idle
  /// Bumped on each attempt to leave with unsaved edits; the bar shakes.
  @State private var attention = 0
  @Environment(\.palette) private var palette
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 28) { content() }
        .padding(.horizontal, Gutter)
        .padding(.top, 8)
        .padding(.bottom, 20)
    }
    .scrollDismissesKeyboard(.interactively)
    .background(palette.background)
    .safeAreaInset(edge: .bottom, spacing: 0) {
      VStack(spacing: 0) {
        if visible {
          SaveBar(feedback: feedback, dirty: dirty, canSave: canSave, attention: attention, onReset: reset, onSave: save)
            .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
        }
      }
      .motion(Motion.enter, value: visible)
    }
    .topBar(title)
    // The system's back would leave the edits behind; this one asks the bar to say so.
    .navigationBarBackButtonHidden(dirty)
    .toolbar {
      if dirty {
        ToolbarItem(placement: .topBarLeading) {
          Button {
            attention += 1
            AccessibilityNotification.Announcement(Str.webCommonSaveBarUnsaved).post()
          } label: {
            Image(Lucide.chevronLeft)
          }
          .accessibilityLabel(Str.commonBack)
        }
      }
    }
    .task(id: stored) {
      guard stored == .success else { return }
      try? await Task.sleep(for: SAVED_SHOWN)
      if !Task.isCancelled { stored = .idle }
    }
    // Gone until the next edit, which starts calm.
    .onChange(of: visible) { _, shown in if !shown { attention = 0 } }
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
        if Failure(error) == .cancelled {
          stored = .idle
        } else {
          stored = saveFailure(describeFailure(error))
        }
      }
    }
  }
}

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
      Rectangle().fill(palette.border).frame(height: 1)
      // Side by side while they fit; the words above the buttons when a language or a text size makes them long.
      ViewThatFits(in: .horizontal) {
        HStack(spacing: 8) {
          status.frame(maxWidth: .infinity, alignment: .leading)
          buttons
        }
        VStack(alignment: .leading, spacing: 8) {
          status.frame(maxWidth: .infinity, alignment: .leading)
          HStack(spacing: 8) {
            Spacer(minLength: 0)
            buttons
          }
        }
      }
      .padding(.leading, Gutter)
      .padding(.trailing, Gutter - 4)
      .padding(.vertical, 10)
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
    .background(palette.raised)
  }

  private var status: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(statusText).textStyle(.bodyMedium)
        .foregroundStyle(isFailed ? palette.danger : palette.foreground)
      if case .failed(let message?) = feedback {
        Text(message).textStyle(.bodySmall).foregroundStyle(palette.muted).lineLimit(3)
      }
    }
    .accessibilityElement(children: .combine)
  }

  private var buttons: some View {
    let pending = feedback == .pending
    return HStack(spacing: 8) {
      MatineeButton(.ghost, action: onReset) { Text(Str.webCommonSaveBarReset) }
        .disabled(!dirty || pending)
        .fixedSize()
      MatineeButton(.primary, action: onSave) {
        switch feedback {
        case .pending: ProgressView().controlSize(.small).tint(palette.accentForeground)
        case .success: LucideIcon(.check, size: 16)
        default: EmptyView()
        }
        Text(saveText)
      }
      .disabled(!(pending || feedback == .success || (dirty && canSave)))
      .fixedSize()
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

/// A text field in a panel, its name above it, with what's wrong under it.
/// `keyboard` is the keyboard it types with; nothing in an admin's field is
/// a sentence, so it neither corrects nor capitalizes.
struct TextRow<Trailing: View>: View {
  let label: String
  @Binding var text: String
  var placeholder: String?
  var keyboard: UIKeyboardType = .default
  var error: String?
  var secret = false
  @ViewBuilder var trailing: () -> Trailing
  @State private var shownError = ""
  @Environment(\.palette) private var palette

  init(
    _ label: String, text: Binding<String>, placeholder: String? = nil, keyboard: UIKeyboardType = .default,
    error: String? = nil, secret: Bool = false, @ViewBuilder trailing: @escaping () -> Trailing
  ) {
    self.label = label
    self._text = text
    self.placeholder = placeholder
    self.keyboard = keyboard
    self.error = error
    self.secret = secret
    self.trailing = trailing
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label).textStyle(.bodyMedium).foregroundStyle(palette.muted)
        .accessibilityHidden(true)
      MatineeTextField($text, placeholder: placeholder, isError: error != nil, secure: secret, trailing: trailing)
        .keyboardType(keyboard)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.done)
        .accessibilityLabel(label)
      // The last error stays while it closes, so the text doesn't vanish first.
      Reveal(error != nil) {
        Text(shownError).textStyle(.bodySmall).foregroundStyle(palette.danger)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.top, -2)
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
    .onChange(of: error, initial: true) { _, error in if let error { shownError = error } }
  }
}

extension TextRow where Trailing == EmptyView {
  init(
    _ label: String, text: Binding<String>, placeholder: String? = nil, keyboard: UIKeyboardType = .default,
    error: String? = nil, secret: Bool = false
  ) {
    self.init(label, text: text, placeholder: placeholder, keyboard: keyboard, error: error, secret: secret) {
      EmptyView()
    }
  }
}

/// A question before something that can't be undone; `confirm` names it.
struct Confirmation: Identifiable {
  let id = UUID()
  let title: String
  var body: String?
  let confirm: String
  let action: () -> Void
}

extension View {
  /// Asks `confirmation`'s question while it's set, as iOS asks before a
  /// destructive action, and runs it on a yes.
  func confirming(_ confirmation: Binding<Confirmation?>) -> some View {
    confirmationDialog(
      confirmation.wrappedValue?.title ?? "",
      isPresented: Binding(
        get: { confirmation.wrappedValue != nil }, set: { if !$0 { confirmation.wrappedValue = nil } }),
      titleVisibility: .visible, presenting: confirmation.wrappedValue
    ) { asked in
      Button(asked.confirm, role: .destructive, action: asked.action)
      Button(Str.commonCancel, role: .cancel) {}
    } message: { asked in
      if let body = asked.body { Text(body) }
    }
  }
}

/// A menu's row: an icon and a label, as Android's `SheetItem`.
struct MenuItem: View {
  let icon: Lucide
  let label: String
  var destructive = false
  let action: () -> Void

  init(_ icon: Lucide, _ label: String, destructive: Bool = false, action: @escaping () -> Void) {
    self.icon = icon
    self.label = label
    self.destructive = destructive
    self.action = action
  }

  var body: some View {
    Button(role: destructive ? .destructive : nil, action: action) {
      Label { Text(label) } icon: { Image(icon) }
    }
  }
}

/// Small muted lines under a panel, for what a page has to say about itself.
struct Note: View {
  let text: String
  var color: Color?
  @Environment(\.palette) private var palette

  init(_ text: String, color: Color? = nil) {
    self.text = text
    self.color = color
  }

  var body: some View {
    Text(text).textStyle(.bodySmall).foregroundStyle(color ?? palette.muted)
      .frame(maxWidth: .infinity, alignment: .leading)
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

/// Measures the content's height for a sheet that fits what it holds.
struct FittedSheet: ViewModifier {
  @State private var height: CGFloat = 320

  func body(content: Content) -> some View {
    content
      .fixedSize(horizontal: false, vertical: true)
      .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
      .frame(maxHeight: .infinity, alignment: .top)
      .matineeSheet([.height(height), .large])
  }
}
