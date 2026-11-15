#if os(tvOS)
  import MatineeKit
  import SwiftUI

  /// The remote helpers in a mock player: Play/Pause, Menu stepping out one
  /// layer at a time, Left and Right stepping and gliding the scrubber, and
  /// swipes scrubbing it.
  struct TVRemotePage: View {
    @Environment(TVGallerySettings.self) private var settings
    @Environment(\.palette) private var palette
    @Environment(\.dismiss) private var dismiss
    @State private var playing = true
    @State private var position = 1262.0
    @State private var controls = true
    @State private var subtitles = false
    @State private var track = "en"
    @State private var scrub = TVScrub(step: 10)
    @State private var events: [String] = []
    @FocusState private var focus: Target?

    enum Target: Hashable { case surface, scrubber, play, subtitles }

    private let duration = 2_880.0
    private let title = Samples.title("neon")

    var body: some View {
      ZStack(alignment: .bottomLeading) {
        WideArt(title: title, variant: 3).ignoresSafeArea()
        // With the controls away, the picture itself holds focus: Select brings them back, Left and Right skip.
        TVFocusSurface { show() }
          .focused($focus, equals: .surface)
          .disabled(controls)
          .onMoveCommand { direction in
            guard !controls else { return }
            switch direction {
            case .left: skip(-10)
            case .right: skip(10)
            default: show()
            }
          }
        if controls { controlsLayer.transition(.opacity) }
        eventLog
      }
      .ignoresSafeArea()
      .forceDarkTheme(settings.accent.theme)
      .animation(Motion.enter, value: controls)
      .onTVPlayPause {
        playing.toggle()
        note(playing ? settings.t("Play/Pause: playing", "Play/Pause: läuft") : settings.t("Play/Pause: paused", "Play/Pause: angehalten"))
      }
      .tvBackLayers([
        TVBackLayer(isActive: subtitles) {
          subtitles = false
          note(settings.t("Menu: closed the panel", "Menü: Leiste geschlossen"))
        },
        TVBackLayer(isActive: controls) {
          controls = false
          focus = .surface
          note(settings.t("Menu: hid the controls", "Menü: Steuerung ausgeblendet"))
        },
      ])
      .tvOptionsPanel(
        isPresented: $subtitles, title: settings.t("Subtitles", "Untertitel"), selection: $track,
        options: [
          TVOption("off", settings.t("Off", "Aus")), TVOption("en", "English"), TVOption("en-sdh", "English (SDH)"),
          TVOption("de", "Deutsch"), TVOption("ja", "日本語"),
        ])
      .task(id: playing) {
        while playing, !Task.isCancelled {
          try? await Task.sleep(for: .seconds(1))
          if playing, scrub.target == nil { position = min(position + 1, duration) }
        }
      }
      .onAppear { focus = .scrubber }
    }

    private var controlsLayer: some View {
      VStack(alignment: .leading, spacing: 32) {
        Spacer()
        VStack(alignment: .leading, spacing: 4) {
          Text(title.name).textStyle(.headline)
          Text("S1 · E4  Pressure").textStyle(.title).foregroundStyle(palette.foreground.opacity(0.8))
        }
        Scrubber(
          position: scrub.target ?? position, duration: duration, scrubbing: scrub.target != nil, focused: focus == .scrubber
        )
        .focusable()
        .focused($focus, equals: .scrubber)
        .tvScrubbing(scrub, position: position, duration: duration, isEnabled: focus == .scrubber) { to in
          note(settings.t("Seek to \(time(to))", "Springe zu \(time(to))"))
          position = to
        }
        HStack(spacing: TVButtons.gap) {
          TVRoundButton(playing ? .pause : .play, label: playing ? "Pause" : "Play") { playing.toggle() }
            .focused($focus, equals: .play)
          TVButton(settings.t("Subtitles", "Untertitel"), icon: .captions) { subtitles = true }
            .focused($focus, equals: .subtitles)
          TVButton(settings.t("Back to the gallery", "Zurück zur Galerie"), icon: .arrowLeft) { dismiss() }
        }
      }
      .padding(TVOverscan.insets)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
      .background {
        LinearGradient(colors: [.clear, .black.opacity(0.85)], startPoint: .center, endPoint: .bottom).ignoresSafeArea()
      }
      .focusSection()
    }

    private var eventLog: some View {
      VStack(alignment: .trailing, spacing: 8) {
        Text(settings.t("Remote", "Fernbedienung")).textStyle(.label).foregroundStyle(.white.opacity(0.6))
        ForEach(Array(events.suffix(5).enumerated()), id: \.offset) { _, event in
          Text(event).textStyle(.caption).foregroundStyle(.white)
        }
      }
      .padding(32)
      .background(.black.opacity(0.5), in: RoundedRectangle.kit(TVRadius.lg))
      .padding(TVOverscan.insets)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
      .allowsHitTesting(false)
    }

    private func show() {
      controls = true
      focus = .scrubber
      note(settings.t("Select: showed the controls", "Select: Steuerung eingeblendet"))
    }

    private func skip(_ seconds: Double) {
      position = min(max(position + seconds, 0), duration)
      note(seconds < 0 ? settings.t("Left: back 10 s", "Links: 10 s zurück") : settings.t("Right: forward 10 s", "Rechts: 10 s vor"))
    }

    private func note(_ event: String) { events.append(event) }

    private func time(_ seconds: Double) -> String {
      Duration.seconds(seconds).formatted(.time(pattern: .minuteSecond))
    }
  }

  /// A player's progress: the accent along a track, the head where the
  /// remote has taken it, the time either side. Thicker while focused.
  private struct Scrubber: View {
    let position: Double
    let duration: Double
    let scrubbing: Bool
    let focused: Bool
    @Environment(\.palette) private var palette

    var body: some View {
      VStack(spacing: 16) {
        GeometryReader { proxy in
          let x = proxy.size.width * position / duration
          ZStack(alignment: .leading) {
            Capsule().fill(.white.opacity(0.3))
            Capsule().fill(palette.accent).frame(width: max(x, 0))
            Circle().fill(.white)
              .frame(width: focused ? 36 : 0, height: focused ? 36 : 0)
              .shadow(color: .black.opacity(0.4), radius: 6)
              .offset(x: x - (focused ? 18 : 0))
          }
          .frame(height: focused ? 16 : 8)
          .frame(maxHeight: .infinity)
        }
        .frame(height: 40)
        HStack {
          Text(time(position)).foregroundStyle(scrubbing ? palette.accent : .white)
          Spacer()
          Text("-" + time(duration - position)).foregroundStyle(.white.opacity(0.8))
        }
        .textStyle(.facts)
        .monospacedDigit()
      }
      .animation(Motion.color, value: focused)
    }

    private func time(_ seconds: Double) -> String {
      Duration.seconds(seconds).formatted(.time(pattern: .minuteSecond))
    }
  }
#endif
