import MatineeCore
import MatineeKit
import SwiftUI

/*
 * What PlayerScreen.kt draws over the video besides the controls: the
 * failure with its way back, the note after a pinch, the note about the
 * last answer, and the next episode once one ended.
 */

/// The heading over the server's words when it won't play the file for this account.
func refusalTitle(_ refusal: Refusal) -> String {
  switch refusal {
  case .restricted: Str.playerRestricted
  case .busy: Str.playerBusy
  }
}

/// What failed, with the way back and, unless trying again gets the same answer, Retry.
struct PlayerFailure: View {
  let title: String
  let message: String?
  let retry: (() -> Void)?
  let close: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      LegacyRoundIconButton(.arrowLeft, label: Str.playerBack, size: 52, iconSize: 26, background: .clear, action: close)
        .padding(8)
      ErrorBox(title, message, onRetry: retry)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

/// Says how the video now shows, for a moment after a pinch switched it.
struct ZoomNote: View {
  let count: Int
  let fill: Bool
  @State private var shown = false

  var body: some View {
    ZStack {
      if shown {
        Text(fill ? Str.playerFill : Str.playerFit)
          .textStyle(.base, weight: .semibold)
          .foregroundStyle(.white)
          .padding(.horizontal, 18)
          .padding(.vertical, 10)
          .background(.black.opacity(0.6), in: RoundedRectangle(cornerRadius: 12))
          .transition(Motion.fade)
      }
    }
    .task(id: count) {
      guard count > 0 else { return }
      withMotion(Motion.enter) { shown = true }
      try? await Task.sleep(for: .milliseconds(1200))
      guard !Task.isCancelled else { return }
      withMotion(Motion.exit) { shown = false }
    }
  }
}

/// How long a note about the last answer stays.
private let NOTICE_SECONDS = 5

/// Says what the server did instead of what the viewer asked for, for a few seconds.
struct PlayerNoticeNote: View {
  let controller: PlayerController
  @State private var shown: MatineeCore.Notice?
  @State private var count = 0

  var body: some View {
    ZStack {
      if let note = shown {
        VStack(spacing: 0) {
          Text(title(note)).textStyle(.base, weight: .semibold).foregroundStyle(.white)
          if let detail = detail(note), !detail.isEmpty {
            Text(detail).textStyle(.sm).foregroundStyle(.white.opacity(0.8))
          }
        }
        .multilineTextAlignment(.center)
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
        .frame(maxWidth: 420)
        .background(.black.opacity(0.75), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
        .transition(Motion.fade)
      }
    }
    // Each notice is new, even when it says the same as the last.
    .onChange(of: controller.notice.map { NoticeKey($0) }) { _, _ in
      guard let notice = controller.notice else { return }
      count += 1
      withMotion(Motion.enter) { shown = notice }
      controller.dismissNotice()
    }
    .task(id: count) {
      guard count > 0 else { return }
      try? await Task.sleep(for: .seconds(NOTICE_SECONDS))
      guard !Task.isCancelled else { return }
      withMotion(Motion.exit) { shown = nil }
    }
  }

  private func title(_ note: MatineeCore.Notice) -> String {
    switch note.kind {
    case .burnInFailed: Str.playerNoticeBurnInFailed
    case .qualityFailed, .switchFailed: Str.playerNoticeSwitchFailed
    }
  }

  private func detail(_ note: MatineeCore.Notice) -> String? {
    switch note.kind {
    case .burnInFailed: Str.playerNoticeBurnInFailedDetail
    case .qualityFailed: Str.playerNoticeQualityFailedDetail
    case .switchFailed: note.detail
    }
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

/// The next episode once one ended, starting by itself after the
/// controller's countdown, or waiting for Play when it was cancelled or
/// settings turned autoplay off.
struct UpNext: View {
  let controller: PlayerController
  let upcoming: MediaItem
  @Environment(\.palette) private var palette

  var body: some View {
    let label = itemLabel(upcoming)
    let left = controller.nextCountdown
    VStack(alignment: .leading, spacing: 0) {
      Text(Str.playerUpNext).textStyle(.sm, weight: .medium).foregroundStyle(palette.mutedForeground)
      Text(episodeCode(upcoming).map { Str.mediaCodeTitle($0, label.title) } ?? label.title)
        .textStyle(.base, weight: .semibold)
        .lineLimit(2)
        .padding(.top, 4)
      HStack(spacing: 8) {
        LegacyButton(height: 40, action: controller.playNext) {
          LucideIcon(.play, size: 14)
          Text(left.map(Str.playerUpNextIn) ?? Str.playerPlay).monospacedDigit()
        }
        if left != nil {
          LegacyButton(.frosted, height: 40, action: controller.cancelNext) {
            Text(Str.playerUpNextCancel)
          }
        }
      }
      .padding(.top, 12)
    }
    .padding(16)
    .frame(maxWidth: 360, alignment: .leading)
    .background(palette.popover.opacity(0.95), in: RoundedRectangle(cornerRadius: 12))
    .padding(24)
  }
}
