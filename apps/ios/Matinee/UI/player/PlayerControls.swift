import AVKit
import MatineeCore
import SwiftUI
import UIKit

/*
 * PlayerScreen.kt's `Controls`, `SkipButton`, `SeekBar`, `SeekTrack`, and
 * `TrickplayPreview`: drawn by the app, as Android and the web draw them,
 * over shades at the top and bottom so they read over bright video.
 */

struct PlayerControls: View {
  let controller: PlayerController
  let close: () -> Void
  let onMenu: (PlayerMenu) -> Void
  let onTouch: () -> Void
  @Environment(\.palette) private var palette

  private var back: Double { Double(controller.preferences.skipBack) }
  private var ahead: Double { Double(controller.preferences.skipForward) }

  var body: some View {
    ZStack {
      VStack(spacing: 0) {
        LinearGradient(colors: [.black.opacity(0.75), .clear], startPoint: .top, endPoint: .bottom)
          .frame(height: 160)
        Spacer(minLength: 0)
        LinearGradient(colors: [.clear, .black.opacity(0.85)], startPoint: .top, endPoint: .bottom)
          .frame(height: 220)
      }
      .ignoresSafeArea()
      .allowsHitTesting(false)
      VStack(spacing: 0) {
        top
        Spacer(minLength: 0)
        bottom
      }
      middle
    }
  }

  private var top: some View {
    HStack(spacing: 8) {
      RoundIconButton(.arrowLeft, label: Str.playerBack, size: 52, iconSize: 26, background: .clear, action: close)
      if let item = controller.item {
        let label = itemLabel(item)
        VStack(alignment: .leading, spacing: 0) {
          Text(label.title).textStyle(.titleLarge).lineLimit(1)
          if let code = label.code {
            Text("\(code) · \(label.showName)").textStyle(.bodyMedium)
              .foregroundStyle(palette.foreground.opacity(0.75)).lineLimit(1)
          }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
      }
      Spacer(minLength: 0)
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
  }

  private var middle: some View {
    HStack(spacing: 56) {
      SkipButton(icon: .rotateCcw, seconds: back, label: Str.playerSkipBack(Int(back))) {
        Task { await controller.skip(-back) }
        onTouch()
      }
      // The loading spinner is drawn at the screen's center, even when the
      // controls are hidden. Its slot stays without a button over it.
      ZStack {
        if !controller.loading {
          RoundIconButton(
            controller.playing ? .pause : .play, label: controller.playing ? Str.playerPause : Str.playerPlay,
            size: 96, iconSize: 48, background: .clear
          ) {
            controller.togglePlay()
            onTouch()
          }
        }
      }
      .frame(width: 96, height: 96)
      SkipButton(icon: .rotateCw, seconds: ahead, label: Str.playerSkipForward(Int(ahead))) {
        Task { await controller.skip(ahead) }
        onTouch()
      }
    }
  }

  private var bottom: some View {
    VStack(spacing: 0) {
      SeekBar(controller: controller, back: back, ahead: ahead, onTouch: onTouch)
      HStack(spacing: 0) {
        EndsAt(controller: controller)
        Spacer(minLength: 8)
        AirPlayButton()
        RoundIconButton(.audioLines, label: Str.playerMenuAudio, size: 52, iconSize: 26, background: .clear) {
          onMenu(.audio)
        }
        RoundIconButton(.captions, label: Str.playerMenuSubtitles, size: 52, iconSize: 26, background: .clear) {
          onMenu(.subtitles)
        }
        // The line under the icon shows subtitles are on; VoiceOver hears which.
        .overlay(alignment: .bottom) {
          if controller.subtitle != nil {
            Capsule().fill(palette.accent).frame(width: 20, height: 2).offset(y: -8).allowsHitTesting(false)
          }
        }
        .accessibilityValue(controller.subtitle.map { subtitleLabel($0, controller.subtitles) } ?? Str.playerSubtitlesOff)
        RoundIconButton(.settings, label: Str.playerMenuSettings, size: 52, iconSize: 26, background: .clear) {
          onMenu(.settings)
        }
      }
    }
    .padding(.horizontal, 20)
    .padding(.vertical, 10)
  }
}

/// "Ends at 21:40", from where it plays and at what speed, again every half minute.
private struct EndsAt: View {
  let controller: PlayerController
  @Environment(\.palette) private var palette

  var body: some View {
    let duration = controller.duration
    if duration > 0 {
      let step = Int(controller.position) / 30
      let left = (duration - controller.position) / Double(max(controller.speed, 0.1))
      Text(Str.playerEndsAt(Self.time(step: step, left: left)))
        .textStyle(.bodyMedium)
        .foregroundStyle(palette.foreground.opacity(0.8))
        .lineLimit(1)
    }
  }

  private static func time(step: Int, left: Double) -> String {
    Date(timeIntervalSinceNow: max(0, left)).formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(.app))
  }
}

/// Skips back or forward, with how far in the middle of its arrow.
private struct SkipButton: View {
  let icon: Lucide
  let seconds: Double
  let label: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      ZStack {
        LucideIcon(icon, size: 40, scales: false)
        // The label says how far already.
        Text("\(Int(seconds))")
          .font(RedHatText.font(fixedSize: 12, weight: .semibold))
          .padding(.top, 2)
          .accessibilityHidden(true)
      }
      .frame(width: 72, height: 72)
      .contentShape(Circle())
    }
    .buttonStyle(SkipPress())
    .accessibilityLabel(label)
  }
}

