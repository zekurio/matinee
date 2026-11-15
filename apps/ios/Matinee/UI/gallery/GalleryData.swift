#if DEBUG
  import Foundation
  import MatineeCore
  import Observation

  /// What the gallery shows: titles made up here, for every state a card
  /// has, and the dev server's library (apps/ios/DEV.md) when the launch
  /// arguments name it:
  ///
  ///     -gallery.server http://localhost:18420 -gallery.token "$(scripts/dev/token)"
  ///
  /// The dev server has no metadata keys, so its titles have no artwork; a
  /// few public pictures stand in for art, so a card shows one too.
  enum Sample {
    static let posters = [
      ImageSource("https://picsum.photos/id/1015/400/600.jpg", placeholder: hash("LEHV6nWB2yk8pyo0adR*.7kCMdnj")),
      ImageSource("https://picsum.photos/id/1043/400/600.jpg", placeholder: hash("LKO2?U%2Tw=w]~RBVZRi};RPxuwH")),
      ImageSource("https://picsum.photos/id/1067/400/600.jpg"),
    ].compactMap(\.self)
    static let still = ImageSource(
      "https://picsum.photos/id/1018/640/360.jpg", placeholder: hash("LGF5]+Yk^6#M@-5c,1J5@[or[Q6."))
    static let face = ImageSource("https://picsum.photos/id/64/300/300.jpg")
    /// A picture that never comes, so its blur hash stays: how a card looks while loading.
    static let loading = ImageSource(
      "http://localhost:9/never.jpg", placeholder: hash("LEHV6nWB2yk8pyo0adR*.7kCMdnj"))

    private static func hash(_ blurhash: String) -> ImagePlaceholder {
      ImagePlaceholder(blurhash: blurhash, aspectRatio: 2 / 3)
    }

    static func title(
      _ name: String, kind: String = TitleKind.movie, year: Int? = 1999, watched: Bool = false
    ) -> TitleSummary {
      TitleSummary(
        id: "sample-\(name)", libraryId: "sample", kind: kind, name: name, year: year, overview: nil,
        images: Images(poster: nil, backdrop: nil, logo: nil), genres: [], rating: nil, contentRating: nil, runtimeMinutes: nil,
        originalLanguage: nil, favorite: false, watched: watched)
    }

    static func item(
      _ show: TitleSummary, season: Int? = nil, episode: Int? = nil, name: String?, duration: Double = 2700,
      position: Double? = nil, completed: Bool = false, overview: String? = nil
    ) -> MediaItem {
      let code = season.flatMap { s in episode.map { String(format: "S%02dE%02d", s, $0) } }
      return MediaItem(
        id: "sample-\(show.name)-\(season ?? -1)-\(episode ?? -1)", libraryId: "sample",
        fileTitle: name ?? show.name,
        label: ItemLabel(
          show: show.name, showName: show.name, year: show.year.map(String.init), showKey: show.id, title: name,
          untitled: name == nil, episodeNumber: episode, code: code, shortCode: code, group: show.id,
          groupLabel: []),
        title: show, seasonNumber: season, episodeNumber: episode,
        episode: episode == nil
          ? nil
          : EpisodeInfo(name: name, overview: overview, airDate: nil, runtimeMinutes: Int(duration / 60), still: nil),
        relativePath: "", container: "mp4", mimeType: "video/mp4", sizeBytes: 1_400_000_000, modifiedAt: "",
        durationSeconds: duration, probe: nil,
        progress: position.map { WatchState(positionSeconds: $0, completed: completed, updatedAt: "") }
          ?? (completed ? WatchState(positionSeconds: duration, completed: true, updatedAt: "") : nil),
        favorite: false)
    }

    static let show = title("Breaking Bad", kind: TitleKind.show, year: 2008)
    static let movies = [
      title("The Matrix"), title("Back to the Future", year: 1985, watched: true),
      title("Toy Story: A Very Long Name That Runs On and On", year: 1995), title("Interstellar", year: 2014),
    ]
    static let episodes = [
      item(show, season: 1, episode: 3, name: "…And the Bag's in the River", position: 1500),
      item(show, season: 2, episode: 1, name: nil, completed: true),
      item(
        show, season: 1, episode: 1, name: "Pilot", position: 600,
        overview: "A high school chemistry teacher learns he has cancer and turns to making drugs."),
      item(title("The Matrix"), name: "The Matrix", duration: 8160, position: 3000),
    ]

    /// The banner's slides, with what a provider would send: genres, a rating, an overview.
    static var featured: [FeaturedTitle] {
      var matrix = title("The Matrix")
      matrix.genres = ["Science Fiction", "Action"]
      matrix.rating = 8.2
      matrix.contentRating = "R"
      matrix.overview = "A hacker learns the world he lives in is a simulation, and joins the people fighting it."
      var show = Sample.show
      show.genres = ["Drama", "Crime"]
      return [
        FeaturedTitle(title: matrix, item: item(matrix, name: "The Matrix", duration: 8160, position: 3000), count: 1),
        FeaturedTitle(title: show, item: episodes[0], count: 6),
      ]
    }

    static func shelf(_ title: TitleSummary, added: Int?) -> ShelfEntry {
      let episode = item(title, season: 2, episode: 3, name: "Grilled", position: nil)
      return ShelfEntry(
        title: title, item: episode, count: 6, addedAt: "",
        added: added.map {
          ShelfAdditions(
            count: $0, item: episode,
            season: Season(number: 2, name: "Season 2", overview: nil, poster: nil, itemCount: 3, watchedCount: 0, favorite: false))
        })
    }
  }

  /// The dev server's library, when the launch arguments name one.
  @Observable final class GalleryServer {
    let api: MatineeApi?
    let resume = Loader<[MediaItem]>()
    let nextUp = Loader<[MediaItem]>()
    let shelves = Loader<[(Library, [ShelfEntry])]>()

    init() {
      let defaults = UserDefaults.standard
      if let server = defaults.string(forKey: "gallery.server").flatMap(URL.init(string:)) {
        let token = defaults.string(forKey: "gallery.token")
        api = MatineeApi(base: server, tokenProvider: { token })
      } else {
        api = nil
      }
    }

    /// Headers for the server's images, which need the session as its API does.
    static var imageHeaders: [String: String] {
      UserDefaults.standard.string(forKey: "gallery.token").map { ["Authorization": "Bearer \($0)"] } ?? [:]
    }
  }

#endif
