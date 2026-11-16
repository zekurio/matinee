import MatineeCore
import MatineeKit
import SwiftUI
import UIKit

/*
 * PlayerScreen.kt's `Controls`, laid out as Android's phone player has it
 * now and drawn as the web's touch layout (video-player.tsx with
 * `coarse`): the way back, the title, and the menus up top; play in the
 * middle between the skips and, for an episode, the previous and next
 * episodes outside them; and at the bottom the times over a seek bar the
 * full width, with nothing beside it or under it. Shades at the top and
 * bottom keep them legible over a bright picture.
 *
 * Time runs left to right whatever the language, as tape does: Material
 * and Apple's guidelines keep a media timeline and its transport
 * unmirrored, so the middle row and the bottom keep left-to-right while
 * the top bar mirrors with the language.
 */

struct PlayerControls: View {
  let controller: PlayerController
  let prefs: PlayerPrefs
  let pip: PictureInPictureModel
  let close: () -> Void
  let onMenu: (PlayerMenu) -> Void
  let onTouch: () -> Void
  /// Locks the screen, when settings show the lock button.
  let onLock: (() -> Void)?
  /// How far up from the screen's bottom edge the bottom controls reach.
  @Binding var controlsTop: CGFloat
  let screenHeight: CGFloat

  var body: some View {
    ZStack {
      Shades()
      // Under the bars, so the trickplay frame over the seek bar covers the
      // play button rather than the other way round.
      Transport(controller: controller, prefs: prefs, onTouch: onTouch)
        .environment(\.layoutDirection, .leftToRight)
      VStack(spacing: 0) {
        PlayerTopBar(
          controller: controller, prefs: prefs, pip: pip, close: close, onMenu: onMenu, onLock: onLock)
        Spacer(minLength: 0)
        PlayerBottomBar(controller: controller, onTouch: onTouch)
          .environment(\.layoutDirection, .leftToRight)
          .onGeometryChange(for: CGFloat.self) { proxy in
            proxy.frame(in: .global).minY
          } action: { top in
            controlsTop = max(0, screenHeight - top)
          }
      }
    }
  }
}

/// The web's shades: black from 80% through 50% to clear at the top, and
/// from 85% through 45% at the bottom, behind the bars.
private struct Shades: View {
  var body: some View {
    VStack(spacing: 0) {
      LinearGradient(
        stops: [
          .init(color: .black.opacity(0.8), location: 0), .init(color: .black.opacity(0.5), location: 0.5),
          .init(color: .clear, location: 1),
        ], startPoint: .top, endPoint: .bottom
      )
      .frame(height: 150)
      Spacer(minLength: 0)
      LinearGradient(
        stops: [
          .init(color: .clear, location: 0), .init(color: .black.opacity(0.45), location: 0.45),
          .init(color: .black.opacity(0.85), location: 1),
        ], startPoint: .top, endPoint: .bottom
      )
      .frame(height: 210)
    }
    .ignoresSafeArea()
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }
}

/// The control buttons over the picture, at Android's size: 52 round, the
/// icon 26 in white at 85%, nothing behind it until it's pressed.
private struct ControlButton: View {
  let icon: Lucide
  let label: String
  var size: CGFloat = 52
  var iconSize: CGFloat = 26
  let action: () -> Void

  var body: some View {
    RoundIconButton(
      icon, label: label, look: .ghost, size: size, iconSize: iconSize, tint: .white.opacity(0.85), action: action
    )
    .pictureShadow()
  }
}

