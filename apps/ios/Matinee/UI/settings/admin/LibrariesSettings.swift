import MatineeCore
import SwiftUI

/*
 * LibrariesSettings.kt. A stub from the shell's task until the admin task fills it in;
 * keep the types and their parameters, which Nav.swift opens them with.
 */

/// The server's libraries, for admins.
struct LibrariesSettings: View {

  var body: some View { Stub("LibrariesSettings") }
}

/// An admin adding a library, or with `id`, changing one. The folder picker
/// hands its folder back through `results`, under `PICKED_FOLDER`, as Android's
/// `savedStateHandle`: `nav.backWith(PICKED_FOLDER, folder)`.
struct LibraryEditorScreen: View {
  let id: String?
  let results: NavResults

  var body: some View { Stub("LibraryEditorScreen", stubValue("id", id), stubValue("picked", results.peek(PICKED_FOLDER))) }
}

/// The key the folder picker leaves its folder under.
let PICKED_FOLDER = "picked_folder"

/// The server's folders, for the library being edited: opening at `start`, with the folders in `added` marked.
struct FolderPickerScreen: View {
  let start: String?
  let added: [String]

  var body: some View { Stub("FolderPickerScreen", stubValue("start", start), "added: \(added)") }
}
