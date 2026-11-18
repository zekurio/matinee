import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvOverlay.kt: the TV player's controls, kept low and small so the
 * picture stays the thing to look at. A shade up from the bottom; the
 * episode's number and show over its name at the left; one wide seek bar
 * with the time played and the file's length either side (Android TV
 * dropped the end time and the countdown in #54); and one row of
 * round buttons: play between the skips, the episodes either side outside
 * them, and at the right the menus, with Skip intro or the next episode
 * before them when there is one. All inside the overscan margins.
 */

/// Where focus can be in the player.
enum TVPlayerFocus: Hashable {
  /// The picture, while the controls are away.
  case surface
  /// The action alone on the picture, while the controls are away.
  case corner
  case seek, play, back, ahead, previous, next
  /// The action in the controls' row.
  case action
  case menu(TVPlayerMenu)
}

/// How big the player's round buttons are, and play, a step up.
private let BUTTON: CGFloat = TVButtons.height
private let PLAY: CGFloat = 104

struct TVOverlay: View {
  let controller: PlayerController
  let focus: FocusState<TVPlayerFocus?>.Binding
  let back: Double
  let ahead: Double
  /// Where the remote has taken the seek bar's head, while it's held or swiped.
  let scrub: Double?
  let action: TVPictureAction?
  let runAction: () -> Void
  let onSelectSeek: () -> Void
  let onMenu: (TVPlayerMenu) -> Void
  /// How far up from the screen's bottom the controls reach, for the subtitles to clear.
  let onTop: (CGFloat) -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    ZStack(alignment: .bottom) {
      // About half black behind the title, two thirds behind the bar, and
      // four fifths at the bottom edge, so the picture stays watchable.
      LinearGradient(
        stops: [
          .init(color: .clear, location: 0), .init(color: .black.opacity(0.5), location: 0.3),
          .init(color: .black.opacity(0.65), location: 0.55), .init(color: .black.opacity(0.8), location: 1),
        ], startPoint: .top, endPoint: .bottom
      )
      .containerRelativeFrame(.vertical) { height, _ in height * 0.62 }
      .allowsHitTesting(false)
      VStack(alignment: .leading, spacing: 0) {
        TVPlayerHeading(controller: controller)
        // Clear of the time that floats over the bar's head while it has focus.
        seekBar.padding(.top, TVSeekBars.bubbleRoom)
        buttons.padding(.top, TVSpace.s6)
      }
      .padding(TVOverscan.insets)
      .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { onTop($0) }
      .focusSection()
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
  }

  private var seekBar: some View {
    let duration = max(0, controller.duration)
    let shown = scrub ?? controller.position
    let clocks = SeekClocks(position: shown, duration: duration)
    return TVSeekBar(
      fraction: seekFraction(shown, duration: duration), buffered: seekFraction(controller.buffered, duration: duration),
      elapsed: clocks.elapsed, length: clocks.length, bubble: clocks.elapsed, widest: clocks.widest,
      scrubbing: scrub != nil,
      label: Str.a11yPlayerSeek,
      value: seekable(duration) ? Str.a11yPlayerPosition(formatClock(shown), formatClock(duration)) : formatClock(shown),
      action: onSelectSeek
    ) {
      if let images = controller.trickplay, images.width > 0, images.height > 0 {
        TrickplayFrameView(controller: controller, seconds: shown)
          .frame(
            width: TVSeekBars.previewWidth,
            height: TVSeekBars.previewWidth * CGFloat(images.height) / CGFloat(images.width))
      }
    }
    .focused(focus, equals: .seek)
  }

  private var buttons: some View {
    HStack(spacing: TVButtons.gap) {
      // Only an episode there is, so the remote never stops on one that does nothing.
      if let previous = controller.previous, controller.isEpisode {
        TVRoundButton(.skipBack, label: Str.playerPreviousEpisode, size: BUTTON) { controller.playInstead(previous) }
          .focused(focus, equals: .previous)
      }
      TVRoundButton(label: Str.playerSkipBack(Int(back)), size: BUTTON) {
        Task { await controller.skip(-back) }
      } content: {
        SkipFace(icon: .rotateCcw, seconds: back)
      }
      .focused(focus, equals: .back)
      TVRoundButton(
        controller.playing ? .pause : .play, label: controller.playing ? Str.playerPause : Str.playerPlay, size: PLAY,
        action: controller.togglePlay
      )
      .focused(focus, equals: .play)
      TVRoundButton(label: Str.playerSkipForward(Int(ahead)), size: BUTTON) {
        Task { await controller.skip(ahead) }
      } content: {
        SkipFace(icon: .rotateCw, seconds: ahead)
      }
      .focused(focus, equals: .ahead)
      if let next = controller.next, controller.isEpisode {
        TVRoundButton(.skipForward, label: Str.playerNextEpisode, size: BUTTON) { controller.playInstead(next) }
          .focused(focus, equals: .next)
      }
      Spacer(minLength: TVSpace.s6)
      if let action {
        TVPictureActionButton(action: action, run: runAction)
          .focused(focus, equals: .action)
          .transition(.opacity)
      }
      ForEach(TVPlayerMenu.allCases) { menu in
        TVIconButton(
          menu.icon, label: menu.title,
          tint: menu == .subtitles && controller.subtitle != nil ? palette.accent : nil
        ) { onMenu(menu) }
        .focused(focus, equals: .menu(menu))
      }
    }
    .frame(height: PLAY)
  }
}

/// A skip's arrow with how far it skips in its middle, as the phone draws it.
private struct SkipFace: View {
  let icon: Lucide
  let seconds: Double

  var body: some View {
    ZStack {
      LucideIcon(icon, size: 52, scales: false)
      Text(String(Int(seconds))).textStyle(.iconNumber).padding(.top, 3).accessibilityHidden(true)
    }
  }
}

/// The name, with the episode's number and show over it: Android TV's `Heading`.
private struct TVPlayerHeading: View {
  let controller: PlayerController

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if let item = controller.item {
        let label = itemLabel(item)
        if let code = label.code, item.title?.kind == TitleKind.show {
          Text("\(code) · \(label.showName)").textStyle(.label).opacity(0.75).lineLimit(1)
        }
        Text(label.title).textStyle(.headline).lineLimit(1)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .shadow(color: .black.opacity(0.6), radius: 5, y: 2)
  }
}