/// The way back, the title, and the buttons for the menus, picture in
/// picture, AirPlay, and the lock, each as settings show them.
private struct PlayerTopBar: View {
  let controller: PlayerController
  let prefs: PlayerPrefs
  let pip: PictureInPictureModel
  let close: () -> Void
  let onMenu: (PlayerMenu) -> Void
  let onLock: (() -> Void)?
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: Space.s1) {
      ControlButton(icon: .arrowLeft, label: Str.playerBack, action: close)
      if let item = controller.item {
        let label = itemLabel(item)
        VStack(alignment: .leading, spacing: 0) {
          Text(label.title)
            .pageTitleStyle()
            .foregroundStyle(.white)
            .lineLimit(1)
          if let line = subtitleLine(item, label), !line.isEmpty {
            Text(line).textStyle(.sm).foregroundStyle(.white.opacity(0.75)).lineLimit(1)
          }
        }
        .pictureShadow()
        .padding(.leading, Space.s2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
      } else {
        Spacer(minLength: 0)
      }
      // AirPlay and picture in picture play from AVPlayer only; mpv has
      // neither, so with it they don't show.
      if controller.player != nil {
        AirPlayButton(active: controller.player?.isExternalPlaybackActive == true)
        if PictureInPictureModel.supported, prefs.pictureInPicture, prefs.pictureInPictureButton, pip.possible {
          ControlButton(icon: .pictureInPicture, label: Str.playerPip, action: pip.start)
        }
      }
      if prefs.audioButton {
        ControlButton(icon: .audioLines, label: Str.playerMenuAudio) { onMenu(.audio) }
      }
      if prefs.subtitlesButton { SubtitlesButton(controller: controller, onMenu: onMenu) }
      ControlButton(icon: .gauge, label: Str.playerSpeed) { onMenu(.speed) }
        .accessibilityValue(speedLabel(controller.speed))
      // A download plays as it is, with no other quality to pick.
      if !controller.isLocal {
        ControlButton(icon: .settings, label: Str.playerQuality) { onMenu(.quality) }
      }
      // Last, at the corner, where the unlock button shows.
      if let onLock {
        ControlButton(icon: .lock, label: Str.playerLock, action: onLock)
      }
    }
    .frame(minHeight: TOP_BAR_HEIGHT)
    .padding(.horizontal, Space.s3)
    .padding(.top, Space.s2)
  }

  /// The web's line under the title: "S1:E2 · Show" for an episode, the year for a movie.
  private func subtitleLine(_ item: MediaItem, _ label: ItemNames) -> String? {
    if let code = label.code { return "\(code) · \(label.showName)" }
    return label.year
  }
}

/// The top bar's height, which the unlock button lines up with.
let TOP_BAR_HEIGHT: CGFloat = 52

/// Opens the subtitles menu, with a line in the accent under it while subtitles are on.
private struct SubtitlesButton: View {
  let controller: PlayerController
  let onMenu: (PlayerMenu) -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    ControlButton(icon: .captions, label: Str.playerMenuSubtitles) { onMenu(.subtitles) }
      // The web's `bg-primary h-0.5 w-5 rounded-full`, 6 from the bottom.
      .overlay(alignment: .bottom) {
        if controller.subtitle != nil {
          Capsule().fill(palette.accent).frame(width: 20, height: 2).offset(y: -8).allowsHitTesting(false)
        }
      }
      // The line shows subtitles are on; VoiceOver hears which.
      .accessibilityValue(controller.subtitle.map { subtitleLabel($0, controller.subtitles) } ?? Str.playerSubtitlesOff)
  }
}

/// Play in the middle, the skips either side and, for an episode, the
/// previous and next episodes outside them: the web's touch row, `big`.
/// While it loads, the spinner in the middle of the screen takes play's place.
private struct Transport: View {
  let controller: PlayerController
  let prefs: PlayerPrefs
  let onTouch: () -> Void
  @Environment(\.horizontalSizeClass) private var sizeClass

  private var back: Double { Double(controller.preferences.skipBack) }
  private var ahead: Double { Double(controller.preferences.skipForward) }

