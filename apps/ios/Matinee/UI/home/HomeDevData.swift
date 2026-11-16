import Foundation
import MatineeCore

/*
 * Home as a server with metadata would fill it, on the dev server, which
 * has no metadata provider and so no artwork and no recommendations, for
 * checking Home's layout. Debug builds only; release builds leave
 * everything as the server sent it.
 *
 * - `-dev.art YES`: fixed public pictures stand in for the featured
 *   titles' backdrops, and every one gets an overview, genres, and
 *   ratings. With no featured titles, Continue watching and Next up stand
 *   in. The carousel and the iPad's banner take real pictures from a
 *   folder with `-dev.featuredArt` (HomeCarouselDevData.swift).
 * - `-dev.recommendations YES`: with no recommendation rows from the
 *   server, two made of Home's other titles, so the rows and "Not
 *   interested" can be tried.
 */
enum HomeDevData {
  #if DEBUG
    private static var on: Bool { UserDefaults.standard.bool(forKey: "dev.art") }
    private static var recommending: Bool { UserDefaults.standard.bool(forKey: "dev.recommendations") }

    /// Titles Home loaded, for the stand-in recommendations; observed, so
    /// the rows show once Home has them.
    @Observable final class StandIns {
      var titles: [TitleSummary] = []
    }

    static let standIns = StandIns()

    /// The server's rows, or with none and `-dev.recommendations YES`, two of `standIns`.
    static func recommendations(_ loaded: HomeRecommendations?) -> HomeRecommendations? {
      let standIns = standIns.titles
      guard recommending, loaded?.rails.isEmpty ?? true, standIns.count > 1 else { return loaded }
      var seen = Set<String>()
      let titles = standIns.filter { seen.insert($0.id).inserted }
      func pick(_ title: TitleSummary) -> RecommendedTitle {
        RecommendedTitle(
          ref: CatalogRef(kind: title.kind, provider: "dev", providerId: title.id), title: title,
          reason: RecommendationReason(kind: "taste", name: nil))
      }
      let seed = titles[0]
      return HomeRecommendations(
        rails: [
          HomeRecommendationRail(id: RecommendationRailId.forYou, seed: nil, items: titles.dropFirst().map(pick)),
          HomeRecommendationRail(
            id: RecommendationRailId.becauseWatched,
            seed: RecommendationSeed(ref: CatalogRef(kind: seed.kind, provider: "dev", providerId: seed.id), name: seed.name),
            items: titles.reversed().dropLast().map(pick)),
        ], computedAt: nil)
    }

    private static let backdrops = [
      "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1280",
      "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=1280",
      "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1280",
    ]
  #endif

  static func backdrop(_ slide: FeaturedTitle) -> [ImageSource]? {
    #if DEBUG
      guard on else { return nil }
      let index = slide.title.id.unicodeScalars.reduce(0) { $0 + Int($1.value) } % backdrops.count
      return ImageSource(backdrops[index]).map { [$0] }
    #else
      return nil
    #endif
  }

  /// The slides with what a provider would add; with none, as the dev
  /// server picks none without art, slides made of `standIns`' titles.
  static func fill(_ slides: [FeaturedTitle], standIns: [MediaItem]) -> [FeaturedTitle] {
    #if DEBUG
      guard on else { return slides }
      var seen = Set<String>()
      let made = standIns.compactMap { item -> FeaturedTitle? in
        guard let title = item.title, seen.insert(title.id).inserted else { return nil }
        return FeaturedTitle(title: title, item: item, count: title.isShow ? 6 : 1)
      }
      return (slides.isEmpty ? made : slides).map { slide in
        var slide = slide
        slide.title.overview =
          slide.title.overview
          ?? "A stand-in overview, long enough to run to the three lines a wide banner gives it, so the fade and the clipping can be checked against what the server would send for a title with full metadata."
        if slide.title.genres.isEmpty { slide.title.genres = ["Science Fiction", "Action", "Drama", "Thriller"] }
        slide.title.rating = slide.title.rating ?? 8.2
        slide.title.contentRating = slide.title.contentRating ?? "PG-13"
        return slide
      }
    #else
      return slides
    #endif
  }
}
