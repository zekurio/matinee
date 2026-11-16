import Foundation

// RequestView.kt. Values, not localized strings; RequestWords.kt owns the words.
public enum RequestStateWord: Sendable, Equatable {
  case asked // web_requests_badge_waiting
  case coming(Double?) // web_requests_badge_coming
  case out(String) // web_requests_badge_release
  case notOut // web_requests_badge_notOut
  case unavailable // web_requests_badge_unavailable
}
public enum RequestPosterAction: Sendable { case request, cancel, follow, unfollow }
public enum RequestBlocked: Sendable, Equatable {
  case off, noDestination, declined
  case limitUntil(Date?) // web_requests_limit
}
public enum RequestChooserLabel: Sendable, Equatable {
  case pickOne, title, future, specials, one(Int), many(Int)
}
public enum RequestSeasonDetail: Sendable, Equatable {
  case episodes(Int), airing(Int, Int), release(RequestStateWord)
}
public struct RequestAnswer: Sendable, Equatable {
  public let code: String?
  public let note: String?
}
public enum RequestReasonWord: Sendable { case alreadyHere, notForServer, notFound, declined }

extension CatalogRef {
  public var requestKey: String { "\(kind):\(provider):\(providerId)" }
}
extension Availability {
  public var asks: Bool { action == "ask" || action == "add" }
  public var adds: Bool { action == "add" }
  public var posterAction: RequestPosterAction? {
    if asks { return .request }
    guard requestId != nil else { return nil }
    switch action {
    case "cancel": return .cancel
    case "follow": return .follow
    case "unfollow": return .unfollow
    default: return nil
    }
  }
  public var requestBlocked: RequestBlocked? {
    switch disabledReason {
    case "off": return .off
    case "noDestination": return .noDestination
    case "declined": return .declined
    case "limit": return .limitUntil(limit.flatMap { requestInstant($0.resetsAt) })
    default: return nil
    }
  }
  public var hasPosterButton: Bool { posterAction != nil || requestBlocked != nil }
  public var declineAnswer: RequestAnswer? {
    guard state == "unavailable", let reason else { return nil }
    let note = reason.note?.trimmingCharacters(in: .whitespacesAndNewlines)
    return RequestAnswer(code: reason.code ?? (reason.kind == "notFound" ? "notFound" : nil), note: note?.isEmpty == false ? note : nil)
  }
  public func stateWord(today: String, percent: Bool = false) -> RequestStateWord? {
    switch state {
    case "asked": return .asked
    case "coming": return .coming(percent ? progress : nil)
    case "release": return requestReleaseWord(releaseDate, today: today)
    case "unavailable": return .unavailable
    default: return nil
    }
  }
}
public func requestInstant(_ value: String?) -> Date? {
  guard let value else { return nil }
  let formatter = ISO8601DateFormatter()
  if let date = formatter.date(from: value) { return date }
  formatter.formatOptions.insert(.withFractionalSeconds)
  return formatter.date(from: value)
}
public func requestReleaseWord(_ day: String?, today: String) -> RequestStateWord {
  guard let day else { return .notOut }
  let text = String(day.prefix(10))
  let formatter = DateFormatter()
  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.calendar = Calendar(identifier: .gregorian)
  formatter.dateFormat = "yyyy-MM-dd"
  formatter.isLenient = false
  guard formatter.date(from: text) != nil, text > today else { return .notOut }
  return .out(text)
}
public func requestDeclineWord(_ reason: Availability.Reason) -> RequestReasonWord {
  if reason.kind == "notFound" || reason.code == "notFound" { return .notFound }
  switch reason.code {
  case "alreadyHere": return .alreadyHere
  case "notForServer": return .notForServer
  default: return .declined
  }
}
public func requestSeasonDetail(_ season: CatalogSeason, today: String) -> RequestSeasonDetail {
  let aired = season.availability.episodesAired
  let count = season.episodeCount ?? 0
  if aired == 0 && count > 0 { return .release(requestReleaseWord(season.airDate, today: today)) }
  if count > aired && aired > 0 { return .airing(aired, count) }
  return .episodes(count)
}
public func requestChooserLabel(chosen: [CatalogSeason], future: Bool, first: Bool) -> RequestChooserLabel {
  if chosen.isEmpty { return future && first ? .future : .pickOne }
  if chosen.count == 1 { return chosen[0].number == 0 ? .specials : .one(chosen[0].number) }
  return .many(chosen.count)
}
public func requestChooserStart(_ seasons: [CatalogSeason], only: Int? = nil) -> Set<Int> {
  Set(seasons.filter { (only == nil ? $0.selected : $0.number == only) && ["ask", "add"].contains($0.availability.action ?? "") }.map(\.number))
}
public func requestSeasonsInOrder(_ seasons: [CatalogSeason]) -> [CatalogSeason] {
  seasons.sorted { ($0.number == 0 ? Int.max : $0.number) < ($1.number == 0 ? Int.max : $1.number) }
}
public func requestAskable(_ items: [CatalogTitleSummary]) -> [CatalogTitleSummary] {
  items.filter { $0.availability.disabledReason != "off" }
}

// MARK: Seasons

extension SeasonAvailability {
  /// A season's state as a title's, Android's `asTitle()`: the same fields,
  /// so its words, its badge, and its action read as a title's do.
  public var asTitle: Availability {
    Availability(
      state: state, action: action, progress: progress, etaSeconds: etaSeconds, releaseDate: releaseDate,
      stillLooking: stillLooking, reason: reason.map { .init(kind: $0.kind, code: $0.code, note: $0.note) },
      askedBySelf: askedBySelf, following: following, requestId: requestId,
      others: .init(count: others.count, names: others.names),
      limit: limit.map { .init(left: $0.left, resetsAt: $0.resetsAt) }, libraryTitleId: libraryTitleId,
      disabledReason: disabledReason)
  }

  /// What the server says of a season it lacks, as a title's `stateWord`.
  public func stateWord(today: String, percent: Bool = true) -> RequestStateWord? {
    asTitle.stateWord(today: today, percent: percent)
  }

  /// The badge over a missing season's poster, as a title's.
  public var badge: RequestBadge? { asTitle.badge }

  /// The season can be asked for: the server offers to ask, or for an admin, to add.
  public var asks: Bool { asTitle.asks }
}

/// How many more episodes of a partly-here season have aired, for its
/// "Request the rest" card.
public func requestRestCount(_ season: CatalogSeason) -> Int {
  max(0, season.availability.episodesAired - season.availability.episodesHere)
}
