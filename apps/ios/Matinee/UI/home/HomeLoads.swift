import MatineeCore
import SwiftUI

/// Home's loads, in both apps: the libraries, Continue watching, Next up,
/// featured, and the recommendation rows. Each library's shelf loads in its
/// own place.
final class HomeLoaders {
  let libraries = Loader<[Library]>()
  let resume = Loader<[MediaItem]>()
  let nextUp = Loader<[MediaItem]>()
  let featured = Loader<[FeaturedTitle]>()
  let recommendations = Loader<HomeRecommendations>()

  var all: [any Reloadable] { [libraries, resume, nextUp, featured, recommendations] }

  /// Everything on Home again, as Try again on Home's one message asks.
  func reloadAll() { all.forEach { $0.reload() } }
}

/// A loader that never fetches again on its return: featured is picked at
/// random, so fetching it again would swap it under the person.
private let NEVER_STALE: Duration = .seconds(1_000_000_000)

extension View {
  /// Loads Home's sections. Back on Home, what's in progress may have moved
  /// on, here or on another device, so the libraries, Continue watching, and
  /// Next up refresh on return; the recommendations once they're ten minutes
  /// old, as the server works them out only now and then; featured stays,
  /// but for one that failed, which tries again.
  func loadsHomeSections(_ loaders: HomeLoaders) -> some View {
    self
      .loads(loaders.libraries) { api in try await api.libraries.list() }
      .loads(loaders.resume) { api in try await api.home.continueWatching(limit: 20) }
      .loads(loaders.nextUp) { api in try await api.home.nextUp(limit: 20).map(\.item) }
      .loads(loaders.featured, maxAge: NEVER_STALE) { api in try await api.home.featured() }
      .loads(loaders.recommendations, maxAge: RECOMMENDATIONS_MAX_AGE) { api in try await api.recommendations.home() }
      .onAppear { if loaders.featured.state.isFailed { loaders.featured.reload() } }
  }
}
