import Foundation

public func seekable(_ duration: Double) -> Bool { duration.isFinite && duration > 0 }
public func seekClamp(_ seconds: Double, duration: Double) -> Double {
  seekable(duration) && !seconds.isNaN ? min(duration, max(0, seconds)) : 0
}
public func seekFraction(_ seconds: Double, duration: Double) -> Double {
  seekable(duration) ? seekClamp(seconds, duration: duration) / duration : 0
}
public func seekAt(x: Double, width: Double, duration: Double) -> Double {
  seekable(duration) && width > 0 && !x.isNaN ? min(1, max(0, x / width)) * duration : 0
}
public func seekSteps(duration: Double, step: Double) -> Int {
  guard seekable(duration), step.isFinite, step > 0 else { return 0 }
  let count = ceil(duration / step)
  return count >= Double(Int32.max) ? Int(Int32.max) - 1 : max(0, Int(count) - 1)
}
public func seekStepped(from: Double, direction: Int, step: Double, duration: Double) -> Double {
  seekClamp(
    from + (direction == 0 || !step.isFinite || step <= 0 ? 0 : direction < 0 ? -step : step),
    duration: duration)
}

/// The times either side of the seek bar, as Android's players and the
/// web's show them: the time played at the start, the file's full length
/// at the end. A length the player doesn't know, or a live one, reads
/// 0:00, as `formatClock` and the web's `formatTime` write it, so the bar
/// keeps its shape. `widest` is the longest the length lets either show,
/// every digit a 0, which tabular figures make as wide as any, so neither
/// time nor the track between them moves as they count: Android's
/// `longestClock`.
public struct SeekClocks: Equatable, Sendable {
  public let elapsed: String
  public let length: String
  public let widest: String

  public init(position: Double, duration: Double) {
    elapsed = formatClock(position)
    length = formatClock(duration)
    widest = length.replacing(/[0-9]/, with: "0")
  }
}

/*
 * The web's seek bar under a finger (player-controls.tsx, `touchDragValue`):
 * a drag moves the time by how far the finger travels rather than to
 * where it is, so a slow drag moves a little at a time, and the thumb
 * catches up with a quick finger. A press still jumps to where it lands.
 * Speeds are in points per millisecond, the web's pixels.
 */

/// The thumb's width, the web's `size-3.5`. The thumb's centre runs half of it in from each end.
public let SEEK_THUMB: Double = 14

// At 0.04 (a finger creeping) a point moves a tenth as far as at 0.5, a
// normal drag, which moves it the full way.
let FINE_SPEED = 0.04
let FULL_SPEED = 0.5
let FINEST_GAIN = 0.1
// No finer than this many seconds a point, so a short video doesn't crawl.
let FINEST_PER_POINT = 0.25
// From 0.25 a thumb behind the finger catches up to it, quicker the faster
// it moves, up to 35% of the gap per move.
let CATCH_UP_SPEED = 0.25
let CATCH_UP_FULL_SPEED = 1.0
let CATCH_UP_RATE = 0.35

/// Where `value` sits between `from` and `to`, from 0 to 1.
func ramp(_ value: Double, _ from: Double, _ to: Double) -> Double {
  max(0, min(1, (value - from) / (to - from)))
}

/// The time under a point `x` along a bar `width` wide whose thumb runs half
/// a thumb in from each end, as the web's edge-aligned thumb.
public func seekUnder(x: Double, width: Double, duration: Double) -> Double {
  let travel = max(1, width - SEEK_THUMB)
  return seekAt(x: x - SEEK_THUMB / 2, width: travel, duration: duration)
}

/// Where the thumb's centre sits along a bar `width` wide for `seconds`.
public func seekThumbX(_ seconds: Double, width: Double, duration: Double) -> Double {
  SEEK_THUMB / 2 + max(0, width - SEEK_THUMB) * seekFraction(seconds, duration: duration)
}

/// A finger dragging the seek bar's thumb, from where it pressed.
public struct SeekDrag: Sendable {
  private var x: Double
  private var at: Double
  /// Smoothed speed, in points per millisecond.
  private var speed = 0.0
  /// Where the drag has the time.
  public private(set) var value: Double

  /// A press at `x`, `atMs`, which jumps to `value`, the time under it.
  public init(x: Double, atMs: Double, value: Double) {
    self.x = x
    at = atMs
    self.value = value
  }

  /// The finger moved to `x` along a bar `width` wide, `atMs`. The thumb
  /// trails a slow finger and catches up with a quick one, and a finger past
  /// either end of the bar takes it to that end. Returns the time it's at.
  @discardableResult
  public mutating func move(to x: Double, atMs: Double, width: Double, duration: Double) -> Double {
    let dx = x - self.x
    guard dx != 0, seekable(duration), !x.isNaN else { return value }
    let sample = abs(dx) / max(1, atMs - at)
    speed = speed * 0.6 + sample * 0.4
    self.x = x
    at = atMs
    let travel = max(1, width - SEEK_THUMB)
    let perPoint = duration / travel
    let finest = min(1, max(FINEST_GAIN, FINEST_PER_POINT / perPoint))
    let gain = finest + (1 - finest) * ramp(speed, FINE_SPEED, FULL_SPEED)
    var next = value + dx * perPoint * gain
    let under = seekUnder(x: x, width: width, duration: duration)
    // Only toward the finger, so the thumb never runs against it.
    if (under - next) * (dx > 0 ? 1 : -1) > 0 {
      let outside = x < 0 || x > width
      let rate = outside ? 1 : CATCH_UP_RATE * ramp(speed, CATCH_UP_SPEED, CATCH_UP_FULL_SPEED)
      next += (under - next) * rate
    }
    value = max(0, min(duration, next))
    return value
  }
}
