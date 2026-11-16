#if DEBUG
  import Foundation
  import MatineeCore

  /*
   * Debug builds' `-dev.requestFixtures`: a stand-in for the server's
   * request endpoints, since the dev server has no metadata provider key and
   * so answers Discover with `enabled=false` and every catalog search with
   * nothing. It runs inside the app as a `URLProtocol` on the request
   * screens' own API (`requestApi`), so the whole path, the generated
   * client, decoding, the live streams, asking, Undo, and an admin's
   * answers, runs as it would against a server. Every other call goes to
   * the dev server as usual. Release builds don't compile this.
   *
   * - `YES`: every state a title or season can be in, a queue of waiting
   *   requests, Discover's rows, and Browse with the server's filters.
   * - `limit`: the same, with this account's requests used up.
   * - `left`: two requests left.
   * - `off`: asking turned off on the server.
   *
   * Asking, cancelling, following, Add, and Decline change the stand-in's
   * state and stream it. An added request comes in over some seconds and
   * then arrives as a title of the dev server's library, so the arrival
   * shows too. Nothing reaches the dev server's requests.
   */

  nonisolated enum RequestFixtures {
    enum Mode: String { case full, limit, left, off }

    static var mode: Mode? {
      switch UserDefaults.standard.string(forKey: "dev.requestFixtures")?.lowercased() {
      case "yes", "true", "1", "full": .full
      case "limit": .limit
      case "left": .left
      case "off": .off
      default: nil
      }
    }

    nonisolated(unsafe) private static var cached: (URL, MatineeApi)?
    private static let lock = NSLock()

    /// The stand-in's API for `real`'s server, or nil when fixtures are off.
    static func api(_ real: MatineeApi) -> MatineeApi? {
      guard let mode else { return nil }
      return lock.withLock {
        if let cached, cached.0 == real.base { return cached.1 }
        RequestFixtureServer.shared.start(mode: mode)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RequestFixtureProtocol.self] + (configuration.protocolClasses ?? [])
        let api = MatineeApi(base: real.base, configuration: configuration)
        cached = (real.base, api)
        return api
      }
    }

    /// Who's signed in, and a title of the dev server's own, which the
    /// stand-in's "here" titles and arrivals become.
    @MainActor static func prepare(_ real: MatineeApi, admin: Bool) {
      guard mode != nil else { return }
      RequestFixtureServer.shared.admin = admin
      Task {
        guard let library = try? await real.libraries.list().first(where: { $0.kind == TitleKind.movie }),
          let shelf = try? await real.media.shelf(libraryId: library.id, limit: 4)
        else { return }
        RequestFixtureServer.shared.seed(shelf.map(\.title))
      }
    }
  }

  // MARK: The stand-in

  /// The stand-in's titles, requests, and streams, behind a lock.
  nonisolated final class RequestFixtureServer: @unchecked Sendable {
    static let shared = RequestFixtureServer()

    private let lock = NSRecursiveLock()
    private var started = false
    private var mode = RequestFixtures.Mode.full
    private var _admin = false
    var admin: Bool {
      get { lock.withLock { _admin } }
      set { lock.withLock { _admin = newValue; refreshActions() } }
    }
    private var titles: [String: FixtureTitle] = [:]
    private var order: [String] = []
    private var requests: [String: FixtureRequest] = [:]
    private var library: [TitleSummary] = []
    private var notices: [MatineeCore.Notification] = []
    private var streams: [UUID: (Data?) -> Void] = [:]
    private var counter = 0

    struct FixtureTitle {
      var ref: CatalogRef
      var name: String
      var year: Int?
      var overview: String
      var genres: [String]
      var genreIds: [Int]
      var rating: Double?
      var contentRating: String?
      var availability: Availability
      var seasons: [CatalogSeason] = []
      var score: Double
      var votes: Int
      var releaseDate: String?
      var cast: [String] = []
      var popular = true
    }

    struct FixtureRequest {
      var id: String
      var ref: CatalogRef
      var scope: ShowScope?
      var status: String
      var createdAt: String
      var followers: [AdminRequestItem.Follower]
      var mine: Bool
      var reason: String?
      var note: String?
    }

    // MARK: Setting up

    func start(mode: RequestFixtures.Mode) {
      lock.withLock {
        guard !started else { return }
        started = true
        self.mode = mode
        build()
      }
    }

    func seed(_ titles: [TitleSummary]) {
      lock.withLock {
        library = titles
        if let here = titles.first, var matrix = self.titles[key("movie", "603")] {
          matrix.availability = availability("here", here: here.id)
          matrix.name = here.name
          matrix.year = here.year
          self.titles[matrix.ref.requestKey] = matrix
        }
        publish()
      }
    }

    private func key(_ kind: String, _ id: String) -> String { "\(kind):tmdb:\(id)" }

    private func day(_ offset: Int) -> String {
      let date = Calendar.current.date(byAdding: .day, value: offset, to: Date()) ?? Date()
      let formatter = DateFormatter()
      formatter.locale = Locale(identifier: "en_US_POSIX")
      formatter.dateFormat = "yyyy-MM-dd"
      return formatter.string(from: date)
    }

    private func instant(_ seconds: TimeInterval) -> String {
      ISO8601DateFormatter().string(from: Date().addingTimeInterval(seconds))
    }

    private func availability(
      _ state: String, action: String? = nil, id: String? = nil, progress: Double? = nil, eta: Int? = nil,
      release: String? = nil, looking: Bool = false, reason: Availability.Reason? = nil, mine: Bool = false,
      following: Bool = false, others: [String] = [], here: String? = nil, disabled: String? = nil
    ) -> Availability {
      Availability(
        state: state, action: action, progress: progress, etaSeconds: eta, releaseDate: release, stillLooking: looking,
        reason: reason, askedBySelf: mine, following: following, requestId: id,
        others: .init(count: others.count, names: others), limit: nil, libraryTitleId: here, disabledReason: disabled)
    }

    private func season(_ number: Int, _ state: Availability, episodes: Int, aired: Int? = nil, air: String? = nil, selected: Bool = true)
      -> CatalogSeason
    {
      CatalogSeason(
        number: number, overview: nil, poster: nil, episodeCount: episodes, airDate: air,
        availability: SeasonAvailability(
          state: state.state, action: state.action, progress: state.progress, etaSeconds: state.etaSeconds,
          releaseDate: state.releaseDate, stillLooking: state.stillLooking,
          reason: state.reason.map { .init(kind: $0.kind, code: $0.code, note: $0.note) }, askedBySelf: state.askedBySelf,
          following: state.following, requestId: state.requestId, others: .init(count: state.others.count, names: state.others.names),
          limit: nil, libraryTitleId: nil, disabledReason: state.disabledReason, number: number, episodesHere: 0,
          episodesAired: aired ?? episodes),
        selected: selected)
    }

    private func add(_ title: FixtureTitle) {
      titles[title.ref.requestKey] = title
      order.append(title.ref.requestKey)
    }

    private func film(
      _ id: String, _ name: String, _ year: Int, _ availability: Availability, genres: [(Int, String)] = [(18, "Drama")],
      rating: Double = 7.4, score: Double = 7.4, votes: Int = 900, overview: String? = nil, cast: [String] = [],
      popular: Bool = true
    ) {
      add(
        FixtureTitle(
          ref: CatalogRef(kind: "movie", provider: "tmdb", providerId: id), name: name, year: year,
          overview: overview ?? "A stand-in for \(name), from the request fixtures.", genres: genres.map(\.1),
          genreIds: genres.map(\.0), rating: rating, contentRating: "PG-13", availability: availability, score: score,
          votes: votes, releaseDate: "\(year)-06-01", cast: cast, popular: popular))
    }

    private func build() {
      let declined = Availability.Reason(kind: "declined", code: "notForServer", note: "We keep this server to family films for now, sorry!")
      film(
        "693134", "Dune: Part Two", 2024, availability("none", action: "ask"),
        genres: [(878, "Science Fiction"), (12, "Adventure")], rating: 8.2, score: 8.2, votes: 6000,
        overview: "Paul Atreides unites with Chani and the Fremen while on a path of revenge against the conspirators who destroyed his family.",
        cast: ["Timothée Chalamet", "Zendaya", "Rebecca Ferguson", "Javier Bardem", "Austin Butler"])
      film("872585", "Oppenheimer", 2023, availability("asked", action: "cancel", id: "r-opp", mine: true), genres: [(18, "Drama"), (36, "History")], rating: 8.1, votes: 9000)
      film("666277", "Past Lives", 2023, availability("coming", id: "r-past", progress: 0.64, eta: 1260, mine: true), genres: [(10749, "Romance"), (18, "Drama")])
      film("786892", "Furiosa", 2024, availability("coming", id: "r-fur", looking: true, mine: true), genres: [(28, "Action"), (12, "Adventure")])
      film("696506", "Mickey 17", 2026, availability("release", id: "r-mick", release: day(40), mine: true), genres: [(878, "Science Fiction"), (35, "Comedy")])
      film("965150", "Aftersun", 2022, availability("unavailable", id: "r-aft", reason: declined, mine: true, disabled: "declined"))
      film("840430", "The Holdovers", 2023, availability("asked", action: "follow", id: "r-hold", others: ["anna"]), genres: [(35, "Comedy"), (18, "Drama")])
      film("976893", "Perfect Days", 2023, availability("coming", action: "unfollow", id: "r-perf", progress: 0.2, following: true, others: ["ben"]))
      film("603", "The Matrix", 1999, availability("here", here: nil), genres: [(28, "Action"), (878, "Science Fiction")], rating: 8.2)
      film("915935", "Anatomy of a Fall", 2023, availability("none", action: "ask"), genres: [(53, "Thriller"), (18, "Drama")])
      film("1022789", "Inside Out 2", 2024, availability("release", release: nil), genres: [(16, "Animation"), (10751, "Family")])
      // Shows.
      add(
        FixtureTitle(
          ref: CatalogRef(kind: "show", provider: "tmdb", providerId: "95396"), name: "Severance", year: 2022,
          overview: "Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives.",
          genres: ["Drama", "Mystery"], genreIds: [18, 9648], rating: 8.4, contentRating: "TV-MA",
          availability: availability("asked", id: "r-sev", mine: true),
          seasons: [
            season(1, availability("asked", action: "cancel", id: "r-sev", mine: true), episodes: 9),
            season(2, availability("none", action: "ask"), episodes: 10),
            season(3, availability("release", release: day(120)), episodes: 10, aired: 0, air: day(120), selected: false),
            season(0, availability("none", action: "ask"), episodes: 3, selected: false),
          ], score: 8.4, votes: 3000, releaseDate: "2022-02-18",
          cast: ["Adam Scott", "Britt Lower", "Zach Cherry", "Patricia Arquette"]))
      add(
        FixtureTitle(
          ref: CatalogRef(kind: "show", provider: "tmdb", providerId: "126308"), name: "Shōgun", year: 2024,
          overview: "In Japan in the year 1600, a mysterious European ship is found marooned in a nearby fishing village.",
          genres: ["Drama", "War & Politics"], genreIds: [18, 10768], rating: 8.6, contentRating: "TV-MA",
          availability: availability("none", action: "ask"),
          seasons: [
            season(1, availability("none", action: "ask"), episodes: 10),
            season(2, availability("none", action: "ask"), episodes: 10, aired: 4),
            season(3, availability("none", action: "ask"), episodes: 10, aired: 0, air: day(400), selected: false),
          ], score: 8.6, votes: 1200, releaseDate: "2024-02-27"))
      add(
        FixtureTitle(
          ref: CatalogRef(kind: "show", provider: "tmdb", providerId: "136315"), name: "The Bear", year: 2022,
          overview: "A young chef from the fine dining world comes home to Chicago to run his family's sandwich shop.",
          genres: ["Comedy", "Drama"], genreIds: [35, 18], rating: 8.2, contentRating: "TV-MA",
          availability: availability("coming", id: "r-bear", progress: 0.3, mine: true),
          seasons: [
            season(1, availability("coming", id: "r-bear", progress: 1, mine: true), episodes: 8),
            season(2, availability("coming", id: "r-bear", progress: 0.3, mine: true), episodes: 10),
            season(3, availability("unavailable", reason: .init(kind: "notFound", code: nil, note: nil)), episodes: 10),
          ], score: 8.2, votes: 1500, releaseDate: "2022-06-23"))
      // Enough more for Browse and a row's whole list to page.
      let more = [
        "Arrival", "Blade Runner 2049", "Her", "Moonlight", "Parasite", "Roma", "Nomadland", "Tár", "Drive My Car",
        "The Zone of Interest", "Poor Things", "Killers of the Flower Moon", "Barbie", "Asteroid City", "Godzilla Minus One",
        "The Boy and the Heron", "Society of the Snow", "May December", "Saltburn", "Priscilla", "Napoleon", "Wonka",
        "The Iron Claw", "Maestro", "Ferrari", "American Fiction", "Origin", "All of Us Strangers", "Evil Does Not Exist",
        "Fallen Leaves", "Monster", "The Taste of Things", "La Chimera", "Kinds of Kindness", "Challengers", "Civil War",
      ]
      for (index, name) in more.enumerated() {
        let genres: [(Int, String)] = index.isMultiple(of: 3) ? [(878, "Science Fiction")] : index.isMultiple(of: 2) ? [(35, "Comedy")] : [(18, "Drama")]
        film(
          "9\(index)00", name, 2016 + index % 9, availability("none", action: "ask"), genres: genres,
          rating: 6 + Double(index % 30) / 10, score: 6 + Double(index % 30) / 10, votes: 200 + index * 130)
      }
      // The admin's queue: what others asked for.
      let anna = AdminRequestItem.Follower(id: "u-anna", name: "anna", avatarId: nil, asked: true, createdAt: instant(-7200))
      let ben = AdminRequestItem.Follower(id: "u-ben", name: "ben", avatarId: nil, asked: false, createdAt: instant(-3600))
      let viewer = AdminRequestItem.Follower(id: "u-viewer", name: "ios-viewer", avatarId: nil, asked: true, createdAt: instant(-86_400 * 2))
      requests = [
        "r-opp": FixtureRequest(id: "r-opp", ref: titles[key("movie", "872585")]!.ref, scope: nil, status: "waiting", createdAt: instant(-86_400 * 2), followers: [viewer], mine: true),
        "r-hold": FixtureRequest(id: "r-hold", ref: titles[key("movie", "840430")]!.ref, scope: nil, status: "waiting", createdAt: instant(-7200), followers: [anna, ben], mine: false),
        "r-sev": FixtureRequest(id: "r-sev", ref: titles[key("show", "95396")]!.ref, scope: ShowScope(seasons: [1], future: true), status: "waiting", createdAt: instant(-600), followers: [viewer], mine: true),
        "r-past": FixtureRequest(id: "r-past", ref: titles[key("movie", "666277")]!.ref, scope: nil, status: "accepted", createdAt: instant(-86_400 * 4), followers: [viewer], mine: true),
        "r-fur": FixtureRequest(id: "r-fur", ref: titles[key("movie", "786892")]!.ref, scope: nil, status: "accepted", createdAt: instant(-86_400 * 5), followers: [viewer], mine: true),
        "r-bear": FixtureRequest(id: "r-bear", ref: titles[key("show", "136315")]!.ref, scope: ShowScope(seasons: [1, 2], future: false), status: "accepted", createdAt: instant(-86_400 * 6), followers: [viewer], mine: true),
        "r-mick": FixtureRequest(id: "r-mick", ref: titles[key("movie", "696506")]!.ref, scope: nil, status: "accepted", createdAt: instant(-86_400 * 8), followers: [viewer], mine: true),
        "r-aft": FixtureRequest(id: "r-aft", ref: titles[key("movie", "965150")]!.ref, scope: nil, status: "declined", createdAt: instant(-86_400 * 9), followers: [viewer], mine: true, reason: "notForServer", note: "We keep this server to family films for now, sorry!"),
        "r-perf": FixtureRequest(id: "r-perf", ref: titles[key("movie", "976893")]!.ref, scope: nil, status: "accepted", createdAt: instant(-86_400), followers: [ben], mine: false),
      ]
      notices = [
        MatineeCore.Notification(
          id: "n-fixture-matrix", kind: "ready", title: summary(key("movie", "603")), season: nil, count: 1,
          createdAt: instant(-300), readAt: nil)
      ]
      refreshActions()
    }

    /// What the server would offer this account: an admin adds where anyone
    /// else asks, and the mode's quota or switch on every title still to ask for.
    private func refreshActions() {
      for (key, var title) in titles {
        title.availability = offer(title.availability)
        title.seasons = title.seasons.map { season in
          var season = season
          let offered = offer(season.availability.asTitle)
          season.availability.action = offered.action
          season.availability.disabledReason = offered.disabledReason
          season.availability.limit = offered.limit.map { .init(left: $0.left, resetsAt: $0.resetsAt) }
          return season
        }
        titles[key] = title
      }
    }

    private func offer(_ availability: Availability) -> Availability {
      var value = availability
      let askable = ["ask", "add"].contains(value.action ?? "") || value.disabledReason == "limit" || value.disabledReason == "off"
      guard askable else { return value }
      value.action = _admin ? "add" : "ask"
      value.disabledReason = nil
      value.limit = nil
      switch mode {
      case .full: break
      case .left: value.limit = .init(left: 2, resetsAt: instant(86_400 * 3))
      case .limit:
        value.action = nil
        value.disabledReason = "limit"
        value.limit = .init(left: 0, resetsAt: instant(86_400 * 3))
      case .off:
        value.action = nil
        value.disabledReason = "off"
      }
      return value
    }

    // MARK: Reading

    private func summary(_ key: String) -> CatalogTitleSummary? {
      titles[key].map { CatalogTitleSummary(ref: $0.ref, name: $0.name, year: $0.year, poster: nil, availability: $0.availability) }
    }

    private func detail(_ ref: CatalogRef) -> CatalogTitleDetail? {
      guard let title = titles[ref.requestKey] else { return nil }
      return CatalogTitleDetail(
        ref: title.ref, name: title.name, year: title.year, poster: nil, availability: title.availability, stale: false,
        overview: title.overview, genres: title.genres, rating: title.rating, contentRating: title.contentRating,
        backdrop: nil,
        credits: title.cast.enumerated().map { Credit(kind: CreditKind.actor, name: $0.element, role: nil, photo: nil, tmdbId: nil) }
          + [Credit(kind: title.ref.kind == "show" ? CreditKind.creator : CreditKind.director, name: "A. Director", role: nil, photo: nil, tmdbId: nil)],
        studios: ["Fixture Pictures"],
        trailers: [Trailer(url: "https://www.youtube.com/watch?v=Way9Dexny3w", name: "Trailer", language: "en")],
        seasons: title.seasons,
        defaultScope: title.ref.kind == "show" ? ShowScope(seasons: title.seasons.filter(\.selected).map(\.number), future: true) : nil,
        destinations: [CatalogDestination(id: "lib-fixture", name: title.ref.kind == "show" ? "Shows" : "Movies", selected: true)])
    }

    private func live(_ ref: CatalogRef) -> RequestsLiveEvent? {
      titles[ref.requestKey].map { title in
        RequestsLiveEvent(ref: title.ref, availability: title.availability, seasons: title.seasons.map(\.availability))
      }
    }

    private func item(_ request: FixtureRequest) -> RequestItem? {
      guard let title = summary(request.ref.requestKey) else { return nil }
      return RequestItem(
        id: request.id, title: title, library: RequestDestination(id: "lib-fixture", name: request.ref.kind == "show" ? "Shows" : "Movies"),
        scope: request.scope, createdAt: request.createdAt, arrivedAt: title.availability.state == "here" ? instant(-60) : nil,
        availability: title.availability,
        season: titles[request.ref.requestKey]?.seasons.first { $0.availability.state != "here" && request.scope?.seasons.contains($0.number) == true }?.availability)
    }

    private func adminItem(_ request: FixtureRequest) -> AdminRequestItem? {
      guard let item = item(request) else { return nil }
      return AdminRequestItem(
        id: item.id, title: item.title, library: item.library, scope: item.scope, createdAt: item.createdAt,
        arrivedAt: item.arrivedAt, availability: item.availability, season: item.season, status: request.status,
        fulfilmentState: request.status == "accepted" ? "sent" : nil, error: nil, reason: request.reason, note: request.note,
        declinedAt: request.status == "declined" ? instant(-86_400) : nil,
        connection: AdminRequestItem.Connection(id: "c-radarr", name: request.ref.kind == "show" ? "Sonarr" : "Radarr", reportsProgress: true),
        followers: request.followers, destinationDescription: item.library.name, destinations: [], remoteUrl: nil, diagnostics: [])
    }

    private func queue() -> RequestQueue {
      let all = requests.values.sorted { $0.createdAt > $1.createdAt }
      func list(_ test: (FixtureRequest, Availability) -> Bool) -> [AdminRequestItem] {
        all.filter { request in titles[request.ref.requestKey].map { test(request, $0.availability) } ?? false }.compactMap(adminItem)
      }
      let waiting = list { request, _ in request.status == "waiting" }
      let onTheWay = list { request, availability in request.status == "accepted" && availability.state != "here" }
      let done = list { request, availability in request.status == "declined" || availability.state == "here" }
      let attention = [adminItem(FixtureRequest(id: "r-att", ref: titles[key("movie", "915935")]!.ref, scope: nil, status: "accepted", createdAt: instant(-86_400 * 3), followers: [], mine: false))].compactMap(\.self).map { item -> AdminRequestItem in
        var item = item
        item.error = "Radarr couldn't find a release that matches the quality profile."
        return item
      }
      return RequestQueue(
        waiting: waiting, needsAttention: attention, onTheWay: onTheWay, done: done,
        counts: .init(waiting: waiting.count, needsAttention: attention.count, onTheWay: onTheWay.count, done: done.count), nextCursor: nil)
    }

    // MARK: Answering

    /// The answer to `path` with `body`, or nil for a path the stand-in doesn't serve.
    func answer(_ path: String, query: [String: String], body: Data) -> (Int, Data)? {
      lock.withLock {
        let decoder = JSONDecoder()
        func ok(_ value: some Encodable) -> (Int, Data) { (200, (try? JSONEncoder().encode(value)) ?? Data()) }
        func notFound() -> (Int, Data) { (404, Data(#"{"message":"No such title at the provider."}"#.utf8)) }
        switch path {
        case "catalog/details":
          guard let input = try? decoder.decode(CatalogInput.self, from: body), let detail = detail(input.ref) else { return notFound() }
          return ok(detail)
        case "catalog/related":
          let isDune = (try? decoder.decode(CatalogInput.self, from: body))?.ref.providerId == "693134"
          return ok(RelatedRails(rails: (isDune ? [RelatedRail(id: RelatedRailId.collection, name: "Dune Collection")] : []) + [RelatedRail(id: RelatedRailId.moreLikeThis, name: nil)], stale: false))
        case "catalog/related/titles":
          let rail = (try? JSONSerialization.jsonObject(with: body) as? [String: Any])?["rail"] as? String
          let keys = rail == RelatedRailId.collection ? [key("movie", "603"), key("movie", "696506")] : Array(order.dropFirst(1).prefix(10))
          return ok(RelatedPage(items: keys.compactMap(related), stale: false))
        case "catalog/search":
          let needle = (query["query"] ?? "").lowercased()
          let found = order.compactMap { titles[$0] }.filter { !needle.isEmpty && $0.name.lowercased().contains(needle) && $0.availability.state != "here" }
          return ok(CatalogPage(items: found.compactMap { summary($0.ref.requestKey) }, nextPage: nil, stale: false))
        case "discover/rails":
          let seed = RecommendationSeed(ref: CatalogRef(kind: "movie", provider: "tmdb", providerId: "603"), name: "The Matrix")
          return ok(DiscoverRails(
            enabled: true,
            rails: [DiscoverRail(id: "forYou", seed: nil), DiscoverRail(id: "popularFilms", seed: nil), DiscoverRail(id: "popularShows", seed: nil), DiscoverRail(id: "becauseWatched", seed: seed), DiscoverRail(id: "comingSoon", seed: nil)],
            browse: ["movie", "show"]))
        case "discover/page":
          guard let input = try? JSONSerialization.jsonObject(with: body) as? [String: Any], let rail = (input["rail"] as? [String: Any])?["id"] as? String else { return notFound() }
          let page = input["page"] as? Int ?? 1
          let all = railItems(rail)
          let slice = Array(all.dropFirst((page - 1) * 24).prefix(24))
          return ok(CatalogPage(items: slice, nextPage: all.count > page * 24 ? page + 1 : nil, stale: false))
        case "discover/browse/options":
          return ok(CatalogBrowseOptions(
            enabled: true, stale: false,
            genres: [.init(id: 28, name: "Action"), .init(id: 35, name: "Comedy"), .init(id: 18, name: "Drama"), .init(id: 878, name: "Science Fiction"), .init(id: 10749, name: "Romance")],
            ratings: .init(country: "US", ratings: ["G", "PG", "PG-13", "R"]),
            languages: [CatalogChoice(id: "en", name: "English"), CatalogChoice(id: "de", name: "German"), CatalogChoice(id: "ja", name: "Japanese"), CatalogChoice(id: "ko", name: "Korean")],
            sorts: ["popular", "scoreHigh", "scoreLow", "votes", "newest", "oldest", "nameAsc", "nameDesc"],
            votes: [100, 500, 1000, 5000],
            years: CatalogRange(min: 1920, max: 2026, step: 1), scores: CatalogRange(min: 0, max: 10, step: 0.5),
            runtime: CatalogRange(min: 0, max: 240, step: 5)))
        case "discover/browse":
          guard let input = try? decoder.decode(CatalogBrowseInput.self, from: body) else { return notFound() }
          return ok(browse(input))
        case "requests/live", "admin/requests/live":
          return nil
        case "requests/mine":
          let filter = query["filter"] ?? "all"
          let mine = requests.values.filter(\.mine).sorted { $0.createdAt > $1.createdAt }.compactMap(item)
            .filter { filter == "all" || $0.availability.state != "here" }
          return ok(RequestPage(items: mine, nextCursor: nil))
        case "requests/ask":
          guard let input = try? decoder.decode(RequestsAskBody.self, from: body) else { return notFound() }
          return ask(input.ref, scope: input.scope).map(ok) ?? notFound()
        case "requests/cancel":
          guard let input = try? decoder.decode(RequestId.self, from: body) else { return notFound() }
          cancel(input.id)
          return (200, Data())
        case "requests/follow", "requests/unfollow":
          guard let input = try? decoder.decode(RequestId.self, from: body) else { return notFound() }
          follow(input.id, on: path == "requests/follow")
          return (200, Data())
        case "admin/requests":
          return ok(queue())
        case "admin/requests/approve":
          guard let id = (try? JSONSerialization.jsonObject(with: body) as? [String: Any])?["id"] as? String else { return notFound() }
          approve(id)
          return (200, Data())
        case "admin/requests/decline":
          guard let input = try? JSONSerialization.jsonObject(with: body) as? [String: Any], let id = input["id"] as? String else { return notFound() }
          decline(id, reason: input["reason"] as? String ?? "notForServer", note: input["note"] as? String)
          return (200, Data())
        case _ where path.hasPrefix("people/"):
          let name = String(path.dropFirst("people/".count)).removingPercentEncoding ?? ""
          let catalog = ["696506", "693134", "915935", "965150", "126308"].compactMap { id in
            (titles[key("movie", id)] ?? titles[key("show", id)]).map {
              PersonCatalogCredit(ref: $0.ref, name: $0.name, year: $0.year, poster: nil, availability: $0.availability, role: "Herself")
            }
          }
          return ok(Person(name: name, photo: nil, kind: "actor", titleCount: 0, credits: [], profile: nil, catalog: catalog, stale: false))
        case "notifications":
          return ok(NotificationPage(items: notices, nextCursor: nil))
        case "notifications/read":
          let ids = (try? JSONSerialization.jsonObject(with: body) as? [String: Any])?["ids"] as? [String] ?? []
          let now = instant(0)
          notices = notices.map { notice in
            var notice = notice
            if ids.contains(notice.id) { notice.readAt = now }
            return notice
          }
          return (200, Data())
        default:
          return nil
        }
      }
    }

    private struct RequestsAskBody: Decodable {
      let ref: CatalogRef
      let scope: ShowScope?
    }

    private func related(_ key: String) -> RelatedTitle? {
      guard let title = titles[key] else { return nil }
      let library = title.availability.state == "here" ? self.library.first { $0.id == title.availability.libraryTitleId } : nil
      return RelatedTitle(ref: title.ref, name: title.name, year: title.year, poster: nil, availability: title.availability, title: library)
    }

    private func railItems(_ rail: String) -> [CatalogTitleSummary] {
      let all = order.compactMap { titles[$0] }.filter { $0.availability.state != "here" }
      let picked: [FixtureTitle] =
        switch rail {
        case "popularFilms": all.filter { $0.ref.kind == "movie" }
        case "popularShows": all.filter { $0.ref.kind == "show" }
        case "comingSoon": all.filter { $0.availability.state == "release" }
        case "becauseWatched": all.filter { $0.genres.contains("Science Fiction") }
        default: Array(all.reversed().prefix(12))
        }
      return picked.compactMap { summary($0.ref.requestKey) }
    }

    private func browse(_ input: CatalogBrowseInput) -> CatalogBrowsePage {
      let filters = input.filters
      var all = order.compactMap { titles[$0] }.filter { $0.ref.kind == input.kind }
      if let genres = filters.genres, !genres.isEmpty { all = all.filter { !Set($0.genreIds).isDisjoint(with: genres) } }
      if let from = filters.yearFrom { all = all.filter { ($0.year ?? 0) >= from } }
      if let to = filters.yearTo { all = all.filter { ($0.year ?? 0) <= to } }
      if let low = filters.scoreMin { all = all.filter { $0.score >= low } }
      if let high = filters.scoreMax { all = all.filter { $0.score <= high } }
      if let votes = filters.votesMin { all = all.filter { $0.votes >= votes } }
      let scored = input.sort == "scoreHigh" || input.sort == "scoreLow"
      if scored { all = all.filter { $0.votes >= 500 } }
      switch input.sort {
      case "scoreHigh": all.sort { $0.score > $1.score }
      case "scoreLow": all.sort { $0.score < $1.score }
      case "votes": all.sort { $0.votes > $1.votes }
      case "newest": all.sort { ($0.year ?? 0) > ($1.year ?? 0) }
      case "oldest": all.sort { ($0.year ?? 0) < ($1.year ?? 0) }
      case "nameAsc": all.sort { $0.name < $1.name }
      case "nameDesc": all.sort { $0.name > $1.name }
      default: break
      }
      let page = input.page ?? 1
      let items = all.dropFirst((page - 1) * 24).prefix(24).map { title in
        CatalogBrowseTitle(
          ref: title.ref, name: title.name, year: title.year, poster: nil, availability: title.availability,
          title: title.availability.state == "here" ? library.first { $0.id == title.availability.libraryTitleId } : nil,
          score: title.score, votes: title.votes, releaseDate: title.releaseDate)
      }
      return CatalogBrowsePage(
        items: Array(items), nextPage: all.count > page * 24 ? page + 1 : nil, stale: false, voteFloor: scored ? 500 : nil,
        detail: scored ? "score" : input.sort == "newest" || input.sort == "oldest" ? "releaseDate" : nil)
    }

    // MARK: Changing

    private func ask(_ ref: CatalogRef, scope: ShowScope?) -> RequestItem? {
      guard var title = titles[ref.requestKey] else { return nil }
      counter += 1
      let id = title.availability.requestId ?? "r-new-\(counter)"
      let asked = availability("asked", action: "cancel", id: id, mine: true)
      title.availability = asked
      var chosen: SeasonAvailability?
      if let scope {
        title.seasons = title.seasons.map { season in
          guard scope.seasons.contains(season.number) else { return season }
          var season = season
          season.availability.state = "asked"
          season.availability.action = "cancel"
          season.availability.requestId = id
          season.availability.askedBySelf = true
          season.availability.disabledReason = nil
          chosen = chosen ?? season.availability
          return season
        }
      }
      titles[ref.requestKey] = title
      let me = AdminRequestItem.Follower(id: "u-me", name: _admin ? "ios-admin" : "ios-viewer", avatarId: nil, asked: true, createdAt: instant(0))
      requests[id] = FixtureRequest(id: id, ref: ref, scope: scope, status: "waiting", createdAt: instant(0), followers: [me], mine: true)
      publish()
      return item(requests[id]!).map { item in
        var item = item
        item.season = chosen
        return item
      }
    }

    private func reset(_ ref: CatalogRef, id: String) {
      guard var title = titles[ref.requestKey] else { return }
      title.availability = offer(availability("none", action: "ask"))
      title.seasons = title.seasons.map { season in
        guard season.availability.requestId == id else { return season }
        var season = season
        let open = offer(availability("none", action: "ask"))
        season.availability.state = "none"
        season.availability.action = open.action
        season.availability.disabledReason = open.disabledReason
        season.availability.requestId = nil
        season.availability.askedBySelf = false
        return season
      }
      titles[ref.requestKey] = title
    }

    private func cancel(_ id: String) {
      guard let request = requests.removeValue(forKey: id) else { return }
      reset(request.ref, id: id)
      publish()
    }

    private func follow(_ id: String, on: Bool) {
      guard let key = titles.first(where: { $0.value.availability.requestId == id })?.key else { return }
      titles[key]?.availability.following = on
      titles[key]?.availability.action = on ? "unfollow" : "follow"
      publish()
    }

    private func approve(_ id: String) {
      guard var request = requests[id] else { return }
      request.status = "accepted"
      requests[id] = request
      setState(request.ref, id: id) { $0.state = "coming"; $0.action = nil; $0.progress = 0.1 }
      publish()
      tick(id, progress: 0.1)
    }

    /// An added request comes in over some seconds, then arrives.
    private func tick(_ id: String, progress: Double) {
      DispatchQueue.global().asyncAfter(deadline: .now() + 3) { [self] in
        lock.withLock {
          guard let request = requests[id], request.status == "accepted" else { return }
          if progress >= 0.9 {
            let here = library.dropFirst().first?.id ?? library.first?.id
            setState(request.ref, id: id) { $0.state = "here"; $0.progress = nil; $0.libraryTitleId = here }
            notices.append(MatineeCore.Notification(id: "n-\(UUID().uuidString)", kind: "ready", title: summary(request.ref.requestKey), season: nil, count: 1, createdAt: instant(0), readAt: nil))
          } else {
            setState(request.ref, id: id) { $0.progress = progress + 0.4 }
            tick(id, progress: progress + 0.4)
          }
          publish()
        }
      }
    }

    private func decline(_ id: String, reason: String, note: String?) {
      guard var request = requests[id] else { return }
      request.status = "declined"
      request.reason = reason
      request.note = note
      requests[id] = request
      setState(request.ref, id: id) {
        $0.state = "unavailable"
        $0.action = nil
        $0.reason = .init(kind: "declined", code: reason, note: note)
        $0.disabledReason = "declined"
      }
      publish()
    }

    private func setState(_ ref: CatalogRef, id: String, _ change: (inout Availability) -> Void) {
      guard var title = titles[ref.requestKey] else { return }
      change(&title.availability)
      title.seasons = title.seasons.map { season in
        guard season.availability.requestId == id else { return season }
        var season = season
        var state = season.availability.asTitle
        change(&state)
        season.availability.state = state.state
        season.availability.action = state.action
        season.availability.progress = state.progress
        season.availability.disabledReason = state.disabledReason
        return season
      }
      titles[ref.requestKey] = title
    }

    // MARK: Streams

    /// Opens a stream for `path`: its snapshot now and after each change.
    func open(_ path: String, body: Data, send: @escaping (Data?) -> Void) -> UUID {
      let id = UUID()
      let make: () -> Data? = { [self] in
        switch path {
        case "requests/live":
          guard let input = try? JSONDecoder().decode(RequestsLiveInput.self, from: body) else { return nil }
          return try? JSONEncoder().encode(input.titles.compactMap { live($0.ref) })
        default:
          return try? JSONEncoder().encode(queue())
        }
      }
      lock.withLock {
        streams[id] = { _ in send(make()) }
        send(make())
      }
      return id
    }

    func close(_ id: UUID) { lock.withLock { _ = streams.removeValue(forKey: id) } }

    private func publish() { for stream in streams.values { stream(nil) } }
  }

  // MARK: The protocol

  /// Serves the stand-in's paths under /api/v1; everything else goes on to the network.
  nonisolated final class RequestFixtureProtocol: URLProtocol, @unchecked Sendable {
    private var stream: UUID?

    private static let served: Set<String> = [
      "catalog/details", "catalog/related", "catalog/related/titles", "catalog/search", "discover/rails", "discover/page",
      "discover/browse/options", "discover/browse", "requests/live", "admin/requests/live", "requests/mine",
      "requests/ask", "requests/cancel", "requests/follow", "requests/unfollow", "admin/requests",
      "admin/requests/approve", "admin/requests/decline", "notifications", "notifications/read",
    ]

    private static func path(_ request: URLRequest) -> String? {
      guard let path = request.url?.path, let range = path.range(of: "/api/v1/") else { return nil }
      return String(path[range.upperBound...])
    }

    override class func canInit(with request: URLRequest) -> Bool {
      path(request).map { served.contains($0) || $0.hasPrefix("people/") } ?? false
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
      guard let path = Self.path(request), let url = request.url else { return }
      let body = request.httpBody ?? request.httpBodyStream.map(Self.read) ?? Data()
      let query = Dictionary(
        (URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []).compactMap { item in
          item.value.map { (item.name, $0) }
        }, uniquingKeysWith: { $1 })
      if path.hasSuffix("live") {
        client?.urlProtocol(
          self, didReceive: HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/event-stream"])!,
          cacheStoragePolicy: .notAllowed)
        stream = RequestFixtureServer.shared.open(path, body: body) { [weak self] data in
          guard let self, let data else { return }
          var event = Data("data: ".utf8)
          event.append(data)
          event.append(Data("\n\n".utf8))
          self.client?.urlProtocol(self, didLoad: event)
        }
        return
      }
      // A moment's wait, as a server takes one, so busy states show.
      Thread.sleep(forTimeInterval: path.hasPrefix("requests/") || path.hasPrefix("admin/") ? 0.35 : 0.15)
      let (status, data) = RequestFixtureServer.shared.answer(path, query: query, body: body) ?? (404, Data())
      client?.urlProtocol(
        self, didReceive: HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!,
        cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {
      if let stream { RequestFixtureServer.shared.close(stream) }
    }

    private static func read(_ stream: InputStream) -> Data {
      stream.open()
      defer { stream.close() }
      var data = Data()
      var buffer = [UInt8](repeating: 0, count: 4096)
      while stream.hasBytesAvailable {
        let count = stream.read(&buffer, maxLength: buffer.count)
        guard count > 0 else { break }
        data.append(buffer, count: count)
      }
      return data
    }
  }
#endif
