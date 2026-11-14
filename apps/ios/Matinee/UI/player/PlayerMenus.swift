import MatineeCore
import SwiftUI

/*
 * PlayerScreen.kt's `PlayerPanel` and `menuEntries`: the audio, subtitle,
 * and settings menus, in a panel that slides in from the side over the
 * video, as Android and the web draw them. A sheet from the bottom would
 * cover the picture in landscape; the panel keeps it in view, and a tap
 * beside it closes it.
 */

enum PlayerMenu: Hashable { case audio, subtitles, settings }

/// One line of a player menu: a heading, a note, a divider, or a choice.
enum MenuEntry: Identifiable {
  case heading(String, key: String)
  case note(String, key: String)
  case divider(key: String)
  /// A choice, current when `selected`; `pick` makes it so.
  case choice(title: String, detail: String?, selected: Bool, enabled: Bool = true, key: String, pick: () -> Void)

  var id: String {
    switch self {
    case .heading(_, let key), .note(_, let key), .divider(let key): key
    case .choice(_, _, _, _, let key, _): key
    }
  }
}

/// The speeds the menu offers.
let PLAYER_SPEEDS: [Float] = [0.5, 0.75, 1, 1.25, 1.5, 2]

/// What `menu` offers: the tracks and qualities the server answered and the
/// speeds, each marked when it's the current one.
@MainActor func menuEntries(_ menu: PlayerMenu, _ controller: PlayerController) -> [MenuEntry] {
  var entries: [MenuEntry] = []
  switch menu {
  case .audio:
    entries.append(.heading(Str.playerMenuAudio, key: "heading"))
    if controller.audioTracks.isEmpty { entries.append(.note(Str.playerAudioNoTracks, key: "none")) }
    for track in controller.audioTracks {
      entries.append(
        .choice(
          title: audioLabel(track), detail: [track.format, track.layout].compactMap { $0 }.joined(separator: " · "),
          selected: track == controller.audio, key: "audio-\(track.index)"
        ) { Task { await controller.pickAudio(track) } })
    }
  case .subtitles:
    entries.append(.heading(Str.playerMenuSubtitles, key: "heading"))
    entries.append(
      .choice(title: Str.playerSubtitlesOff, detail: nil, selected: controller.subtitle == nil, key: "off") {
        Task { await controller.pickSubtitle(nil) }
      })
    for track in controller.subtitles {
      entries.append(
        .choice(
          title: subtitleLabel(track, controller.subtitles),
          detail: subtitleDetail(track, burns: controller.burnsIn(track)),
          selected: track.id == controller.subtitle?.id, enabled: track.delivery != nil, key: "subtitle-\(track.id)"
        ) { Task { await controller.pickSubtitle(track) } })
    }
    if controller.subtitleError { entries.append(.note(Str.playerErrorSubtitles, key: "error")) }
  case .settings:
    if !controller.isLocal {
      entries.append(.heading(Str.playerQuality, key: "quality"))
      // A file over the account's bit rate limit plays only as an encode.
      if controller.offersOriginal {
        entries.append(
          .choice(
            title: Str.playerQualityOriginal, detail: nil, selected: controller.quality == ORIGINAL_QUALITY,
            key: "quality-original"
          ) { Task { await controller.pickQuality(ORIGINAL_QUALITY) } })
      }
      for quality in controller.qualities {
        entries.append(
          .choice(
            title: qualityLabel(quality), detail: nil, selected: controller.quality == quality.id,
            key: "quality-\(quality.id)"
          ) { Task { await controller.pickQuality(quality.id) } })
      }
      entries.append(.divider(key: "quality-end"))
    }
    entries.append(.heading(Str.playerSpeed, key: "speed"))
    for rate in PLAYER_SPEEDS {
      entries.append(
        .choice(
          title: rate == 1 ? Str.playerSpeedNormal : Str.playerSpeedRate(speedText(rate)), detail: nil,
          selected: controller.speed == rate, key: "speed-\(rate)"
        ) { controller.pickSpeed(rate) })
    }
  }
  return entries
}

/// "1.25", "0.5", "2", as Kotlin's `rate.toString().removeSuffix(".0")`.
private func speedText(_ rate: Float) -> String {
  let text = String(describing: rate)
  return text.hasSuffix(".0") ? String(text.dropLast(2)) : text
}

/// A language's name in the app's language, "German", "Deutsch".
private func trackLanguageName(_ tag: String) -> String {
  guard let name = Locale.app.localizedString(forIdentifier: tag), !name.isEmpty else { return tag }
  return name.prefix(1).capitalized(with: .app) + name.dropFirst()
}

/// A track's language, plus its own title when that adds something.
private func trackLabel(language: String?, title: String?, unnamed: String) -> String {
  let name = language.map(trackLanguageName)
  guard let title, !title.trimmingCharacters(in: .whitespaces).isEmpty else { return name ?? unnamed }
  guard let name, title.range(of: name, options: .caseInsensitive) == nil else { return title }
  return Str.playerTrackWithTitle(name, title)
}

