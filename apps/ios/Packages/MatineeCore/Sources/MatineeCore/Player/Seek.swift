import Foundation
public func seekable(_ duration: Double) -> Bool { duration.isFinite && duration > 0 }
public func seekClamp(_ seconds: Double, duration: Double) -> Double { seekable(duration) && !seconds.isNaN ? min(duration, max(0, seconds)) : 0 }
public func seekFraction(_ seconds: Double, duration: Double) -> Double { seekable(duration) ? seekClamp(seconds, duration: duration) / duration : 0 }
public func seekAt(x: Double, width: Double, duration: Double) -> Double { seekable(duration) && width > 0 && !x.isNaN ? min(1, max(0, x / width)) * duration : 0 }
public func seekSteps(duration: Double, step: Double) -> Int {
  guard seekable(duration), step.isFinite, step > 0 else { return 0 }
  let count = ceil(duration / step)
  return count >= Double(Int32.max) ? Int(Int32.max) - 1 : max(0, Int(count) - 1)
}
public func seekStepped(from: Double, direction: Int, step: Double, duration: Double) -> Double {
  seekClamp(from + (direction == 0 || !step.isFinite || step <= 0 ? 0 : direction < 0 ? -step : step), duration: duration)
}
