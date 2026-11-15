import Foundation
import Observation

/*
 * Recommendations.kt's logic: Home's recommendation rows, of titles on the
 * server the viewer hasn't watched, as the server works them out ("Recommended
 * for you", then a row or two of what's like something they watched), what
 * each row and title is called, and "Not interested", which takes a title
 * off the rows at once and puts it back if the server refuses. The words are
 * the app's; this only says which.
 */

extension CatalogRef {
  /// One string per title at a provider, as Android's `CatalogRef.key`.
  public var key: String { "\(kind):\(provider):\(providerId)" }
}

/// What a recommendation row is called, before it's in words.
public enum RecommendationRailName: Equatable, Sendable {
  /// "Recommended for you".
  case forYou
  /// "Because you watched Dune", by the title it starts from.
  case becauseWatched(String)
}

/// Why a title is recommended, before it's in words.
public enum RecommendationWhy: Equatable, Sendable {
  /// "Because you watched Dune".
  case watched(String)
  /// "With Zendaya".
  case person(String)
  /// "Picked from what you watch".
  case taste
}

extension HomeRecommendationRail {
  /// Its name: the seed's title for a "Because you watched" row, else "for you".
  public var name: RecommendationRailName {
    id == RecommendationRailId.becauseWatched ? .becauseWatched(seed?.name ?? "") : .forYou
  }

  /// Tells rows apart, as there can be several "Because you watched".
  public var key: String { seed.map { "\(id):\($0.ref.key)" } ?? id }

  /// Its titles without those marked "Not interested" since the answer came.
  public func visible(hiding hidden: Set<String>) -> [RecommendedTitle] {
    items.filter { !hidden.contains($0.ref.key) }
  }
}

extension RecommendedTitle {
  /// Why it's recommended; a reason this app doesn't know reads as taste.
  public var why: RecommendationWhy {
    switch reason?.kind {
    case "watched": .watched(reason?.name ?? "")
    case "person": .person(reason?.name ?? "")
    default: .taste
    }
  }
}

extension HomeRecommendations {
  /// The rows Home shows: those with a title left once `hidden` is taken out.
  public func shownRails(hiding hidden: Set<String>) -> [HomeRecommendationRail] {
    rails.filter { !$0.visible(hiding: hidden).isEmpty }
  }
}

/// How long Home's recommendations stand before Home fetches them again on
/// its return: the server works them out again only now and then.
public let RECOMMENDATIONS_MAX_AGE: Duration = .seconds(10 * 60)

/// The titles marked "Not interested" in this sign-in, by `CatalogRef.key`,
/// so the rows leave them out at once; the server's next answer does too.
/// Android keeps the same in its `Actions.hidden`.
@MainActor @Observable
public final class HiddenRecommendations {
  public private(set) var keys: Set<String> = []

  public init() {}

  /// Leaves `ref` out at once and asks the server with `send`; when that
  /// fails, `ref` shows again and the error goes on to the caller.
  public func dismiss(_ ref: CatalogRef, send: @Sendable () async throws -> Void) async throws {
    let key = ref.key
    let added = keys.insert(key).inserted
    do {
      try await send()
    } catch {
      if added { keys.remove(key) }
      throw error
    }
  }
}
