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
    func check(_ now: Int64, playing: Bool = true) -> Bool {
      watch.check(nowMs: now, playing: playing, shown: true)
    }
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

/// The web's seek bar under a finger, `touchDragValue` in player-controls.tsx.
struct SeekDragTests {
  // A two-hour film over a bar 614 points wide, 600 of travel: 12 s a point.
  let duration = 7200.0
  let width = 614.0

  @Test func thePressJumpsAndTheThumbRunsInsideTheEnds() {
    #expect(seekUnder(x: SEEK_THUMB / 2, width: width, duration: duration) == 0)
    #expect(seekUnder(x: width - SEEK_THUMB / 2, width: width, duration: duration) == duration)
    #expect(seekUnder(x: 307, width: width, duration: duration) == 3600)
    #expect(seekThumbX(0, width: width, duration: duration) == SEEK_THUMB / 2)
    #expect(seekThumbX(duration, width: width, duration: duration) == width - SEEK_THUMB / 2)
    #expect(seekThumbX(10, width: width, duration: 0) == SEEK_THUMB / 2)
  }

  @Test func aSlowDragMovesFinerThanTheFinger() {
    var drag = SeekDrag(x: 307, atMs: 0, value: 3600)
    // Ten points over a second, a creeping finger.
    for step in 1...10 { drag.move(to: 307 + Double(step), atMs: Double(step) * 100, width: width, duration: duration) }
    // Under the finger would be 120 s on; the drag moved a tenth of that.
    #expect(abs(drag.value - 3612) < 0.5)
  }

  @Test func aQuickDragKeepsUpWithTheFinger() {
    var drag = SeekDrag(x: 307, atMs: 0, value: 3600)
    for step in 1...10 { drag.move(to: 307 + Double(step) * 10, atMs: Double(step) * 10, width: width, duration: duration) }
    #expect(abs(drag.value - seekUnder(x: 407, width: width, duration: duration)) < 1)
  }

  @Test func pastTheEndsItGoesToTheEnd() {
    var drag = SeekDrag(x: 600, atMs: 0, value: 7000)
    drag.move(to: 700, atMs: 1000, width: width, duration: duration)
    #expect(drag.value == duration)
    drag.move(to: -20, atMs: 2000, width: width, duration: duration)
    #expect(drag.value == 0)
  }

  @Test func theThumbNeverRunsAgainstTheFinger() {
    // The thumb ahead of a finger moving right doesn't come back to it.
    var drag = SeekDrag(x: 100, atMs: 0, value: 5000)
    let before = drag.value
    drag.move(to: 140, atMs: 40, width: width, duration: duration)
    #expect(drag.value > before)
  }

  @Test func withoutALengthItHoldsStill() {
    var drag = SeekDrag(x: 10, atMs: 0, value: 0)
    #expect(drag.move(to: 50, atMs: 10, width: width, duration: 0) == 0)
    #expect(drag.move(to: 80, atMs: 20, width: width, duration: .nan) == 0)
  }
}
