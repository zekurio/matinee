import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvMenuPanel.kt and PlayerScreen.kt's `menuEntries`: what the player's
 * menus offer on a TV. Android TV has three: Audio, Subtitles, and
 * Settings, which holds the quality, the speed, and how the picture fills
 * the screen, since a TV has no pinch; the phone keeps quality and speed
 * apart. Each opens the right-edge panel, focus on the choice in force.
 *
 * TODO(share): the entries are the iPhone player's (Matinee/UI/player/
 * PlayerMenus.swift), copied here because that file also holds the phone's
 * `PlayerMenuPanel`, and `languageName` and `qualityLabel` live in
 * Matinee/UI/settings/SettingsData.swift beside Settings' state. The split:
 * `MenuEntry`, `menuEntries`, `speedLabel`, `speedText`, `audioLabel`,
 * `subtitleLabel`, and `subtitleDetail` into `PlayerMenuEntries.swift`,
 * `languageName`, `qualityLabel`, and `ungrouped` into Format.swift, both
 * listed for the TV in project.yml, leaving `PlayerMenuPanel` where it is.
 * Everything here is private or TV-named until then, so it can't clash with
 * those names should another TV area share them first.
 */

/// The player's menus on a TV, as Android TV's: audio, subtitles, and the rest under settings.
enum TVPlayerMenu: String, Hashable, CaseIterable, Identifiable {
  case audio, subtitles, settings

  var id: String { rawValue }

  /// What heads the menu's panel, and names its button.
  var title: String {
    switch self {
    case .audio: Str.playerMenuAudio
    case .subtitles: Str.playerMenuSubtitles
    case .settings: Str.playerMenuSettings
    }
  }

  var icon: Lucide {
    switch self {
    case .audio: .audioLines
    case .subtitles: .captions
    case .settings: .settings
    }
  }
}

/// One line of a menu's panel: a group's heading, a note, a rule, or a choice.
enum TVMenuEntry: Identifiable {
  case heading(String, key: String)
  case note(String, key: String)
  case divider(key: String)
  /// A choice, current when `selected`; `pick` makes it so.
  case choice(
    title: String, detail: String?, selected: Bool, enabled: Bool = true, key: String, pick: @MainActor () -> Void)

  var id: String {
    switch self {
    case .heading(_, let key), .note(_, let key), .divider(let key): key
    case .choice(_, _, _, _, let key, _): key
    }
  }

  /// The choice in force, which focus starts on.
  var picked: Bool {
    if case .choice(_, _, let selected, let enabled, _, _) = self { return selected && enabled }
    return false
  }
}

/// The speeds the menu offers, from half to double, as Android's.
private let SPEEDS: [Float] = [0.5, 0.75, 1, 1.25, 1.5, 2]

/// What `menu` offers: the tracks and qualities the server answered, the
/// speeds, and the picture's fit, each marked when it's in force. The
/// panel's title names the menu; Settings heads each of its groups.
@MainActor func tvMenuEntries(_ menu: TVPlayerMenu, _ controller: PlayerController, prefs: PlayerPrefs) -> [TVMenuEntry] {
  var entries: [TVMenuEntry] = []
  switch menu {
  case .audio:
    if controller.audioTracks.isEmpty { entries.append(.note(Str.playerAudioNoTracks, key: "none")) }
    for track in controller.audioTracks {
      let detail = [track.format, track.layout].compactMap { $0 }.joined(separator: " · ")
      entries.append(
        .choice(
          title: audioLabel(track), detail: detail.isEmpty ? nil : detail, selected: track == controller.audio,
          key: "audio-\(track.index)"
        ) { Task { await controller.pickAudio(track) } })
    }
  case .subtitles:
    entries.append(
      .choice(title: Str.playerSubtitlesOff, detail: nil, selected: controller.subtitle == nil, key: "off") {
        Task { await controller.pickSubtitle(nil) }
      })
    for track in controller.subtitles {
      let detail = subtitleDetail(track, burns: controller.burnsIn(track))
      entries.append(
        .choice(
          title: subtitleLabel(track, controller.subtitles), detail: detail.isEmpty ? nil : detail,
          selected: track.id == controller.subtitle?.id, enabled: track.delivery != nil, key: "subtitle-\(track.id)"
        ) { Task { await controller.pickSubtitle(track) } })
    }
    if controller.subtitleError { entries.append(.note(Str.playerErrorSubtitles, key: "error")) }
  case .settings:
    // A download has only itself, so no quality; a TV plays none, but the controller can.
    if !controller.isLocal {
      entries.append(.heading(Str.playerQuality, key: "quality"))
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
    }
    entries.append(.heading(Str.playerSpeed, key: "speed"))
    for rate in SPEEDS {
      entries.append(
        .choice(title: speedLabel(rate), detail: nil, selected: controller.speed == rate, key: "speed-\(rate)") {
          controller.pickSpeed(rate)
        })
    }
    entries.append(.heading(Str.playerPicture, key: "picture"))
    entries.append(
      .choice(title: Str.playerFit, detail: nil, selected: !prefs.fillScreen, key: "picture-fit") {
        prefs.fillScreen = false
      })
    entries.append(
      .choice(title: Str.playerFill, detail: nil, selected: prefs.fillScreen, key: "picture-fill") {
        prefs.fillScreen = true
      })
  }
  return entries
}

