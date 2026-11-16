import Foundation
import MatineeCore

/*
 * Real pictures for Home's featured carousel, for judging white text on
 * them, which the dev server's test patterns can't tell. Debug builds
 * only; release builds have none of it, and no picture is in the
 * repository: they're read from a folder on the Mac.
 *
 * - `-dev.featuredArt PATH`: a folder of pictures (jpg, png, webp), one per
 *   card in name order. A file's name, less a leading number, is the
 *   card's name, `_` standing for `:`, with genres in brackets after it:
 *   `1 The Hunger Games_ Catching Fire [Action, Adventure].jpg`. With more
 *   pictures than featured titles, the titles repeat under the new names.
 *   Pass `-dev.art YES` too on a server that features nothing.
 * - `-dev.featuredCount 2`: only the first that many cards.
 * - `-dev.featuredFallback "2:none,3:poster"`: the second card with no
 *   picture at all, the third with its picture as the title's poster only.
 * - `-dev.featuredStop 1.5`: opens resting at that card, the first being 0,
 *   or part of the way to the next, as a swipe leaves it; and holds there.
 * - `-dev.featuredOpen actions`: the first card's long press, once it shows.
 */
enum HomeCarouselDevData {
  enum StandIn {
    case backdrop(ImageSource)
    case poster(ImageSource)
    case none
  }

  #if DEBUG
    private struct Picked {
      let url: URL
      let name: String
      let genres: [String]
    }

    private static let defaults = UserDefaults.standard

    private static let pictures: [Picked] = {
      guard let folder = defaults.string(forKey: "dev.featuredArt") else { return [] }
      let files = (try? FileManager.default.contentsOfDirectory(atPath: folder)) ?? []
      return files.sorted { $0.localizedStandardCompare($1) == .orderedAscending }
        .filter { ["jpg", "jpeg", "png", "webp"].contains(($0 as NSString).pathExtension.lowercased()) }
        .map { file in
          var stem = (file as NSString).deletingPathExtension
          var genres: [String] = []
          if let open = stem.firstIndex(of: "["), let close = stem.lastIndex(of: "]"), open < close {
            genres = stem[stem.index(after: open)..<close].split(separator: ",")
              .map { $0.trimmingCharacters(in: .whitespaces) }
            stem = String(stem[..<open])
          }
          let name = stem.replacingOccurrences(of: #"^\d+\s+"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: "_", with: ":").trimmingCharacters(in: .whitespaces)
          return Picked(url: URL(fileURLWithPath: folder).appending(path: file), name: name, genres: genres)
        }
    }()

    private static let fallbacks: [Int: String] = {
      let pairs = (defaults.string(forKey: "dev.featuredFallback") ?? "").split(separator: ",").compactMap {
        pair -> (Int, String)? in
        let parts = pair.split(separator: ":")
        guard parts.count == 2, let card = Int(parts[0]) else { return nil }
        return (card - 1, String(parts[1]))
      }
      return Dictionary(pairs) { first, _ in first }
    }()
  #endif

  /// The featured titles with the folder's names and genres, as many as it
  /// has pictures, cut to `-dev.featuredCount`.
  static func slides(_ slides: [FeaturedTitle]) -> [FeaturedTitle] {
    #if DEBUG
      var result = slides
      if !pictures.isEmpty, !slides.isEmpty {
        result = pictures.enumerated().map { index, picked in
          var slide = slides[index % slides.count]
          slide.title.name = picked.name
          if !picked.genres.isEmpty { slide.title.genres = picked.genres }
          return slide
        }
      }
      if defaults.object(forKey: "dev.featuredCount") != nil {
        result = Array(result.prefix(max(defaults.integer(forKey: "dev.featuredCount"), 0)))
      }
      return result
    #else
      return slides
    #endif
  }

  /// The picture card `index` shows instead of the server's, if any.
  static func art(_ index: Int) -> StandIn? {
    #if DEBUG
      let picture = pictures.isEmpty ? nil : ImageSource(url: pictures[index % pictures.count].url)
      switch fallbacks[index] {
      case "none": return StandIn.none
      case "poster": return picture.map { .poster($0) }
      default: return picture.map { .backdrop($0) }
      }
    #else
      return nil
    #endif
  }

  /// How far past `startStop`'s card the row is drawn, in cards: its
  /// fraction, as a swipe leaves it partway. The row's snapping would
  /// undo a scroll there, so the cards are drawn moved instead. 0 in a
  /// release build.
  static var swipe: Double {
    guard let start = startStop else { return 0 }
    return start - start.rounded(.down)
  }

  /// Whether the first card's actions open at launch, with `-dev.featuredOpen actions`.
  static var opensActions: Bool {
    #if DEBUG
      defaults.string(forKey: "dev.featuredOpen") == "actions"
    #else
      false
    #endif
  }

  /// Where the carousel opens, in cards, with `-dev.featuredStop`.
  static var startStop: Double? {
    #if DEBUG
      defaults.object(forKey: "dev.featuredStop") == nil ? nil : defaults.double(forKey: "dev.featuredStop")
    #else
      nil
    #endif
  }
}
