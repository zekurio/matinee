import Testing

@testable import MatineeCore

/// A genre's or a studio's kind chips, which Android always shows.
@Suite struct BrowseKindsTests {
  @Test func allThreeAlwaysShow() {
    #expect(browseKinds(nil).map(\.kind) == [nil, TitleKind.movie, TitleKind.show])
    #expect(browseKinds(nil).map(\.count) == [nil, nil, nil])
    // One kind only still offers the other, as Android's chips do.
    let movies = browseKinds(.init(movie: 3, show: 0))
    #expect(movies.map(\.kind) == [nil, TitleKind.movie, TitleKind.show])
    #expect(movies.map(\.count) == [3, 3, 0])
    #expect(browseKinds(.init(movie: 3, show: 2)).map(\.count) == [5, 3, 2])
  }
}