/// "Normal", or "1.25×" in the app's words, "1,25×" in German.
private func speedLabel(_ rate: Float) -> String {
  rate == 1
    ? Str.playerSpeedNormal
    : Str.playerSpeedRate(Double(rate).formatted(.number.precision(.fractionLength(0...2)).locale(.app)))
}

/// "German" for `de`, in the app's language.
private func languageName(_ tag: String) -> String {
  let locale = Locale.app
  guard let name = locale.localizedString(forIdentifier: tag), !name.isEmpty else { return tag }
  return name.prefix(1).uppercased(with: locale) + name.dropFirst()
}

/// "1080p, 20 Mbps" for an encode, the height as plain digits rather than "1,080p".
private func qualityLabel(_ quality: PlaybackQualityPreset) -> String {
  let formatted = Str.playbackQualityPreset(quality.height, Str.playerBitrateMbps(quality.bitrate / 1_000_000))
  return formatted.replacingOccurrences(
    of: quality.height.formatted(.number.locale(.app)), with: String(quality.height))
}

/// A track's language, plus its own title when that adds something.
private func trackLabel(language: String?, title: String?, unnamed: String) -> String {
  let name = language.map(languageName)
  guard let title, !title.trimmingCharacters(in: .whitespaces).isEmpty else { return name ?? unnamed }
  guard let name, title.range(of: name, options: .caseInsensitive) == nil else { return title }
  return Str.playerTrackWithTitle(name, title)
}

private func audioLabel(_ track: AudioTrack) -> String {
  trackLabel(language: track.language, title: track.title, unnamed: Str.playerTrackUnnamed(track.index))
}

private func subtitleLabel(_ track: SubtitleTrack, _ tracks: [SubtitleTrack]) -> String {
  guard track.source == SubtitleSource.embedded else {
    return trackLabel(language: track.language, title: track.title, unnamed: Str.playerTrackUnknownLanguage)
  }
  let position = (tracks.filter { $0.source == SubtitleSource.embedded }.firstIndex { $0.id == track.id } ?? -1) + 1
  return trackLabel(language: track.language, title: track.title, unnamed: Str.playerTrackUnnamed(position))
}

/// A track's flags and format, and whether it's burned into the picture.
private func subtitleDetail(_ track: SubtitleTrack, burns: Bool) -> String {
  [
    track.forced ? Str.playerSubtitlesForced : nil,
    track.sdh ? "SDH" : nil,
    track.format,
    track.delivery != nil && burns ? Str.playerSubtitlesBurnedIn : nil,
  ].compactMap { $0 }.joined(separator: " · ")
}

/// A menu's choices in its side panel, focus starting on the one in force:
/// each a quiet row that picks and closes the panel; Menu closes it too,
/// and focus goes back to the menu's button.
struct TVMenuRows: View {
  let menu: TVPlayerMenu
  let controller: PlayerController
  let prefs: PlayerPrefs
  @FocusState private var focused: String?
  @Environment(\.overlayDismiss) private var dismiss
  @Environment(\.palette) private var palette

  var body: some View {
    let entries = tvMenuEntries(menu, controller, prefs: prefs)
    ForEach(entries) { entry in
      switch entry {
      case .heading(let text, let key):
        TVListHeading(text).padding(.top, key == entries.first?.id ? 0 : TVSpace.s3)
      case .note(let text, _):
        Text(text).textStyle(.body).foregroundStyle(palette.mutedForeground)
          .padding(.horizontal, TVListItems.inset)
          .padding(.vertical, TVSpace.s2)
          .frame(maxWidth: .infinity, alignment: .leading)
      case .divider:
        Separator().padding(.vertical, TVSpace.s2)
      case .choice(let title, let detail, let selected, let enabled, let key, let pick):
        TVListItem(title, subtitle: detail, quiet: true, checked: selected) {
          dismiss { if !selected { pick() } }
        }
        .disabled(!enabled)
        .focused($focused, equals: key)
        .accessibilityAddTraits(selected ? .isSelected : [])
      }
    }
    .defaultFocus($focused, entries.first(where: \.picked)?.id)
  }
}
