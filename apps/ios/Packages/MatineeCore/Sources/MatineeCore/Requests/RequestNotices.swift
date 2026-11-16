import Foundation

/// Notices.kt. Persist per server/account, not globally across sessions.
public struct RequestNoticeSettings: Codable, Sendable, Equatable {
  public var background: Bool
  public var askedPermission: Bool
  public init(background: Bool = true, askedPermission: Bool = false) {
    self.background = background
    self.askedPermission = askedPermission
  }
}
public struct RequestNoticeChanges: Sendable {
  public let show: [Notification]
  /// Includes stale unread items: Android marks those read without showing.
  public let markRead: [String]
}
/// Call after fetching every page of notifications. After presenting the
/// returned notices, markRead on the server and persist their IDs locally.
/// Do not commit seen IDs before presentation succeeds.
public func newRequestNotices(
  _ items: [Notification], seen: Set<String>, now: Date = Date()
) -> RequestNoticeChanges {
  let unread = items.filter { $0.readAt == nil && !seen.contains($0.id) }
  let fresh = unread.filter {
    guard let date = requestInstant($0.createdAt), now.timeIntervalSince(date) < 3 * 86_400 else { return false }
    switch $0.kind {
    case "waiting", "needsAttention": return true
    case "ready", "unavailable": return $0.title != nil
    default: return false
    }
  }
  return RequestNoticeChanges(show: fresh, markRead: unread.map(\.id))
}
public enum RequestNoticeTarget: Sendable, Equatable {
  case title(String), catalog(CatalogRef), queue(String)
}
public func requestNoticeTarget(_ item: Notification) -> RequestNoticeTarget? {
  switch item.kind {
  case "waiting": return .queue("waiting")
  case "needsAttention": return .queue("needsAttention")
  default:
    guard let title = item.title else { return nil }
    if let id = title.availability.libraryTitleId { return .title(id) }
    return .catalog(title.ref)
  }
}

/// What a notice says, as Android's `noticeText`, in values for the app's words.
public enum RequestNoticeWords: Sendable, Equatable {
  case waiting(Int)
  case attention(Int)
  /// A title, or one of its seasons, is ready.
  case ready(name: String, season: Int?)
  /// A title isn't coming, with the server's reason when it gave one.
  case unavailable(name: String, reason: Availability.Reason?)
}

public func requestNoticeWords(_ item: Notification) -> RequestNoticeWords? {
  switch item.kind {
  case "waiting": return .waiting(item.count)
  case "needsAttention": return .attention(item.count)
  case "ready": return item.title.map { .ready(name: $0.name, season: item.season) }
  case "unavailable": return item.title.map { .unavailable(name: $0.name, reason: $0.availability.reason) }
  default: return nil
  }
}

/// Where a notice's tap leads, kept in a delivered notification: the
/// server and account it came from, and its target, as plain strings.
public struct RequestNoticeLink: Codable, Sendable, Equatable {
  public let server: String
  public let account: String
  public let target: String

  public init(server: String, account: String, target: RequestNoticeTarget) {
    self.server = server
    self.account = account
    switch target {
    case .title(let id): self.target = "title/\(id)"
    case .catalog(let ref): self.target = "catalog/\(ref.kind)/\(ref.provider)/\(ref.providerId)"
    case .queue(let list): self.target = "requests/\(list)"
    }
  }

  public init?(userInfo: [AnyHashable: Any]) {
    guard let server = userInfo["server"] as? String, let account = userInfo["account"] as? String,
      let target = userInfo["target"] as? String
    else { return nil }
    self.server = server
    self.account = account
    self.target = target
  }

  public var userInfo: [String: String] { ["server": server, "account": account, "target": target] }

  /// The target back from its string.
  public var parsed: RequestNoticeTarget? {
    let parts = target.split(separator: "/").map(String.init)
    switch (parts.first, parts.count) {
    case ("title", 2): return .title(parts[1])
    case ("catalog", 4): return .catalog(CatalogRef(kind: parts[1], provider: parts[2], providerId: parts[3]))
    case ("requests", 2): return .queue(parts[1])
    default: return nil
    }
  }
}

/// What the app keeps about notices on this device, per server and account,
/// as Android's `RequestNotices`: the settings, and the notices shown
/// already, so a check doesn't show one twice before the server has it read.
public struct RequestNoticeStore: Sendable {
  public let server: String
  public let account: String
  private let defaults: @Sendable () -> UserDefaults

  public init(server: String, account: String, defaults: @escaping @Sendable () -> UserDefaults = { .standard }) {
    self.server = server
    self.account = account
    self.defaults = defaults
  }

  private var key: String { "requests.notices.\(server)\n\(account)" }

  public var settings: RequestNoticeSettings {
    get {
      guard let data = defaults().data(forKey: key + ".settings"),
        let value = try? JSONDecoder().decode(RequestNoticeSettings.self, from: data)
      else { return RequestNoticeSettings() }
      return value
    }
    nonmutating set { defaults().set(try? JSONEncoder().encode(newValue), forKey: key + ".settings") }
  }

  /// The notices shown, the newest few hundred, which is more than the
  /// three days a notice stays fresh can hold.
  public var seen: Set<String> {
    Set(defaults().stringArray(forKey: key + ".seen") ?? [])
  }

  public func markSeen(_ ids: [String]) {
    guard !ids.isEmpty else { return }
    let before = defaults().stringArray(forKey: key + ".seen") ?? []
    let kept = Array((before.filter { !ids.contains($0) } + ids).suffix(400))
    defaults().set(kept, forKey: key + ".seen")
  }

  /// When the last check ran, so coming back to the app often doesn't ask each time.
  public var lastCheck: Date? {
    get { defaults().object(forKey: key + ".lastCheck") as? Date }
    nonmutating set { defaults().set(newValue, forKey: key + ".lastCheck") }
  }
}

/// One look for new notices, as Android's worker does it: the newest page,
/// the fresh unseen ones handed to `present`, which says which it showed;
/// those are kept as seen, and every unread one is marked read on the
/// server, stale ones too. Nothing is marked when presenting failed
/// outright, so the next check tries again. Returns what was shown.
@discardableResult
public func checkRequestNotices(
  store: RequestNoticeStore, now: Date = Date(), most: Int = 5,
  fetch: @Sendable () async throws -> [Notification],
  markRead: @Sendable ([String]) async throws -> Void,
  present: @Sendable ([Notification]) async -> [Notification]?
) async throws -> [Notification] {
  let items = try await fetch()
  let changes = newRequestNotices(items, seen: store.seen, now: now)
  store.lastCheck = now
  guard !changes.markRead.isEmpty else { return [] }
  let fresh = Array(changes.show.prefix(most))
  var shown: [Notification] = []
  if !fresh.isEmpty {
    guard let presented = await present(fresh) else { return [] }
    shown = presented
    store.markSeen(presented.map(\.id))
  }
  try await markRead(changes.markRead)
  store.markSeen(changes.markRead)
  return shown
}
