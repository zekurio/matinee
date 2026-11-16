import MatineeCore
import MatineeKit
import SwiftUI

/*
 * What PlayerScreen.kt draws over the video besides the controls: the
 * failure with its way back, the note after a pinch, the note about what
 * the server did instead, Skip intro and the like, the next episode, and
 * the lock. Each in the web player's look (skip-segment.tsx, up-next.tsx,
 * playback-notices.ts) where the web has it.
 */

/// The heading over `refusalMessage` when the server won't play the file for this account.
func refusalTitle(_ refusal: Refusal) -> String {
  switch refusal {
  case .restricted: Str.playerRestricted
  case .busy: Str.playerBusy
  }
}

/// What the player says under `refusalTitle`: why, in the app's language for a
/// reason it knows, else in the server's words, as Android's `refusalMessage`.
func refusalMessage(_ reason: RefusalReason?, fallback: String) -> String {
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

/// What failed, with the way back and, unless trying again gets the same
/// answer, Retry: the web's empty state over the dimmed picture. It takes
/// every touch, so none reaches the video under it.
struct PlayerFailure: View {
  let title: String
  let message: String?
  let retry: (() -> Void)?
  let close: () -> Void

  var body: some View {
    ZStack(alignment: .topLeading) {
      Color.black.opacity(0.8).ignoresSafeArea()
        .contentShape(Rectangle())
        .onTapGesture {}
      EmptyState(icon: .circleAlert, title: title, description: message) {
        if let retry {
          MatineeButton(Str.commonRetry, icon: .refreshCw, look: .secondary, size: .md, action: retry)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      RoundIconButton(
        .arrowLeft, label: Str.playerBack, look: .ghost, size: TouchTarget, tint: .white.opacity(0.85),
        action: close
      )
      // Where the controls' back button is.
      .frame(height: TOP_BAR_HEIGHT)
      .padding(.horizontal, Space.s3)
      .padding(.top, Space.s2)
    }
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
          .textStyle(.sm, weight: .medium)
          .foregroundStyle(.white)
          .padding(.horizontal, Space.s4)
          .padding(.vertical, Space.s2)
          .pictureGlass(in: Capsule(), shade: .medium, ring: 0)
          .transition(.opacity)
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

/// Says what the server did instead of what the viewer asked for, for a
/// few seconds, as the web's toast does: a subtitle it couldn't burn in, a
/// quality it couldn't encode, a switch that didn't go through.
struct PlayerNoticeNote: View {
  let controller: PlayerController
  @State private var shown: Notice? = PlayerDebug.notice
  @State private var count = 0

  var body: some View {
    ZStack {
      if let note = shown {
        Toast(ToastMessage(title(note), description: detail(note), kind: .warning))
          .frame(maxWidth: 420)
          .transition(.opacity)
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

  private func title(_ note: Notice) -> String {
    switch note.kind {
    case .burnInFailed: Str.playerNoticeBurnInFailed
    case .qualityFailed, .switchFailed: Str.playerNoticeSwitchFailed
    }
  }

  private func detail(_ note: Notice) -> String? {
    let detail: String? =
      switch note.kind {
      case .burnInFailed: Str.playerNoticeBurnInFailedDetail
      case .qualityFailed: Str.playerNoticeQualityFailedDetail
      case .switchFailed: note.detail.map { refusalMessage(note.refusal, fallback: $0) }
      }
    return detail?.isEmpty == false ? detail : nil
  }
}

/// Tells one notice from the next, which `Notice` itself can't, having no identity.
private struct NoticeKey: Equatable {
  let kind: NoticeKind
  let detail: String?
  init(_ notice: Notice) {
    kind = notice.kind
    detail = notice.detail
  }
}

/// What the button that skips `kind` says, like "Skip intro".
func skipSegmentLabel(_ kind: String) -> String {
  switch kind {
  case MediaSegmentKind.recap: Str.playerSkipRecap
  case MediaSegmentKind.credits: Str.playerSkipCredits
  case MediaSegmentKind.preview: Str.playerSkipPreview
  default: Str.playerSkipIntro
  }
}

/// Skip intro, and the like for the other segments the server found: for
/// a few seconds once the segment starts, and with the controls after
/// that, as in Jellyfin. The web's button, `bg-black/70` glass.
struct SkipSegmentButton: View {
  let controller: PlayerController
  let controls: Bool
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let segment = controller.skippable(controls: controls)
    ZStack {
      if let segment {
        Pressable(shape: RoundedRectangle.kit(Radius.lg)) {
          Task { await controller.skipSegment() }
        } label: {
          HStack(spacing: Space.s2) {
            Text(skipSegmentLabel(segment.kind))
            LucideIcon(.skipForward, size: 16, tint: .white, scales: false)
          }
          .textStyle(.sm, weight: .medium)
          .foregroundStyle(.white)
          .padding(.horizontal, Space.s4)
          .frame(minHeight: TouchTarget)
          .pictureGlass(in: RoundedRectangle.kit(Radius.lg), shade: .strong)
          .kitShadow(.menu)
        }
        .transition(.opacity)
      }
    }
    .animation(Motion.animation(Motion.enter, reduceMotion: reduceMotion), value: segment)
  }
}

/// The next episode while the credits roll or once the file ended, starting
/// by itself after the controller's countdown, or waiting for Play when
/// settings turned autoplay off. Hide puts it away until the end. The
/// web's card: `rounded-xl bg-black/80` glass.
struct UpNextCard: View {
  let controller: PlayerController
  /// Its buttons alone, in a row, where there's no room for the card.
  var compact = false

  var body: some View {
    if let offer = controller.upNext {
      let upcoming = offer.item
      let label = itemLabel(upcoming)
      let name = episodeCode(upcoming).map { Str.mediaCodeTitle($0, label.title) } ?? label.title
      if compact {
        buttons(offer)
          .padding(Space.s2)
          .pictureGlass(in: RoundedRectangle.kit(Radius.xl), shade: .solid, ring: 0.1)
          .kitShadow(.menu)
          .accessibilityElement(children: .contain)
          .accessibilityLabel("\(Str.playerUpNext): \(name)")
      } else {
        VStack(alignment: .leading, spacing: 0) {
          Text(Str.playerUpNext).textStyle(.sm).foregroundStyle(.white.opacity(0.7))
          Text(name)
            .textStyle(.base, weight: .semibold)
            .foregroundStyle(.white)
            .lineLimit(2)
            .padding(.top, Space.s1)
          buttons(offer).padding(.top, Space.s3)
        }
        .padding(Space.s4)
        .frame(maxWidth: 352, alignment: .leading)
        .pictureGlass(in: RoundedRectangle.kit(Radius.xl), shade: .solid, ring: 0.1)
        .kitShadow(.menu)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Str.playerUpNext)
      }
    }
  }

  /// Play, counting down while it does, and Hide while the credits roll or Cancel once it ended.
  private func buttons(_ offer: UpNextOffer) -> some View {
    HStack(spacing: Space.s2) {
      MatineeButton(look: .primary, size: .md, action: controller.playNext) {
        LucideIcon(.play, size: 16)
        Text(controller.nextCountdown.map(Str.playerUpNextIn) ?? Str.playerPlay).monospacedDigit()
      }
      if !controller.ended {
        MatineeButton(Str.playerUpNextHide, look: .secondary, size: .md, action: controller.hideNext)
      } else if !offer.cancelled {
        MatineeButton(Str.playerUpNextCancel, look: .secondary, size: .md, action: controller.cancelNext)
      }
    }
  }
}

/// Covers the player while it's locked and takes every touch, so none
/// reaches the controls or the gestures under it. An open lock shows in the
/// corner, where the lock button was, for a few seconds, and tapping it
/// unlocks. Once it's gone, a tap on that spot brings it back, and a touch
/// anywhere else does nothing. With `keep`, as while VoiceOver runs, it stays.
struct LockedScreen: View {
  let keep: Bool
  let onUnlock: () -> Void
  @State private var shown = true
  /// Counts taps on the hidden button's spot, each showing it again.
  @State private var tapped = 0
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    ZStack(alignment: .topTrailing) {
      Color.clear
        .contentShape(Rectangle())
        .onTapGesture {}
        .gesture(DragGesture(minimumDistance: 0).onChanged { _ in })
        .simultaneousGesture(MagnifyGesture().onChanged { _ in })
        .ignoresSafeArea()
        .accessibilityHidden(true)
      // The same size and place as the lock button in the controls' top bar.
      Pressable(shape: Circle()) {
        if shown { onUnlock() } else { tapped += 1 }
      } label: {
        LucideIcon(.lockOpen, size: 26, tint: .white, scales: false)
          .frame(width: 52, height: 52)
          .pictureGlass(in: Circle(), shade: .medium)
          .opacity(shown ? 1 : 0)
          .contentShape(Circle())
      }
      .accessibilityLabel(Str.playerUnlock)
      .frame(height: TOP_BAR_HEIGHT)
      .padding(.horizontal, Space.s3)
      .padding(.top, Space.s2)
    }
    .animation(Motion.animation(Motion.color, reduceMotion: reduceMotion), value: shown)
    .accessibilityElement(children: .contain)
    .accessibilityAddTraits(.isModal)
    .task(id: TaskKey(tapped: tapped, keep: keep)) {
      shown = true
      if keep { return }
      try? await Task.sleep(for: .milliseconds(HIDE_AFTER_MS))
      guard !Task.isCancelled else { return }
      shown = false
    }
  }

  private struct TaskKey: Equatable {
    let tapped: Int
    let keep: Bool
  }
}
