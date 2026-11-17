import Foundation
import MatineeCore
import TVServices

final class ContentProvider: TVTopShelfContentProvider {
  override func loadTopShelfContent(completionHandler: @escaping ((any TVTopShelfContent)?) -> Void) {
    completionHandler(content())
  }

  private func content() -> (any TVTopShelfContent)? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "MatineeAppGroup") as? String,
      let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { return nil }
    let store = TopShelfStore(container: container)
    guard let snapshot = store.read() else { return nil }
    let sections = snapshot.sections.compactMap { section -> TVTopShelfItemCollection<TVTopShelfSectionedItem>? in
      let items = section.entries.compactMap { entry -> TVTopShelfSectionedItem? in
        guard let name = entry.image, let image = store.imageURL(name), FileManager.default.fileExists(atPath: image.path) else { return nil }
        let item = TVTopShelfSectionedItem(identifier: entry.id)
        item.title = entry.title
        item.imageShape = entry.poster ? .poster : .hdtv
        item.playbackProgress = entry.progress
        item.setImageURL(image, for: .screenScale1x)
        item.setImageURL(image, for: .screenScale2x)
        item.playAction = TVTopShelfAction(url: entry.play)
        item.displayAction = TVTopShelfAction(url: entry.display)
        return item
      }
      guard !items.isEmpty else { return nil }
      let collection = TVTopShelfItemCollection(items: items)
      collection.title = section.title
      return collection
    }
    return sections.isEmpty ? nil : TVTopShelfSectionedContent(sections: sections)
  }
}
