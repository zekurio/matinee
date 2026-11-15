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
