import Foundation
import MatineeCore
import TVServices
import UIKit

/// The extension never receives the session or authenticated artwork URLs.
@Observable final class TVTopShelf {
  var pending: URL?
  private var generation = 0

  private var store: TopShelfStore? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "MatineeAppGroup") as? String,
      let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { return nil }
    return TopShelfStore(container: container)
  }

  func clear() {
    generation += 1
    store?.clear()
    TVTopShelfContentProvider.topShelfContentDidChange()
  }

  func refresh(_ session: MatineeSession) async {
    guard let api = session.api else { return }
    let version = session.version
    do {
      let continuing = try await api.home.continueWatching(limit: 12)
      let next = try await api.home.nextUp(limit: 12).map(\.item)
      guard session.version == version else { return }
      await publish(continuing: continuing, next: next, session: session)
    } catch { /* Keep the last snapshot when the server is unreachable. */ }
  }

  func publish(continuing: [MediaItem], next: [MediaItem], session: MatineeSession) async {
    guard let store, let api = session.api, case .signedIn(let server, let user) = session.state else { return }
    generation += 1
    let current = generation
    var snapshot = topShelfSnapshot(continuing: continuing, next: next, server: server, user: user.id,
      continuingTitle: Str.browseContinueWatching, nextTitle: Str.browseNextUp) { item in
        let names = itemLabel(item)
        return [names.showName, names.code, names.title == names.showName ? nil : names.title].compactMap { $0 }.joined(separator: " · ")
      }
    var images: [String: Data] = [:]
    for s in snapshot.sections.indices {
      for e in snapshot.sections[s].entries.indices {
        let entry = snapshot.sections[s].entries[e]
        let source = entry.artworkId.map { api.paths.artwork($0, size: .small) } ?? api.paths.thumbnail(entry.id)
        guard let url = URL(string: source) else { continue }
        if entry.artworkId == nil { snapshot.sections[s].entries[e].poster = false }
        var request = URLRequest(url: url)
        request.allHTTPHeaderFields = session.playerHeaders()
        do {
          let (data, response) = try await URLSession.shared.data(for: request)
          guard let http = response as? HTTPURLResponse, http.statusCode == 200,
            data.count <= 4_000_000, let image = UIImage(data: data) else { continue }
          let shape: TVTopShelfSectionedItem.ImageShape = snapshot.sections[s].entries[e].poster ? .poster : .hdtv
          let points = TVTopShelfSectionedContent.imageSize(for: shape)
          let size = CGSize(width: points.width * 2, height: points.height * 2)
          let format = UIGraphicsImageRendererFormat(); format.scale = 1
          let scale = max(size.width / image.size.width, size.height / image.size.height)
          let rect = CGRect(x: (size.width - image.size.width * scale) / 2,
            y: (size.height - image.size.height * scale) / 2,
            width: image.size.width * scale, height: image.size.height * scale)
          let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: rect) }
          guard let jpeg = resized.jpegData(compressionQuality: 0.8) else { continue }
          let name = "\(UUID().uuidString).jpg"
          images[name] = jpeg
          snapshot.sections[s].entries[e].image = name
        } catch { }
        guard !Task.isCancelled, current == generation else { return }
      }
    }
    guard !Task.isCancelled, current == generation, case .signedIn(let active, let account) = session.state,
      active == server, account.id == user.id else { return }
    do {
      try store.write(snapshot, images: images)
      TVTopShelfContentProvider.topShelfContentDidChange()
    } catch { }
  }
}
