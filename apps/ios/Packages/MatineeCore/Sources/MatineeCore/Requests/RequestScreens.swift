import Foundation

/*
 * What the request screens decide from the server's answers, as Android's
 * CatalogScreen.kt, Asked.kt, Admin.kt, Ask.kt, Discover.kt, and Browse.kt
 * decide it in their screens: which button a catalog page has, when it
 * becomes the library's page, what an asked card is, who asked, what a
 * show's request covers, and which cards a grid follows. Values, not
 * words; the app's RequestWords.swift says them.
 */

// MARK: Catalog page

extension Availability {
  /// The library title this is once it's here, for a catalog page or card
  /// to become the library's: only while the server says "here".
  public var arrivedTitleId: String? { state == "here" ? libraryTitleId : nil }
}

/// A catalog page's request button, as Android's `CatalogActions`: the
/// server's action, or for a show asked for already that has seasons left
/// to ask for, "Request more", which opens the sheet.
public enum CatalogPageAction: Sendable, Equatable {
  /// The poster's button, the server's action or a dimmed Request.
  case poster
  /// "Request more": a show with no action of its own whose seasons still ask.
  case more
  /// Neither: only the trailer, if any.
  case none
}

public func catalogPageAction(ref: CatalogRef, availability: Availability, seasons: [CatalogSeason]) -> CatalogPageAction {
  if ref.kind == "show", availability.posterAction == nil, seasons.contains(where: { $0.availability.asks }) {
    return .more
  }
  return availability.hasPosterButton ? .poster : .none
}

/// Whether a request from a catalog page asks at once or opens the sheet:
/// a film asks at once; a show, and "Request more", pick seasons first.
public func catalogAsksAtOnce(ref: CatalogRef, action: CatalogPageAction) -> Bool {
  ref.kind != "show" && action != .more
}

// MARK: Permission

extension RequestPermission {
  /// How few requests are left, for the sheet to say when it's two or
  /// fewer, as the web's tip: the server's count, shown, not worked out.
  /// Nil while asking is blocked, which says why instead.
  public func leftToSay(asks: Bool) -> Int? {
    guard blocked == nil, asks, let remaining, remaining <= 2 else { return nil }
    return remaining
  }
}

/// An admin's note cut for a tap's message, as Android's `dimmedText`: at
/// most `limit` characters, at a word, without trailing punctuation, and
/// an ellipsis. My requests has all of it.
public func requestShortNote(_ note: String, limit: Int = 140) -> String {
  guard note.count > limit else { return note }
  let head = String(note.prefix(limit))
  let cut = head.lastIndex(of: " ").map { String(head[..<$0]) } ?? head
  var trimmed = cut
  while let last = trimmed.last, ",.;:".contains(last) || last == " " { trimmed.removeLast() }
  return trimmed + "…"
}

// MARK: My requests

/// What one of the viewer's requests is as a card, as Android's `AskedCard`.
public enum AskedCardKind: Sendable, Equatable {
  /// A show partly here that still waits for a season: the library's page,
  /// with that season's state.
  case pendingSeason(titleId: String, season: SeasonAvailability)
  /// The catalog card, which becomes the library's once it's here;
  /// `hereAtFirst` when it was here already when the list loaded.
  case catalog(hereAtFirst: Bool)
}

public func askedCardKind(_ item: RequestItem, live: RequestsLiveEvent?) -> AskedCardKind {
  let availability = live?.availability ?? item.availability
  let hereAtFirst = item.availability.state == "here"
  if let here = availability.arrivedTitleId, let season = item.season {
    let pending = live?.seasons.first { $0.number == season.number } ?? season
    if pending.state != "here" { return .pendingSeason(titleId: here, season: pending) }
  }
  return .catalog(hereAtFirst: hereAtFirst)
}

/// Why a declined title isn't coming, under its card in the whole list.
public func askedDeclined(_ availability: Availability) -> Availability.Reason? {
  availability.state == "unavailable" ? availability.reason : nil
}

/// The lists My requests offers, by the server's filter names.
public enum AskedFilter: String, Sendable, CaseIterable {
  case inProgress, all
}

// MARK: Admin

extension RequestAdminQueue {
  /// How many requests wait for the admin or need them, less the ones held
  /// for Undo: the profile's dot and the inbox's count.
  public var needsYou: Int {
    guard let queue else { return 0 }
    return queue.waiting.count { !held.contains($0.id) } + queue.needsAttention.count
  }

  /// The waiting requests still to answer.
  public var waiting: [AdminRequestItem] { (queue?.waiting ?? []).filter { !held.contains($0.id) } }

  /// The rows of `list`, the queue's own four, less the ones held.
  public func rows(_ list: RequestQueueList) -> [AdminRequestItem] {
    guard let queue else { return [] }
    switch list {
    case .waiting: return waiting
    case .needsAttention: return queue.needsAttention
    case .onTheWay: return queue.onTheWay
    case .done: return queue.done
    }
  }

