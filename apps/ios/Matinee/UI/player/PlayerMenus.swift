import MatineeCore
import MatineeKit
import SwiftUI

/*
 * PlayerScreen.kt's `menuEntries` and `PlayerPanel`: what the audio,
 * subtitle, quality, and speed menus offer, and the panel a phone or iPad
 * shows them in. The entries are plain data, the tracks and qualities the
 * server answered and the speeds, so the TV's player can lay out the same
 * list for a remote; only `PlayerMenuPanel` is for a finger.
 */

/// The player's menus. A phone has quality and speed apart, a button each, as Android's phone does.
enum PlayerMenu: String, Hashable, CaseIterable, Identifiable {
  case audio, subtitles, quality, speed

  var id: String { rawValue }

  /// What heads the menu, and names its button.
  var title: String {
    switch self {
    case .audio: Str.playerMenuAudio
    case .subtitles: Str.playerMenuSubtitles
    case .quality: Str.playerQuality
    case .speed: Str.playerSpeed
    }
  }
}

/// One line of a player menu: a group's name, a note, a rule, or a choice.
enum MenuEntry: Identifiable {
  case label(String, key: String)
  case note(String, key: String)
  case divider(key: String)
  /// A choice, current when `selected`; `pick` makes it so.
  case choice(title: String, detail: String?, selected: Bool, enabled: Bool = true, key: String, pick: @MainActor () -> Void)

  var id: String {
    switch self {
    case .label(_, let key), .note(_, let key), .divider(let key): key
    case .choice(_, _, _, _, let key, _): key
    }
  }
}

/// The speeds the menu offers, from half to double, as Android's phone has them.
let PLAYER_SPEEDS: [Float] = [0.5, 0.75, 1, 1.25, 1.5, 2]

/// What `menu` offers: the tracks and qualities the server answered and the
/// speeds, each marked when it's the current one. The menu's title names
/// it, so nothing heads the list, as on the web.
@MainActor func menuEntries(_ menu: PlayerMenu, _ controller: PlayerController) -> [MenuEntry] {
  var entries: [MenuEntry] = []
  switch menu {
  case .audio:
    if controller.audioTracks.isEmpty { entries.append(.note(Str.playerAudioNoTracks, key: "none")) }
    for track in controller.audioTracks {
      entries.append(
        .choice(
          title: audioLabel(track), detail: [track.format, track.layout].compactMap { $0 }.joined(separator: " · "),
          selected: track == controller.audio, key: "audio-\(track.index)"
        ) { Task { await controller.pickAudio(track) } })
    }
  case .subtitles:
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
  case .quality:
    // A file over the account's bit rate limit plays only as an encode.
    if controller.offersOriginal {
      entries.append(
        .choice(
          title: Str.playerQualityOriginal, detail: controller.item?.probe?.video?.resolution,
          selected: controller.quality == ORIGINAL_QUALITY, key: "quality-original"
        ) { Task { await controller.pickQuality(ORIGINAL_QUALITY) } })
    }
    for quality in controller.qualities {
      entries.append(
        .choice(
          title: qualityLabel(quality), detail: nil, selected: controller.quality == quality.id,
          key: "quality-\(quality.id)"
        ) { Task { await controller.pickQuality(quality.id) } })
    }
  case .speed:
    for rate in PLAYER_SPEEDS {
      entries.append(
        .choice(
          title: speedLabel(rate), detail: nil, selected: controller.speed == rate, key: "speed-\(rate)"
        ) { controller.pickSpeed(rate) })
    }
  }
  return entries
}

/// "Normal", or "1.25×" in the app's words.
func speedLabel(_ rate: Float) -> String {
  rate == 1 ? Str.playerSpeedNormal : Str.playerSpeedRate(speedText(rate))
}

/// "1.25", "0.5", "2", as Kotlin's `rate.toString().removeSuffix(".0")`,
/// in the app's language: "1,25" in German, as the web formats it.
func speedText(_ rate: Float) -> String {
  Double(rate).formatted(.number.precision(.fractionLength(0...2)).locale(.app))
}

/// A track's language, plus its own title when that adds something.
private func trackLabel(language: String?, title: String?, unnamed: String) -> String {
  let name = language.map(languageName)
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

/// A track's flags and format, and whether it's burned into the picture:
/// by default for every track the screen can't draw, as the download sheet
/// has it; the player says for each track what it does.
func subtitleDetail(_ track: SubtitleTrack) -> String {
  subtitleDetail(track, burns: track.delivery != SubtitleDelivery.webvtt)
}

func subtitleDetail(_ track: SubtitleTrack, burns: Bool) -> String {
  [
    track.forced ? Str.playerSubtitlesForced : nil,
    track.sdh ? "SDH" : nil,
    track.format,
    track.delivery != nil && burns ? Str.playerSubtitlesBurnedIn : nil,
  ].compactMap { $0 }.joined(separator: " · ")
}

/// A menu's choices in the side panel: each a row that picks and closes it.
struct PlayerMenuPanel: View {
  let menu: PlayerMenu
  let controller: PlayerController

  var body: some View {
    ForEach(menuEntries(menu, controller)) { entry in
      switch entry {
      case .label(let text, _): PanelLabel(text)
      case .note(let text, _): PanelNote(text)
      case .divider: PanelSeparator()
      case .choice(let title, let detail, let selected, let enabled, _, let pick):
        PanelChoice(title, detail: detail, selected: selected, enabled: enabled, action: pick)
      }
    }
  }
}
