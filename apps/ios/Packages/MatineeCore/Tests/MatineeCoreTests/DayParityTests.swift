import Testing
@testable import MatineeCore

struct DayParityTests {
  @Test func invalidDaysDoNotRollIntoNextMonth() {
    #expect(parseDay("2025-02-29") == nil)
    #expect(parseDay("2024-02-30") == nil)
    #expect(parseDay("2024-13-01") == nil)
    #expect(parseDay("2024-2-01") == nil)
    #expect(parseDay("2024-02-29") != nil)
  }
}
