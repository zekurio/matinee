import MatineeCore
import SwiftUI

/*
 * The hook Actions.kt hangs on. A long press on a card offers what can be
 * done with what it shows; on iOS that's a context menu over the card, as
 * Photos and the TV app have it, where Android opens a bottom sheet. The
 * menu's items are a later task's (Actions.kt's ItemActions, TitleActions,
 * and SeasonActions, in an Actions.swift of its own): it sets `actionMenu`
 * on the root, and every card offers its menu from then on. The rows
 * Actions.kt's sheets are made of are in Sheets.swift.
 */

/// What a menu is for: a file, a whole title, or one season of a show. A
/// menu opened on the page of what it's for is `here`: that page already
/// shows Play, the tick, and the heart, and opening the page again would
/// only stack another copy of it, so the menu leaves those out.
enum ActionTarget: Hashable {
  case item(MediaItem, here: Bool)
  /// `file` is what Play starts, when known: a movie's file, which the menu downloads.
  case title(TitleSummary, file: MediaItem?, here: Bool)
  case season(TitleSummary, Season, here: Bool)
}

/// The context menu's items for a target, as `Button`s and `Divider`s. Nil
/// offers no menu, as until the actions are ported.
struct ActionMenu {
  var items: ((ActionTarget) -> AnyView)?
}

extension EnvironmentValues {
  @Entry var actionMenu = ActionMenu()
}

private struct CardMenu: ViewModifier {
  let target: ActionTarget
  @Environment(\.actionMenu) private var menu
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette

  func body(content: Content) -> some View {
    if let items = menu.items, !offline {
      content
        .contentShape(.contextMenuPreview, CardShape)
        // Icons in the text's color, as Android's sheet draws its rows, not the accent.
        .contextMenu { items(target).tint(palette.foreground) }
    } else {
      content
    }
  }
}

extension View {
  /// The long press's menu for `target`, from the environment's `actionMenu`.
  /// The cards have it already; a page's own "more" button can use it too.
  func cardMenu(_ target: ActionTarget) -> some View { modifier(CardMenu(target: target)) }
}

/// Messages that pop up at the bottom, like a failed mark: Android's
/// snackbar. Until the shell draws one, they go to the log.
struct Snackbar {
  var show: (String) -> Void = { print("snackbar:", $0) }
}

extension EnvironmentValues {
  @Entry var snackbar = Snackbar()
}

/// Run `block`, showing its error at the bottom of the screen as `failure`,
/// with the server's own words when it sent some. It runs on in a task of
/// its own, so a sheet or menu that started it can go.
func launchShowing(_ snackbar: Snackbar, _ failure: String, _ block: @escaping () async throws -> Void) {
  Task {
    do {
      try await block()
    } catch {
      switch Failure(error) {
      case .cancelled: break
      // Parsing details can contain server data; the action's own message is enough here.
      case .unreadable, .other: snackbar.show(failure)
      default: snackbar.show("\(failure): \(describeFailure(error))")
      }
    }
  }
}
