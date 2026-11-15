import Foundation

public enum RequestGlyph: Sendable, Equatable { case clock, ring, calendar, slash }
public struct RequestBadge: Sendable, Equatable {
  public let glyph: RequestGlyph
  public let progress: Double?
  public init(_ glyph: RequestGlyph, progress: Double? = nil) { self.glyph = glyph; self.progress = progress }
}
public enum RequestCardLine: Sendable, Equatable {
  case state(RequestStateWord)
  case detail(String)
  case yearKind(Int?, String)
}
extension Availability {
  public var badge: RequestBadge? {
    switch state {
    case "asked": return RequestBadge(.clock)
    case "coming": return RequestBadge(.ring, progress: progress)
    case "release": return RequestBadge(.calendar)
    case "unavailable": return RequestBadge(.slash)
    default: return nil
    }
  }
  public func cardLine(year: Int?, ref: CatalogRef, today: String, detail: String? = nil) -> RequestCardLine {
    if let word = stateWord(today: today, percent: true) { return .state(word) }
    if let detail { return .detail(detail) }
    return .yearKind(year, ref.kind)
  }
}
