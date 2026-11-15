import MatineeCore
import MatineeKit
import SwiftUI

/*
 * The download sheets as the downloads screens still draw them, in the
 * system's sheet, until downloads/ moves onto the kit. Then the actions
 * host (components/Actions.swift) presents them with `.matineeSheet` like
 * its others, and this goes with the rest of legacy/.
 */

extension View {
  /// Presents the download sheet for `download`, or for a show's or season's
  /// `files`, while either is set.
  func legacyDownloadSheets(download: Binding<MediaItem?>, files: Binding<FileSet?>) -> some View {
    modifier(LegacyDownloadSheets(download: download, files: files))
  }
}

private struct LegacyDownloadSheets: ViewModifier {
  @Binding var download: MediaItem?
  @Binding var files: FileSet?

  func body(content: Content) -> some View {
    content
      .sheet(item: Binding(get: { download.map(Shown.init) }, set: { download = $0?.item })) { shown in
        DownloadSheet(item: shown.item)
      }
      .sheet(item: Binding(get: { files.map(ShownFiles.init) }, set: { files = $0?.files })) { shown in
        DownloadFilesSheet(files: shown.files)
      }
  }

  private struct Shown: Identifiable {
    let item: MediaItem
    var id: String { item.id }
  }

  private struct ShownFiles: Identifiable {
    let files: FileSet
    var id: String { "\(files.title.id)/\(files.season.map { String(describing: $0.number) } ?? "all")" }
  }
}
