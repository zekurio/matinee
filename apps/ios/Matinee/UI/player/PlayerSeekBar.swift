import MatineeCore
import MatineeKit
import SwiftUI
import UIKit

/*
 * The web's seek bar (player-controls.tsx, `SeekBar` and `MediaSlider`):
 * a thin track in translucent white, what's buffered a shade lighter,
 * what's played in the accent, and a white thumb, in a 44-point strip a
 * finger can hit. A press jumps; a drag then moves by how far the finger
 * travels, finer the slower it goes (MatineeCore's `SeekDrag`), with the
 * trickplay frame and the time over the thumb while it's held. The web
 * shows its thumb only under a pointer or a drag; a finger has no hover,
 * so here it always shows, as Android's does, and grows while held.
 */

struct SeekBar: View {
  let controller: PlayerController
  let onTouch: () -> Void
  @State private var width: CGFloat = 0
  @State private var drag: SeekDrag?
  @Environment(\.palette) private var palette
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.horizontalSizeClass) private var sizeClass

  /// The trickplay frame's width: the web's `w-40 sm:w-60`, 160 on a phone and 240 where there's room.
  private var previewWidth: CGFloat { sizeClass == .regular ? 240 : 160 }

  private var back: Double { Double(controller.preferences.skipBack) }
  private var ahead: Double { Double(controller.preferences.skipForward) }

  var body: some View {
    let duration = max(0, controller.duration)
    let scrub = controller.scrubPosition
    let shown = scrub ?? controller.position
    let enabled = seekable(duration)
    let thumbX = seekThumbX(shown, width: width, duration: duration)
    let thumb: CGFloat = scrub != nil ? 18 : SEEK_THUMB
    ZStack(alignment: .leading) {
      // `h-1 rounded-full bg-white/25`, buffered `bg-white/30` over it, played in the accent.
      Capsule().fill(.white.opacity(0.25)).frame(height: 4)
      Capsule().fill(.white.opacity(0.3))
        .frame(width: max(0, width * seekFraction(controller.buffered, duration: duration)), height: 4)
      Capsule().fill(palette.accent).frame(width: max(0, thumbX), height: 4)
      Circle().fill(.white)
        .frame(width: thumb, height: thumb)
        .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
        .offset(x: thumbX - thumb / 2)
        .opacity(enabled ? 1 : 0)
        .animation(Motion.animation(Motion.color, reduceMotion: reduceMotion), value: thumb)
    }
    .frame(height: TouchTarget)
    .frame(maxWidth: .infinity)
    .contentShape(Rectangle())
    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
    .overlay(alignment: .bottomLeading) {
      if let scrub, enabled {
        // Over the thumb, kept inside the controls: it may hang past the
        // track's ends over the padding beside it, as the web's does.
        let wide = controller.trickplay.map { $0.width > 0 } ?? false
        let preview = wide ? previewWidth + 2 * Space.s1 : 64
        let room = Space.s3
        SeekPreview(controller: controller, seconds: scrub, width: previewWidth)
          .frame(width: preview)
          .offset(
            x: min(max(thumbX - preview / 2, -room), width - preview + room),
            y: -(TouchTarget / 2 + Space.s5))
          .allowsHitTesting(false)
      }
    }
    .gesture(scrubbing(duration: duration), including: enabled ? .all : .subviews)
    .accessibilityElement()
    .accessibilityLabel(Str.a11yPlayerSeek)
    .accessibilityValue(
      enabled ? Str.a11yPlayerPosition(formatClock(shown), formatClock(duration)) : formatClock(shown))
    .accessibilityAdjustableAction { direction in
      guard enabled else { return }
      let forward = direction == .increment
      let to = seekStepped(from: shown, direction: forward ? 1 : -1, step: forward ? ahead : back, duration: duration)
      Task { await controller.seekTo(to) }
      onTouch()
    }
  }

  /// A press jumps to the time under it, and a drag moves on from there.
  private func scrubbing(duration: Double) -> some Gesture {
    DragGesture(minimumDistance: 0)
      .onChanged { value in
        let x = value.location.x
        let ms = value.time.timeIntervalSinceReferenceDate * 1000
        if var current = drag {
          controller.scrub(to: current.move(to: x, atMs: ms, width: width, duration: duration))
          drag = current
        } else {
          let at = seekUnder(x: x, width: width, duration: duration)
          drag = SeekDrag(x: x, atMs: ms, value: at)
          controller.beginScrub()
          controller.scrub(to: at)
        }
        onTouch()
      }
      .onEnded { _ in
        drag = nil
        Task { await controller.endScrub() }
        onTouch()
      }
  }
}

/// What the seek bar shows over the thumb while it's held: the trickplay
/// frame there and the time, in the web's `rounded-lg bg-black/45 p-1`
/// glass, or the time alone in a small chip without trickplay.
private struct SeekPreview: View {
  let controller: PlayerController
  let seconds: Double
  let width: CGFloat

  var body: some View {
    let time = Text(formatClock(seconds))
      .textStyle(.xs, weight: .medium)
      .monospacedDigit()
      .foregroundStyle(.white)
    if let images = controller.trickplay, images.width > 0 {
      VStack(spacing: Space.s1) {
        TrickplayFrameView(controller: controller, seconds: seconds)
          .frame(width: width, height: width * CGFloat(images.height) / CGFloat(images.width))
          .clipShape(RoundedRectangle.kit(Radius.md))
        time
      }
      .padding(Space.s1)
      .padding(.bottom, 2)
      .pictureGlass(in: RoundedRectangle.kit(Radius.lg))
      .kitShadow(.menu)
      .accessibilityHidden(true)
    } else {
      time
        .padding(.horizontal, Space.s2)
        .padding(.vertical, Space.s1)
        .pictureGlass(in: RoundedRectangle.kit(Radius.md))
        .accessibilityHidden(true)
    }
  }
}

/// The trickplay frame at `seconds`, cut from the server's tiles; black while its tile loads.
struct TrickplayFrameView: View {
  let controller: PlayerController
  let seconds: Double
  @State private var tiles = TrickplayTiles.shared

  var body: some View {
    ZStack {
      Color.black
      if let frame = controller.trickplayFrame(at: seconds), let image = tiles.frame(frame, controller) {
        Image(uiImage: image).resizable().interpolation(.medium)
      }
    }
  }
}

/// Trickplay tiles as they load, kept while the player shows: one sheet
/// holds many frames, so a scrub across it loads it once.
@Observable final class TrickplayTiles {
  static let shared = TrickplayTiles()
  private var sheets: [String: CGImage] = [:]
  @ObservationIgnored private var loading: Set<String> = []

  /// The frame cut from its sheet, or nil while the sheet loads.
  func frame(_ frame: TrickplayFrame, _ controller: PlayerController) -> UIImage? {
    guard let sheet = sheets[frame.url] else {
      load(frame.url, controller)
      return nil
    }
    let rect = CGRect(x: frame.x, y: frame.y, width: frame.width, height: frame.height)
    return sheet.cropping(to: rect).map { UIImage(cgImage: $0) }
  }

  func clear() {
    sheets = [:]
    loading = []
  }

  private func load(_ address: String, _ controller: PlayerController) {
    guard !loading.contains(address), let url = URL(string: address) else { return }
    loading.insert(address)
    Task {
      let request = await controller.mediaRequest(url: url)
      guard let (data, response) = try? await URLSession.shared.data(for: request),
        (response as? HTTPURLResponse)?.statusCode == 200,
        let image = UIImage(data: data)?.cgImage
      else {
        loading.remove(address)
        return
      }
      sheets[address] = image
    }
  }
}
