import MatineeCore
import MatineeKit
import SwiftUI

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
