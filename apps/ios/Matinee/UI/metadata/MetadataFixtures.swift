#if DEBUG
  import Foundation
  import MatineeCore

  /*
   * Debug builds' `-dev.metadataFixtures YES`: a configured provider, a
   * match for the title, search results, and image candidates, since the
   * dev server has no provider key and so answers none of these. Picking
   * the entry that is the match already pretends to succeed, to show what
   * follows; any other pick goes to the server, which turns it down with
   * its own words, as it would a stale one. Uploads, resets, and removals
   * are always the server's. Release builds don't compile this.
   */

  nonisolated enum MetadataFixtures {
    static var on: Bool { UserDefaults.standard.bool(forKey: "dev.metadataFixtures") }

    static let provider = MetadataProvider(
      id: "tmdb", name: "TMDB", description: "", episodes: true, configured: true, setup: nil)

    /// The id of the entry the fixtures say the title is matched to.
    static let currentId = "fixture-603"

    /// The title as if it were matched.
    static func matched(_ title: Title) -> Title {
      var title = title
      title.provider = provider.id
      title.providerId = currentId
      return title
    }

    /// What a search finds: nothing for a name with "nothing" in it.
    static func matches(_ query: IdentifyQuery) async throws -> [MetadataMatch] {
      try await Task.sleep(for: .milliseconds(600))
      if query.name.localizedCaseInsensitiveContains("nothing") { return [] }
      let name = query.name
      return [
        MetadataMatch(
          provider: "tmdb", id: currentId, name: name, year: query.year ?? 1999,
          overview:
            "Set in the 22nd century, The Matrix tells the story of a computer hacker who joins a group of underground insurgents fighting the vast and powerful computers who now rule the earth.",
          poster: nil),
        MetadataMatch(
          provider: "tmdb", id: "fixture-604", name: "\(name) Reloaded", year: 2003,
          overview:
            "Six months after the events depicted in The Matrix, Neo has proved to be a good omen for the free humans.",
          poster: nil),
        MetadataMatch(
          provider: "tmdb", id: "fixture-605", name: "\(name) Revolutions", year: 2003, overview: nil, poster: nil),
        MetadataMatch(
          provider: "tmdb", id: "fixture-14543",
          name: "\(name): The Making of a Long Documentary Whose Name Runs Onto a Second Line", year: nil,
          overview: "A look behind the scenes.", poster: nil),
      ]
    }

    /// Whether picking `id` pretends to succeed rather than asking the server.
    static func pretends(_ id: String) -> Bool { id == currentId }

    /// A provider's images for `slot`: a few in the library's language,
    /// more with all of them, none of the logos without.
    static func remoteImages(_ slot: String, allLanguages: Bool) async throws -> [RemoteImage] {
      try await Task.sleep(for: .milliseconds(500))
      let size: (Int, Int) =
        switch slot {
        case ImageSlot.poster: (2000, 3000)
        case ImageSlot.logo: (1500, 600)
        case ImageSlot.still: (1920, 1080)
        default: (3840, 2160)
        }
      if slot == ImageSlot.logo && !allLanguages { return [] }
      let languages: [String?] = allLanguages ? ["en", nil, "de", "fr", "ja", "en", "es"] : ["en", nil, "en", nil, "en"]
      return languages.enumerated().map { index, language in
        RemoteImage(
          id: "fixture-\(slot)-\(index)", preview: Artwork(id: "fixture-\(slot)-\(index)", placeholder: nil),
          width: index == 3 ? nil : size.0 - index * 100, height: index == 3 ? nil : size.1 - index * 150,
          language: language)
      }
    }
  }
#endif
