import Foundation

/*
 * The rules the featured carousel at the top of Home (the app's
 * home/HomeCarousel.swift) lays itself out and moves by: how many cards
 * share the row, where its auto-advance goes next, and the line over a
 * card's name. After Findroid's HomeCarousel.kt.
 */

/// The featured carousel's layout and paging.
public enum FeaturedCarousel {
  /// How long a card stays before the carousel moves on, as Findroid's.
  public static let advance: Duration = .seconds(5)

  /// How many cards a window `width` points wide shows side by side: one on
  /// a phone, two from 600, three from 840, as Findroid's pager.
  public static func columns(width: Double) -> Int {
    width >= 840 ? 3 : width >= 600 ? 2 : 1
  }

  /// How many cards share the row for `count` titles: never more than
  /// there are, so one or two titles on a wide window fill it rather than
  /// leave a hole at the end.
  public static func perRow(width: Double, count: Int) -> Int {
    max(1, min(columns(width: width), count))
  }

  /// How many places the row can come to rest at: one for each card that
  /// can lead it. Six titles three to a row rest at four.
  public static func stops(count: Int, perRow: Int) -> Int {
    max(count - max(perRow, 1) + 1, 1)
  }

  /// The place after `stop`, back to the first after the last.
  public static func next(after stop: Int, stops: Int) -> Int {
    guard stops > 0 else { return 0 }
    return (stop + 1) % stops
  }

  /// The place before `stop`, round to the last before the first.
  public static func previous(before stop: Int, stops: Int) -> Int {
    guard stops > 0 else { return 0 }
    return (stop - 1 + stops) % stops
  }

  /// The place a row scrolled `offset` points along rests nearest, each
  /// card `stride` points from the last.
  public static func stop(offset: Double, stride: Double, stops: Int) -> Int {
    guard stride > 0, offset.isFinite else { return 0 }
    return min(max(Int((offset / stride).rounded()), 0), max(stops - 1, 0))
  }
}

extension FeaturedTitle {
  /// The line over a card's name: up to three of the title's genres, in
  /// plain words the card cuts short at its end when they don't fit; nil
  /// with none. The card says nothing else but the name.
  public func cardLine(separator: String = " · ") -> String? {
    let genres = title.genres.prefix(3)
    return genres.isEmpty ? nil : genres.joined(separator: separator)
  }
}