  var body: some View {
    GeometryReader { proxy in
      // The web's `gap-2 sm:gap-8`: tight on a narrow screen, roomy from 640 points.
      let gap = proxy.size.width >= 640 ? Space.s8 : Space.s2
      HStack(spacing: gap) {
        if controller.isEpisode {
          EpisodeButton(icon: .skipBack, label: Str.playerPreviousEpisode, enabled: controller.previous != nil) {
            controller.playPrevious()
            onTouch()
          }
        }
        if prefs.skipButtons {
          SkipButton(icon: .rotateCcw, seconds: Int(back), label: Str.playerSkipBack(Int(back))) {
            Task { await controller.skip(-back) }
            onTouch()
          }
        }
        ZStack {
          if !controller.loading {
            PlayButton(playing: controller.playing) {
              controller.togglePlay()
              onTouch()
            }
          }
        }
        .frame(width: 72, height: 72)
        if prefs.skipButtons {
          SkipButton(icon: .rotateCw, seconds: Int(ahead), label: Str.playerSkipForward(Int(ahead))) {
            Task { await controller.skip(ahead) }
            onTouch()
          }
        }
        if controller.isEpisode {
          EpisodeButton(icon: .skipForward, label: Str.playerNextEpisode, enabled: controller.next != nil) {
            if let next = controller.next { controller.playInstead(next) }
            onTouch()
          }
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}

/// The web's big play button: 72 round, black at 45% over a blur with a
/// faint ring, the filled icon at 32.
private struct PlayButton: View {
  let playing: Bool
  let action: () -> Void

  var body: some View {
    Pressable(shape: Circle(), action: action) {
      LucideIcon(playing ? .pause : .play, size: 32, tint: .white, scales: false)
        // The triangle's weight sits left of its box; the web nudges it.
        .offset(x: playing ? 0 : 2)
        .frame(width: 72, height: 72)
        .pictureGlass(in: Circle(), shade: .light)
        .contentShape(Circle())
    }
    .accessibilityLabel(playing ? Str.playerPause : Str.playerPlay)
  }
}

/// A circular arrow with the skip length inside it: Android's `SkipButton`.
/// The web's player has drawn lucide's rewind and fast-forward since #42;
/// Android kept the arrows, and the phone follows Android.
private struct SkipButton: View {
  let icon: Lucide
  let seconds: Int
  let label: String
  let action: () -> Void

  var body: some View {
    Pressable(shape: Circle(), action: action) {
      ZStack {
        LucideIcon(icon, size: 36, tint: .white.opacity(0.85), scales: false)
        // The label says how far already.
        Text("\(seconds)")
          .font(RedHatText.font(fixedSize: 12, weight: .bold))
          .monospacedDigit()
          .foregroundStyle(.white.opacity(0.85))
          .padding(.top, 1)
          .accessibilityHidden(true)
      }
      .pictureShadow()
      .frame(width: 56, height: 56)
      .contentShape(Circle())
    }
    .accessibilityLabel(label)
  }
}

/// Plays the episode before or after this one, or sits dimmed at either end of the show.
private struct EpisodeButton: View {
  let icon: Lucide
  let label: String
  let enabled: Bool
  let action: () -> Void

  var body: some View {
    ControlButton(icon: icon, label: label, size: 64, iconSize: 30, action: action)
      .disabled(!enabled)
  }
}

/// The time played and the full length, over the seek bar: Android's
/// `SeekBar` since it dropped the end time and the countdown (#54), and
/// the web's `ElapsedTime` and `TotalTime`.
private struct PlayerBottomBar: View {
  let controller: PlayerController
  let onTouch: () -> Void

  var body: some View {
    let clocks = SeekClocks(position: controller.scrubPosition ?? controller.position, duration: controller.duration)
    VStack(spacing: 0) {
      HStack(spacing: Space.s3) {
        SteadyClock(text: clocks.elapsed, widest: clocks.widest, alignment: .leading)
        Spacer(minLength: 0)
        SteadyClock(text: clocks.length, widest: clocks.widest, alignment: .trailing)
      }
      .padding(.horizontal, Space.s1)
      SeekBar(controller: controller, onTouch: onTouch)
    }
    .padding(.horizontal, Space.s3)
    .padding(.bottom, Space.s1)
  }
}

/// The web's text over the picture: `text-sm font-medium` white with tabular figures and a shadow.
private struct OverlayText: ViewModifier {
  func body(content: Content) -> some View {
    content
      .textStyle(.sm, weight: .medium)
      .monospacedDigit()
      .foregroundStyle(.white)
      .lineLimit(1)
      .pictureShadow()
  }
}

/// A time beside the seek bar, as wide as `widest`, the longest the
/// length lets it show, so neither it nor what sits beside it moves as it
/// counts: Android's `SeekClock`.
private struct SteadyClock: View {
  let text: String
  let widest: String
  let alignment: Alignment

  var body: some View {
    ZStack(alignment: alignment) {
      Text(widest).hidden()
      Text(text)
    }
    .modifier(OverlayText())
  }
}
