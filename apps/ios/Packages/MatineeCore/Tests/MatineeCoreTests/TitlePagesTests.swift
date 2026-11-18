import Testing
@testable import MatineeCore

struct TitlePagesTests {
  @Test func resumeRequiresUnfinishedPositiveProgress() {
    var item = Answers.item("a")
    #expect(!isResuming(nil))
    #expect(!isResuming(item))
    item.progress = WatchState(positionSeconds: 12, completed: false, updatedAt: "")
    #expect(isResuming(item))
    item.progress?.completed = true
    #expect(!isResuming(item))
    item.progress?.completed = false
    item.progress?.positionSeconds = 0
    #expect(!isResuming(item))
  }

  @Test func railStartsAtNextOrAtZero() {
    let items = [Answers.item("a"), Answers.item("b")]
    #expect(episodeRailStart(items, next: items[1]) == 1)
    #expect(episodeRailStart(items, next: nil) == 0)
    #expect(episodeRailStart([], next: items[0]) == 0)
    #expect(episodeRailStart(items, next: Answers.item("missing")) == 0)
  }
}