  /// The count a list's chip says; Done has none, as Android's.
  public func count(_ list: RequestQueueList) -> Int? {
    guard let queue else { return nil }
    switch list {
    case .waiting: return waiting.count
    case .needsAttention: return queue.counts.needsAttention
    case .onTheWay: return queue.counts.onTheWay
    case .done: return nil
    }
  }
}

/// The queue's lists, as the web's and Android's.
public enum RequestQueueList: String, Sendable, CaseIterable, Hashable {
  case waiting, needsAttention, onTheWay, done
}

/// Who asked first, and everyone else who asked, as Android's `askers`:
/// by when they asked.
public func requestAskers(_ item: AdminRequestItem) -> (first: AdminRequestItem.Follower?, rest: [AdminRequestItem.Follower]) {
  let sorted = item.followers.sorted { $0.createdAt < $1.createdAt }
  return (sorted.first, Array(sorted.dropFirst()))
}

/// Who asked, for a tap on a waiting title's badge, as Android's `requestedText`.
public enum RequestedBy: Sendable, Equatable {
  /// Nobody known: just "waiting".
  case waiting
  /// One person, and when.
  case one(name: String, at: String)
  /// Several, by name.
  case many([String])
}

public func requestedBy(_ item: AdminRequestItem) -> RequestedBy {
  let (first, rest) = requestAskers(item)
  guard let first else { return .waiting }
  if rest.isEmpty { return .one(name: first.name, at: first.createdAt) }
  return .many(([first] + rest).map(\.name))
}

/// "1–4, 6": season numbers, runs of three or more as a range, as the web writes them.
public func requestSeasonRuns(_ numbers: [Int]) -> String {
  guard !numbers.isEmpty else { return "" }
  var runs: [String] = []
  var start = 0
  for index in 1...numbers.count {
    let first = numbers[start], last = numbers[index - 1]
    if index < numbers.count, numbers[index] == last + 1 { continue }
    if last - first >= 2 { runs.append("\(first)–\(last)") } else { runs += (first...last).map(String.init) }
    start = index
  }
  return runs.joined(separator: ", ")
}

/// What a show's request covers, as Android's `adminScopeText`, in parts
/// for the app's words.
public struct RequestScopeParts: Sendable, Equatable {
  /// The numbered seasons, written as runs, and how many there are; nil for none.
  public let seasons: (runs: String, count: Int)?
  public let specials: Bool
  public let future: Bool

  public static func == (a: Self, b: Self) -> Bool {
    a.seasons?.runs == b.seasons?.runs && a.seasons?.count == b.seasons?.count && a.specials == b.specials
      && a.future == b.future
  }
}

public func requestScopeParts(_ scope: ShowScope?) -> RequestScopeParts? {
  guard let scope else { return nil }
  let numbers = scope.seasons.filter { $0 > 0 }.sorted()
  let parts = RequestScopeParts(
    seasons: numbers.isEmpty ? nil : (requestSeasonRuns(numbers), numbers.count),
    specials: scope.seasons.contains(0), future: scope.future)
  if parts.seasons == nil && !parts.specials && !parts.future { return nil }
  return parts
}

/// How far along a request on its way is, as Android's `Progress`.
public enum RequestProgress: Sendable, Equatable {
  case release(String?)
  case share(Double, etaSeconds: Int?)
  case looking, queued, byHand, sent
}

public func requestProgress(_ item: AdminRequestItem) -> RequestProgress {
  let availability = item.availability
  if availability.state == "release" { return .release(availability.releaseDate) }
  if let progress = availability.progress { return .share(progress, etaSeconds: availability.etaSeconds) }
  if availability.stillLooking { return .looking }
  if item.fulfilmentState == "queued" { return .queued }
  if item.connection?.reportsProgress == false { return .byHand }
  return .sent
}

/// What became of a done request, as Android's `Outcome`.
public enum RequestOutcome: Sendable, Equatable {
  case declined(at: String?, reason: String?, gaveUp: Bool)
  case arrived(at: String?)
}

public func requestOutcome(_ item: AdminRequestItem) -> RequestOutcome {
  if item.status == "declined" {
    return .declined(at: item.declinedAt, reason: item.reason, gaveUp: item.reason == DeclineReason.notFound)
  }
  return .arrived(at: item.arrivedAt)
}

// MARK: Discover

/// How many cards a Discover row shows; its heading leads to its browse.
public let DISCOVER_RAIL_CARDS = 20

/// Tells Discover's rows apart: there can be several "Because you watched".
public func discoverRailKey(_ rail: DiscoverRail) -> String {
  rail.seed.map { "\(rail.id):\($0.ref.requestKey)" } ?? rail.id
}

/// The row holds the viewer's recommendations, whose cards offer "Not interested".
public func discoverRecommends(_ rail: DiscoverRail) -> Bool {
  rail.id == DiscoverRailId.forYou || rail.id == DiscoverRailId.becauseWatched
}

