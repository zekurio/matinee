import MatineeCore
import MatineeKit
import SwiftUI

/*
 * What TvPlayback.kt draws over the picture besides the controls: why
 * nothing plays (`TvPlayerFailure`), the note about what the server did
 * instead (PlayerScreen.kt's `PlayerNoticeNote`), and, Apple TV's own,
 * the mark a skip leaves at the side it went to.
 *
 */

/// Why nothing plays, centred over the dimmed picture, with Try again
/// focused and Back beside it; without `retry`, as when the server refused
/// the file, only Back, since asking again gets the same answer.
struct TVPlayerFailure: View {
  let title: String
  let message: String?
  let retry: (() -> Void)?
  let close: () -> Void
  @Environment(\.palette) private var palette
  @FocusState private var focused: Bool

  var body: some View {
    VStack(spacing: 0) {
      LucideIcon(.circleAlert, size: 72, tint: palette.mutedForeground, scales: false)
        .padding(.bottom, TVSpace.s6)
      Text(title).textStyle(.headline).multilineTextAlignment(.center)
        .accessibilityAddTraits(.isHeader)
      if let message, !message.isEmpty {
        Text(message).textStyle(.body).foregroundStyle(palette.mutedForeground)
          .multilineTextAlignment(.center)
          .frame(maxWidth: 1120)
          .padding(.top, TVSpace.s2)
      }
      HStack(spacing: TVButtons.gap) {
        if let retry {
          TVButton(Str.commonRetry, icon: .refreshCw, action: retry).focused($focused)
          TVButton(Str.playerBack, icon: .arrowLeft, action: close)
        } else {
          TVButton(Str.playerBack, icon: .arrowLeft, action: close).focused($focused)
        }
      }
      .padding(.top, TVSpace.s8)
      .focusSection()
    }
    .padding(TVOverscan.insets)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color.black.opacity(0.85))
    .onAppear {
      // The cover is laid out a frame after it shows.
      for delay in [0.0, 0.2] {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { if !focused { focused = true } }
      }
    }
  }
}

/// How long a note about the last answer stays.
private let NOTICE_SECONDS = 5

/// Says what the server did instead of what the viewer asked for, for a
/// few seconds, at the top: a subtitle it couldn't burn in, a quality it
/// couldn't encode, a switch that didn't go through. Takes no focus.
struct TVPlayerNoticeNote: View {
  let controller: PlayerController
  @State private var shown: MatineeCore.Notice?
  @State private var count = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    ZStack {
      if let note = shown {
        TVToast(ToastMessage(noticeTitle(note), description: noticeDetail(note), kind: .warning))
          .frame(maxWidth: 1120)
          .transition(.move(edge: .top).combined(with: .opacity))
      }
    }
    .animation(Motion.animation(shown == nil ? Motion.exit : Motion.move, reduceMotion: reduceMotion), value: count)
    .animation(Motion.animation(Motion.exit, reduceMotion: reduceMotion), value: shown == nil)
    // Each notice is new, even when it says the same as the last.
    .onChange(of: controller.notice.map { NoticeKey($0) }) { _, _ in
      guard let notice = controller.notice else { return }
      count += 1
      shown = notice
      controller.dismissNotice()
    }
    .task(id: count) {
      guard count > 0 else { return }
      try? await Task.sleep(for: .seconds(NOTICE_SECONDS))
      guard !Task.isCancelled else { return }
      shown = nil
    }
    .allowsHitTesting(false)
  }
}

/// Tells one notice from the next, which `Notice` itself can't, having no identity.
private struct NoticeKey: Equatable {
  let kind: NoticeKind
  let detail: String?
  init(_ notice: MatineeCore.Notice) {
    kind = notice.kind
    detail = notice.detail
  }
}

/// How far the last skips went, at the side they went to, as Apple TV's
/// own player marks a skip, so a press that lands somewhere a picture
/// doesn't show still says it did something. Every skip shows it, from the
/// skip buttons or Left and Right while the controls are away, as the web
/// player's note since #52 and the phone's; presses in a row the same way
/// add up, and it goes `SKIP_FLASH_MS` after the last (MatineeCore's
/// `SkipFlash`). Android TV has none.
struct TVSkipMarkView: View {
  let flash: SkipFlash?
  @Environment(\.palette) private var palette
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    ZStack {
      if let flash {
        ZStack {
          LucideIcon(flash.forward ? .rotateCw : .rotateCcw, size: 104, scales: false)
          Text(String(flash.seconds)).textStyle(.label).monospacedDigit().padding(.top, 6)
        }
        .foregroundStyle(palette.foreground)
        .frame(width: 160, height: 160)
        .background(Color.black.opacity(0.45), in: Circle())
        .frame(maxWidth: .infinity, alignment: flash.forward ? .trailing : .leading)
        .padding(.horizontal, 280)
        .id(flash.forward)
        .transition(reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 0.9)))
      }
    }
    .animation(Motion.animation(flash == nil ? Motion.exit : Motion.enter, reduceMotion: reduceMotion), value: flash)
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }
}
