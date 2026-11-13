import Testing

@testable import MatineeCore

struct SeekTests {
  @Test func unknownLengthCannotSeek() {
    for value in [0, -5, Double.nan, .infinity] { #expect(!seekable(value)) }
    #expect(seekable(0.5))
    #expect(seekClamp(42, duration: 0) == 0)
    #expect(seekFraction(42, duration: 0) == 0)
    #expect(seekAt(x: 50, width: 100, duration: 0) == 0)
    #expect(seekSteps(duration: 0, step: 10) == 0)
  }
  @Test func clampKeepsWithinTheVideo() {
    #expect(seekClamp(-3, duration: 100) == 0)
    #expect(seekClamp(130, duration: 100) == 100)
    #expect(seekClamp(37.5, duration: 100) == 37.5)
    #expect(seekClamp(.nan, duration: 100) == 0)
  }
  @Test func fractionFollowsTheTime() {
    #expect(seekFraction(25, duration: 100) == 0.25)
    #expect(seekFraction(250, duration: 100) == 1)
    #expect(seekFraction(-1, duration: 100) == 0)
  }
  @Test func pointMapsToTime() {
    #expect(seekAt(x: 30, width: 100, duration: 100) == 30)
    #expect(seekAt(x: -20, width: 100, duration: 100) == 0)
    #expect(seekAt(x: 140, width: 100, duration: 100) == 100)
    #expect(seekAt(x: 10, width: 0, duration: 100) == 0)
  }
  @Test func stepsMoveAboutOneSkip() {
    let steps = seekSteps(duration: 3600, step: 10)
    #expect(steps == 359)
    #expect(3600 / Double(steps + 1) == 10)
    let odd = seekSteps(duration: 95, step: 10)
    #expect(95 / Double(odd + 1) <= 10)
    #expect(seekSteps(duration: 4, step: 10) == 0)
    #expect(seekSteps(duration: 100, step: 0) == 0)
    #expect(seekSteps(duration: 100, step: .nan) == 0)
  }
  @Test func keysStepAndStopAtTheEnds() {
    #expect(seekStepped(from: 30, direction: 1, step: 10, duration: 100) == 40)
    #expect(seekStepped(from: 30, direction: -1, step: 10, duration: 100) == 20)
    #expect(seekStepped(from: 95, direction: 1, step: 10, duration: 100) == 100)
    #expect(seekStepped(from: 5, direction: -1, step: 10, duration: 100) == 0)
    #expect(seekStepped(from: 30, direction: 0, step: 10, duration: 100) == 30)
    #expect(seekStepped(from: 30, direction: 1, step: 10, duration: 0) == 0)
  }
}

struct FreezeWatchTests {
  @Test func framesComingIsNoFreeze() {
    var watch = FreezeWatch()
    for time in stride(from: Int64(0), through: 20_000, by: 40) {
      watch.frame(atMs: time)
      let frozen = watch.check(nowMs: time, playing: true, shown: true)
      #expect(!frozen)
    }
  }
  @Test func playingOnWithoutFramesIsAFreeze() {
    var watch = FreezeWatch()
    func check(_ now: Int64) -> Bool { watch.check(nowMs: now, playing: true, shown: true) }
    watch.frame(atMs: 1000)
    #expect(!check(1000))
    #expect(!check(5999))
    #expect(check(6000))
  }
  @Test func pausedOrBufferingWaitsAgain() {
    var watch = FreezeWatch()
    func check(_ now: Int64, playing: Bool = true) -> Bool { watch.check(nowMs: now, playing: playing, shown: true) }
    watch.frame(atMs: 0)
    #expect(!check(4000))
    #expect(!check(60_000, playing: false))
    #expect(!check(61_000))
    #expect(!check(65_999))
    #expect(check(66_000))
  }
  @Test func offScreenOrWithoutVideoIsNeverAFreeze() {
    var watch = FreezeWatch()
    func check(_ now: Int64) -> Bool { watch.check(nowMs: now, playing: true, shown: false) }
    #expect(!check(0))
    #expect(!check(60_000))
  }
  @Test func aResetStartsTheWaitOver() {
    var watch = FreezeWatch()
    func check(_ now: Int64) -> Bool { watch.check(nowMs: now, playing: true, shown: true) }
    #expect(!check(0))
    #expect(check(5000))
    watch.reset()
    #expect(!check(5000))
    #expect(check(10_000))
  }
}
