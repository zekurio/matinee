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

/// The choice in force, which focus starts on.
private extension MenuEntry {
  var picked: Bool {
    if case .choice(_, _, let selected, let enabled, _, _) = self { return selected && enabled }
    return false
  }
}

/// TV settings groups the shared quality and speed choices with its picture choices.
@MainActor func tvMenuEntries(_ menu: TVPlayerMenu, _ controller: PlayerController, prefs: PlayerPrefs) -> [MenuEntry] {
  switch menu {
  case .audio: return menuEntries(.audio, controller, emptyDetailsAreNil: true)
  case .subtitles: return menuEntries(.subtitles, controller, emptyDetailsAreNil: true)
  case .settings:
    var entries: [MenuEntry] = []
    if !controller.isLocal {
      entries.append(.label(Str.playerQuality, key: "quality"))
      entries += menuEntries(.quality, controller)
    }
    entries.append(.label(Str.playerSpeed, key: "speed"))
    entries += menuEntries(.speed, controller)
    entries.append(.label(Str.playerPicture, key: "picture"))
    entries.append(
      .choice(title: Str.playerFit, detail: nil, selected: !prefs.fillScreen, key: "picture-fit") {
        prefs.fillScreen = false
      })
    entries.append(
      .choice(title: Str.playerFill, detail: nil, selected: prefs.fillScreen, key: "picture-fill") {
        prefs.fillScreen = true
      })
    return entries
  }
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
      case .label(let text, let key):
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
