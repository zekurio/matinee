import Foundation

/*
 * Where a page of rows is scrolled to, held by the row at its top rather
 * than by points. When what's above that row changes height, as an iPad's
 * Home trades the web's banner for the phone's cards when its window
 * narrows, the same number of points from the top lands somewhere else;
 * the row and how far into it the page was land it back where it was.
 */

/// The row at the top of a scrolled page, and how far into it the page is.
public struct ScrollAnchor: Equatable, Sendable {
  /// The row's id.
  public let row: String
  /// How far the top of what shows is below the row's top; less than 0
  /// with the row further down.
  public let into: Double

  public init(row: String, into: Double) {
    self.row = row
    self.into = into
  }

  /// The row at the top of a page scrolled `offset` points from rest, given
  /// the top of each row laid out that keeps its place, from the top of the
  /// page's content: the last one starting at or above the offset, or with
  /// the top of what shows above them all, as in what changes height above
  /// them, the first below it, which `into` then says how far down it is.
  /// Nil at rest, where the page stays at its top whatever changes above,
  /// and with no rows.
  public init?(offset: Double, tops: [String: Double]) {
    guard offset > 0 else { return nil }
    let order: (Dictionary<String, Double>.Element, Dictionary<String, Double>.Element) -> Bool = {
      ($0.value, $0.key) < ($1.value, $1.key)
    }
    guard let row = tops.filter({ $0.value <= offset }).max(by: order) ?? tops.min(by: order) else { return nil }
    self.init(row: row.key, into: offset - row.value)
  }

  /// The offset that puts the page back as it was, now that the row's top
  /// is `top`: as far into the row, and never above the page's top.
  public func offset(top: Double) -> Double {
    max(top + into, 0)
  }
}
