import Foundation
import Observation

/// TitleFilters.kt's orders, without localized menu labels.
public struct TitleOrder: Hashable, Sendable {
  public let sort: String
  public let order: String
}

public let TITLE_ORDERS: [TitleOrder] = [
  TitleOrder(sort: TitleSort.name, order: SortOrder.asc),
  TitleOrder(sort: TitleSort.name, order: SortOrder.desc),
  TitleOrder(sort: TitleSort.recent, order: SortOrder.desc),
  TitleOrder(sort: TitleSort.recent, order: SortOrder.asc),
  TitleOrder(sort: TitleSort.year, order: SortOrder.desc),
  TitleOrder(sort: TitleSort.year, order: SortOrder.asc),
  TitleOrder(sort: TitleSort.score, order: SortOrder.desc),
  TitleOrder(sort: TitleSort.score, order: SortOrder.asc),
  TitleOrder(sort: TitleSort.runtime, order: SortOrder.desc),
  TitleOrder(sort: TitleSort.runtime, order: SortOrder.asc),
]

public let NO_TITLE_FILTERS = TitleFilters(genres: [], studios: [])

extension TitleFilters {
  /// Each selected genre and studio counts once; a range counts once.
  public var activeCount: Int {
    (genres?.count ?? 0) + (studios?.count ?? 0) + [
      yearFrom != nil || yearTo != nil,
      scoreMin != nil || scoreMax != nil,
      movieRating != nil,
      showRating != nil,
      language != nil,
      runtimeMin != nil || runtimeMax != nil,
      watched != nil,
    ].filter { $0 }.count
  }
}

/// Structured list state for the new browsing screens. LibraryFilters remains
/// available for the old screens until they are replaced.
@MainActor @Observable
public final class TitleListState {
  public var sort: String
  public var order: String
  public var filters = NO_TITLE_FILTERS
  public var query: String {
    get { search.query }
    set { search.query = newValue }
  }
  public var settled: String { search.settled }
  private let search: LibraryFilters

  public init(initialSort: String? = nil, debounce: Duration = LIBRARY_SEARCH_DEBOUNCE) {
    let start = initialSort.flatMap { TitleSort.knownValues.contains($0) ? $0 : nil } ?? TitleSort.name
    sort = start
    order = start == TitleSort.name ? SortOrder.asc : SortOrder.desc
    search = LibraryFilters(debounce: debounce)
  }

  public func clearQuery() { search.clearQuery() }
  public func settleNow() { search.settleNow() }

  /// JSON encodes the entire tuple to avoid delimiter collisions in queries.
  /// Encoding these generated models cannot fail: their fields are JSON values.
  /// Non-finite scores, if supplied programmatically, retain distinct identities.
  public var key: String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    encoder.nonConformingFloatEncodingStrategy = .convertToString(
      positiveInfinity: "Infinity", negativeInfinity: "-Infinity", nan: "NaN")
    return String(decoding: try! encoder.encode(Identity(
      sort: sort, order: order, query: settled, filters: filters)), as: UTF8.self)
  }

  private struct Identity: Encodable {
    let sort: String
    let order: String
    let query: String
    let filters: TitleFilters
  }
}