/// A browse as it opens: its kind, filters, and order.
public struct CatalogBrowseStart: Sendable, Hashable, Codable {
  public let kind: String
  public let filters: CatalogFilters
  public let sort: String
  public init(kind: String, filters: CatalogFilters = .none, sort: String = CatalogSort.popular) {
    self.kind = kind; self.filters = filters; self.sort = sort
  }
}

/// The browse a Discover row's heading opens, as Android's `DiscoverRailRow`:
/// the server's, of its first kind, with its filters and sort. Nil for a
/// row without one, as "Because you watched", whose heading opens nothing.
public func discoverRailBrowse(_ rail: DiscoverRail) -> CatalogBrowseStart? {
  guard let browse = rail.browse else { return nil }
  return CatalogBrowseStart(kind: browse.kinds.first ?? TitleKind.movie, filters: browse.filters, sort: browse.sort)
}

/// A row's cards: the first twenty, less what the viewer said they're not
/// interested in, by `CatalogRef.key`, as `HiddenRecommendations` keeps them.
public func discoverRailCards(_ rail: DiscoverRail, _ items: [CatalogBrowseTitle], hidden: Set<String>) -> [CatalogBrowseTitle] {
  Array(items.filter { !discoverRecommends(rail) || !hidden.contains($0.ref.key) }.prefix(DISCOVER_RAIL_CARDS))
}

/// The cards of Discover's rows that one stream follows: the catalog's,
/// since library cards play and don't change, once each.
public func discoverRailFollowed(_ rows: [DiscoverRow]) -> [CatalogInput] {
  rows.flatMap { $0.items.prefix(DISCOVER_RAIL_CARDS) }.filter { $0.title == nil }
    .map { CatalogInput(ref: $0.ref, libraryId: nil) }
}

// MARK: Browse

extension CatalogFilters {
  /// No filter on.
  public static let none = CatalogFilters(
    genres: [], yearFrom: nil, yearTo: nil, scoreMin: nil, scoreMax: nil, votesMin: nil, rating: nil, language: nil,
    runtimeMin: nil, runtimeMax: nil, recommended: nil, upcoming: nil, requestable: nil)

  /// How many filters are on, a range counting once, as Android's.
  public var count: Int {
    (genres ?? []).count
      + [
        yearFrom != nil || yearTo != nil, scoreMin != nil || scoreMax != nil, votesMin != nil, rating != nil,
        language != nil, runtimeMin != nil || runtimeMax != nil, recommended == true, upcoming == true,
        requestable == true,
      ].filter(\.self).count
  }

  /// The browse lists the viewer's recommendations, whose cards offer "Not interested".
  public var recommends: Bool { recommended == true }

  /// The filters kept on switching to the other kind: all but the genres
  /// and the rating, which differ between movies and shows.
  public var forOtherKind: CatalogFilters {
    var filters = self
    filters.genres = nil
    filters.rating = nil
    return filters
  }
}

/// Whether `sort` goes with `filters`: best match only among the viewer's
/// recommendations, as the server has it.
public func catalogSortFits(_ sort: String, _ filters: CatalogFilters) -> Bool {
  sort != CatalogSort.forYou || filters.recommends
}

/// The order a browse keeps once its filters change: its own while it
/// fits them, else popular, as Android's browse goes back to it.
public func catalogSort(_ sort: String, fitting filters: CatalogFilters) -> String {
  catalogSortFits(sort, filters) ? sort : CatalogSort.popular
}

/// What a browse card says under its name, as the server says the list calls for.
public enum BrowseCardDetail: Sendable, Equatable {
  case score(Double, year: Int?)
  case day(String)
  case year(Int?)
}

public func browseCardDetail(_ detail: String?, _ item: CatalogBrowseTitle) -> BrowseCardDetail {
  if detail == "score", let score = item.score { return .score(score, year: item.year) }
  if detail == "releaseDate", let day = item.releaseDate { return .day(day) }
  return .year(item.year)
}

/// The library title a browse or related card is, when the viewer can
/// watch it here now; else it's a catalog card.
public func browseLibraryTitle(_ title: TitleSummary?, _ availability: Availability) -> TitleSummary? {
  guard let title, availability.state == "here", availability.libraryTitleId == title.id else { return nil }
  return title
}

/// The cards a long grid follows: the blocks of twelve on screen and one
/// either side, at most six, as Android's browse and Discover grids, since
/// the stream takes a hundred titles and a grid can hold more.
public func requestFollowWindow(visible: Set<Int>, count: Int, block: Int = 12, most: Int = 6) -> Range<Int> {
  guard count > 0 else { return 0..<0 }
  let first = (visible.min() ?? 0) / block
  let last = (visible.max() ?? 0) / block
  let from = max(0, first - 1)
  let to = min(last + 1, from + most - 1)
  return min(from * block, count)..<min((to + 1) * block, count)
}

/// A request is one thing to answer, for a sheet about it.
extension AdminRequestItem: Identifiable {}
