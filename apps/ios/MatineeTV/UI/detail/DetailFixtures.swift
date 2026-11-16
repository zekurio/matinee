#if DEBUG
  import Foundation

  /*
   * The detail pages on the dev server, which has no metadata provider:
   * the iPhone's fixtures, shared by name. `-title.fixture YES` fills in a
   * title's overview, genres, credits, ratings, trailer, and logo, and a
   * show's episodes' overviews and air dates (Matinee/UI/title/
   * TitleData.swift), and here adds a related row of the server's other
   * titles; `-dev.browseFixtures YES` makes the people those credits open
   * (Matinee/UI/browse/BrowseFixtures.swift). Debug builds only.
   */
  enum DetailFixtures {
    /// A related row of the server's other titles, since the dev server matches nothing.
    static var related: Bool { TitleFixture.on }
  }
#endif