private struct SkipPress: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(Circle().fill(.white.opacity(configuration.isPressed ? 0.15 : 0)))
      .scaleEffect(configuration.isPressed ? 0.94 : 1)
      .animation(Motion.color, value: configuration.isPressed)
  }
}

/// The trickplay frame above the thumb while scrubbing, then the time, the
/// track, and what's left.
private struct SeekBar: View {
  let controller: PlayerController
  let back: Double
  let ahead: Double
  let onTouch: () -> Void
  @State private var width: CGFloat = 0

  var body: some View {
    let duration = max(0, controller.duration)
    let scrub = controller.scrubPosition
    let shown = scrub ?? controller.position
    VStack(spacing: 0) {
      if let scrub, controller.trickplay != nil, duration > 0 {
        let preview: CGFloat = 176
        let x = min(max(0, width * seekFraction(scrub, duration: duration) - preview / 2), max(0, width - preview))
        TrickplayPreview(controller: controller, seconds: scrub, width: preview)
          .offset(x: x)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      HStack(spacing: 0) {
        Text(formatClock(shown)).textStyle(.bodyMedium).monospacedDigit().frame(minWidth: 56, alignment: .leading)
        SeekTrack(controller: controller, position: shown, duration: duration, back: back, ahead: ahead, onTouch: onTouch)
          .padding(.horizontal, 12)
        let remaining = formatClock(max(0, duration - shown))
        Text("-\(remaining)").textStyle(.bodyMedium).monospacedDigit()
          .frame(minWidth: 64, alignment: .trailing)
          .accessibilityLabel(Str.a11yPlayerRemaining(remaining))
      }
    }
    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
  }
}

/// The seek bar as the web player draws it: a thin line, what's buffered in
/// a lighter shade, what's played in the accent, and a dot to drag. A tap
/// seeks there, a drag scrubs until it lifts. VoiceOver hears it as a
/// position it can swipe by the skip steps.
private struct SeekTrack: View {
  let controller: PlayerController
  let position: Double
  let duration: Double
  let back: Double
  let ahead: Double
  let onTouch: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    let enabled = seekable(duration)
    let scrubbing = controller.scrubPosition != nil
    GeometryReader { geo in
      let width = geo.size.width
      let played = width * seekFraction(position, duration: duration)
      let loaded = width * seekFraction(controller.buffered, duration: duration)
      let thumb: CGFloat = scrubbing ? 11 : 8
      ZStack(alignment: .leading) {
        Capsule().fill(palette.foreground.opacity(0.2)).frame(height: 5)
        Capsule().fill(palette.foreground.opacity(0.35)).frame(width: max(5, loaded), height: 5)
        Capsule().fill(palette.accent).frame(width: max(5, played), height: 5)
        Circle().fill(palette.accent).frame(width: thumb * 2, height: thumb * 2)
          .offset(x: played - thumb)
          .motion(Motion.color, value: scrubbing)
      }
      .frame(maxHeight: .infinity)
      .contentShape(Rectangle())
      .gesture(
        DragGesture(minimumDistance: 0)
          .onChanged { drag in
            guard enabled else { return }
            if controller.scrubPosition == nil { controller.beginScrub() }
            controller.scrub(to: seekAt(x: drag.location.x, width: width, duration: duration))
            onTouch()
          }
          .onEnded { _ in
            guard enabled else { return }
            Task { await controller.endScrub() }
            onTouch()
          }
      )
    }
    .frame(height: 48)
    .accessibilityElement()
    .accessibilityLabel(Str.a11yPlayerSeek)
    .accessibilityValue(enabled ? Str.a11yPlayerPosition(formatClock(position), formatClock(duration)) : formatClock(position))
    .accessibilityAdjustableAction { direction in
      guard enabled else { return }
      let to = seekStepped(
        from: position, direction: direction == .increment ? 1 : -1, step: direction == .increment ? ahead : back,
        duration: duration)
      Task { await controller.seekTo(to) }
      onTouch()
    }
  }
}

/// The frame at the scrubbed time, cut from the server's trickplay tiles, and the time under it.
private struct TrickplayPreview: View {
  let controller: PlayerController
  let seconds: Double
  let width: CGFloat
  @Environment(\.palette) private var palette
  @State private var tiles = TrickplayTiles.shared

  var body: some View {
    if let images = controller.trickplay {
      let height = width * CGFloat(images.height) / CGFloat(max(1, images.width))
      VStack(spacing: 4) {
        ZStack {
          Color.black
          if let frame = controller.trickplayFrame(at: seconds), let image = tiles.frame(frame, controller) {
            Image(uiImage: image).resizable().interpolation(.medium)
          }
        }
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(palette.foreground.opacity(0.3), lineWidth: 1))
        Text(formatClock(seconds)).textStyle(.labelMedium).monospacedDigit()
      }
      .frame(width: width)
      .padding(.bottom, 6)
      .accessibilityHidden(true)
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

/// The system's route picker, for AirPlay: what iOS offers every video app, at little cost.
private struct AirPlayButton: UIViewRepresentable {
  @Environment(\.palette) private var palette

  func makeUIView(context: Context) -> AVRoutePickerView {
    let picker = AVRoutePickerView()
    picker.prioritizesVideoDevices = true
    picker.backgroundColor = .clear
    return picker
  }

  func updateUIView(_ picker: AVRoutePickerView, context: Context) {
    picker.tintColor = UIColor(palette.foreground)
    picker.activeTintColor = UIColor(palette.accent)
  }

  func sizeThatFits(_ proposal: ProposedViewSize, uiView: AVRoutePickerView, context: Context) -> CGSize? {
    CGSize(width: 52, height: 52)
  }
}
