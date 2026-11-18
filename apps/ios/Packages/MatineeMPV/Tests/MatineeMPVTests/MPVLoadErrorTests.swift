import MatineeCore
import Testing
@testable import MatineeMPV

struct MPVLoadErrorTests {
  @Test func readinessDeadlineDoesNotClaimServerIsOffline() {
    // The deadline also covers local decoder and render setup. A URL timeout
    // here makes PlayerController stop instead of asking for another source.
    let error = MPVLoadError.readinessTimedOut
    #expect(!serverOutOfReach(error, logged: nil))
    #expect(error.errorDescription != nil)
  }
}
