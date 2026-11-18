import Testing

@testable import MatineeCore

struct SkipFlashTests {
  @Test func aPressFlashesItsStep() throws {
    let back = try #require(SkipFlash.after(nil, by: -10, atMs: 1000))
    #expect(!back.forward)
    #expect(back.seconds == 10)
    let ahead = try #require(SkipFlash.after(nil, by: 30, atMs: 1000))
    #expect(ahead.forward)
    #expect(ahead.seconds == 30)
    #expect(SkipFlash.after(nil, by: 0, atMs: 1000) == nil)
    #expect(SkipFlash.after(nil, by: .nan, atMs: 1000) == nil)
  }

  @Test func pressesInARowAddUp() throws {
    var flash = try #require(SkipFlash.after(nil, by: 10, atMs: 0))
    flash = try #require(SkipFlash.after(flash, by: 10, atMs: 400))
    flash = try #require(SkipFlash.after(flash, by: 10, atMs: 1000))
    // Each press starts the time again, so the third still adds.
    #expect(flash.seconds == 30)
    #expect(flash.id == 3)
    #expect(flash.endsAtMs == 1000 + Double(SKIP_FLASH_MS))
  }

  @Test func theOtherWayStartsAgain() throws {
    let ahead = try #require(SkipFlash.after(nil, by: 30, atMs: 0))
    let back = try #require(SkipFlash.after(ahead, by: -10, atMs: 100))
    #expect(!back.forward)
    #expect(back.seconds == 10)
    #expect(back.id == ahead.id + 1)
  }

  @Test func itEndsAFlashsLengthAfterTheLastPress() throws {
    let flash = try #require(SkipFlash.after(nil, by: -10, atMs: 5000))
    #expect(flash.shows(atMs: 5000))
    #expect(flash.shows(atMs: 5000 + Double(SKIP_FLASH_MS) - 1))
    #expect(!flash.shows(atMs: 5000 + Double(SKIP_FLASH_MS)))
    // A press after it went starts again.
    let next = try #require(SkipFlash.after(flash, by: -10, atMs: 5000 + Double(SKIP_FLASH_MS)))
    #expect(next.seconds == 10)
  }
}