func audioLabel(_ track: AudioTrack) -> String {
  trackLabel(language: track.language, title: track.title, unnamed: Str.playerTrackUnnamed(track.index))
}

func subtitleLabel(_ track: SubtitleTrack, _ tracks: [SubtitleTrack]) -> String {
  guard track.source == SubtitleSource.embedded else {
    return trackLabel(language: track.language, title: track.title, unnamed: Str.playerTrackUnknownLanguage)
  }
  let position = (tracks.filter { $0.source == SubtitleSource.embedded }.firstIndex { $0.id == track.id } ?? -1) + 1
  return trackLabel(language: track.language, title: track.title, unnamed: Str.playerTrackUnnamed(position))
}

/// A track's flags and format, and whether it is burned into the picture.
func subtitleDetail(_ track: SubtitleTrack, burns: Bool) -> String {
  [
    track.forced ? Str.playerSubtitlesForced : nil,
    track.sdh ? "SDH" : nil,
    track.format,
    track.delivery != nil && burns ? Str.playerSubtitlesBurnedIn : nil,
  ].compactMap { $0 }.joined(separator: " · ")
}

/// A menu's panel at the side, over a shade that closes it when tapped.
/// It's laid out over the whole screen, `safe` being the screen's insets,
/// so the panel runs to the screen's edge with its rows clear of the notch.
struct PlayerPanel: View {
  let open: PlayerMenu?
  let controller: PlayerController
  let safe: EdgeInsets
  let onDismiss: () -> Void
  @Environment(\.palette) private var palette
  /// The menu that was open stays drawn while the panel slides away.
  @State private var last: PlayerMenu?

  var body: some View {
    GeometryReader { geo in
      let full = geo.size.width
      let width = min(full, min(420, max(300, full * 0.42)))
      ZStack(alignment: .trailing) {
        if open != nil {
          Color(white: 0, opacity: 0.45)
            .contentShape(Rectangle())
            .onTapGesture(perform: onDismiss)
            .accessibilityElement()
            .accessibilityLabel(Str.a11yPlayerCloseMenu)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { onDismiss() }
            .transition(Motion.fade)
        }
        if open != nil, let menu = last ?? open {
          panel(menu, width: width)
            .transition(.move(edge: .trailing).combined(with: .opacity))
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
    }
    .ignoresSafeArea()
    .motion(Motion.move, value: open)
    .onChange(of: open, initial: true) { _, menu in if let menu { last = menu } }
  }

  private func panel(_ menu: PlayerMenu, width: CGFloat) -> some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 0) {
        ForEach(menuEntries(menu, controller)) { entry in
          switch entry {
          case .heading(let text, _):
            Text(text).textStyle(.titleMedium)
              .padding(.horizontal, 20).padding(.vertical, 12)
              .accessibilityAddTraits(.isHeader)
          case .note(let text, _):
            Text(text).textStyle(.bodySmall).foregroundStyle(palette.muted)
              .padding(.horizontal, 20).padding(.vertical, 10)
          case .divider:
            Rectangle().fill(palette.border).frame(height: 1).padding(.vertical, 8)
          case .choice(let title, let detail, let selected, let enabled, _, let pick):
            MenuRow(title: title, detail: detail, selected: selected, enabled: enabled) {
              pick()
              onDismiss()
            }
          }
        }
      }
      .padding(.vertical, 12)
      .padding(.top, safe.top)
      .padding(.bottom, safe.bottom)
      .padding(.trailing, safe.trailing)
    }
    .scrollBounceBehavior(.basedOnSize)
    .frame(width: width + safe.trailing)
    .frame(maxHeight: .infinity)
    .background(
      UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 16).fill(palette.raised)
    )
  }
}

/// One choice in a menu, heard as a button that's selected when `selected`.
private struct MenuRow: View {
  let title: String
  let detail: String?
  let selected: Bool
  let enabled: Bool
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Button(action: action) {
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 0) {
          Text(title).textStyle(.bodyLarge).foregroundStyle(enabled ? palette.foreground : palette.faint)
          if let detail, !detail.isEmpty {
            Text(detail).textStyle(.bodySmall).foregroundStyle(palette.muted)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if selected { LucideIcon(.check, size: 18, tint: palette.accent) }
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 14)
      .frame(minHeight: 48)
      .contentShape(Rectangle())
    }
    .buttonStyle(MenuRowStyle())
    .disabled(!enabled)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

private struct MenuRowStyle: ButtonStyle {
  @Environment(\.palette) private var palette
  func makeBody(configuration: Configuration) -> some View {
    configuration.label.background(configuration.isPressed ? palette.foreground.opacity(0.08) : .clear)
  }
}
