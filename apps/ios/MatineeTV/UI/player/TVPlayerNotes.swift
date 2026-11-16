import MatineeCore
import MatineeKit
import SwiftUI

/*
 * What TvPlayback.kt draws over the picture besides the controls: why
 * nothing plays (`TvPlayerFailure`), the note about what the server did
 * instead (PlayerScreen.kt's `PlayerNoticeNote`), and, Apple TV's own,
 * the mark a skip leaves while the controls are away.
 *
 * TODO(share): `refusalTitle`, `refusalMessage`, the notices' words, and `skipSegmentLabel`
 * are the iPhone's (Matinee/UI/player/PlayerNotes.swift), copied because
 * that file holds the phone's failure, lock, and up-next views too. The
 * split: the words into `PlayerWords.swift`, shared by both targets.
 */

/// The heading over `tvRefusalMessage` when the server won't play the file for this account.
func tvRefusalTitle(_ refusal: Refusal) -> String {
  switch refusal {
  case .restricted: Str.playerRestricted
  case .busy: Str.playerBusy
  }
}

/// What the player says under `tvRefusalTitle`: why, in the app's language for a
/// reason it knows, else in the server's words, as Android's `refusalMessage`.
func tvRefusalMessage(_ reason: RefusalReason?, fallback: String) -> String {
  switch reason {
  case .restricted(PlaybackRestriction.bitrate_original): Str.playerRestrictedOriginal
  case .restricted(PlaybackRestriction.bitrate_transcode): Str.playerRestrictedNoTranscode
  case .restricted(PlaybackRestriction.bitrate_failed): Str.playerRestrictedFailed
  case .restricted(PlaybackRestriction.bitrate): Str.playerRestrictedBitrate
  case .restricted(PlaybackRestriction.transcode): Str.playerRestrictedTranscode
  case .busy(let playing): Str.playerBusyDetail(playing)
  case .restricted, nil: fallback
  }
}

/// What the button that skips `kind` says, like "Skip intro".
func tvSkipSegmentLabel(_ kind: String) -> String {
  switch kind {
  case MediaSegmentKind.recap: Str.playerSkipRecap
  case MediaSegmentKind.credits: Str.playerSkipCredits
  case MediaSegmentKind.preview: Str.playerSkipPreview
  default: Str.playerSkipIntro
  }
}

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
        TVToast(ToastMessage(title(note), description: detail(note), kind: .warning))
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
    // A notice held for a screenshot, once the file has loaded, as a real one comes.
    .onChange(of: controller.item != nil) { _, loaded in
      guard loaded, count == 0, let notice = TVPlayerDebug.notice else { return }
      count += 1
      shown = notice
    }
    .task(id: count) {
      guard count > 0 else { return }
      try? await Task.sleep(for: .seconds(NOTICE_SECONDS))
      guard !Task.isCancelled else { return }
      shown = nil
    }
    .allowsHitTesting(false)
  }

  private func title(_ note: MatineeCore.Notice) -> String {
    switch note.kind {
    case .burnInFailed: Str.playerNoticeBurnInFailed
    case .qualityFailed, .switchFailed: Str.playerNoticeSwitchFailed
    }
  }

  private func detail(_ note: MatineeCore.Notice) -> String? {
    let detail: String? =
      switch note.kind {
      case .burnInFailed: Str.playerNoticeBurnInFailedDetail
      case .qualityFailed: Str.playerNoticeQualityFailedDetail
      case .switchFailed: note.detail.map { tvRefusalMessage(note.refusal, fallback: $0) }
      }
    return detail?.isEmpty == false ? detail : nil
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

/// A skip while the controls are away: Left or Right went back or ahead
/// by `seconds`. Apple TV's own player marks it at the side it went to,
/// so a press that lands somewhere a picture doesn't show still says it
/// did something. `total` adds up presses in a row.
struct TVSkipMark: Equatable {
  let direction: Int
  let total: Int
  let id: Int
}

/// The mark itself, at the left or the right of the picture's middle, fading as it goes.
struct TVSkipMarkView: View {
  let mark: TVSkipMark?
  @Environment(\.palette) private var palette
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    ZStack {
      if let mark {
        ZStack {
          LucideIcon(mark.direction < 0 ? .rotateCcw : .rotateCw, size: 104, scales: false)
          Text(String(mark.total)).textStyle(.label).monospacedDigit().padding(.top, 6)
        }
        .foregroundStyle(palette.foreground)
        .frame(width: 160, height: 160)
        .background(Color.black.opacity(0.45), in: Circle())
        .frame(maxWidth: .infinity, alignment: mark.direction < 0 ? .leading : .trailing)
        .padding(.horizontal, 280)
        .id(mark.direction)
        .transition(.opacity.combined(with: .scale(scale: 0.9)))
      }
    }
    .animation(Motion.animation(mark == nil ? Motion.exit : Motion.enter, reduceMotion: reduceMotion), value: mark)
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }
}
