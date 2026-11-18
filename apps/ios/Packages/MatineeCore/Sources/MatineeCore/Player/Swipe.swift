import Foundation

/*
 * Swipe.kt: the arithmetic of swipes on the video, apart from the view so
 * the tests cover it. The numbers are Android's, which are Findroid's, so
 * a swipe goes as far on every phone.
 *
 * Android's brightness curve (`brightnessOfLevel`) isn't ported: a
 * window's brightness there is the backlight's power, while iOS's
 * `UIScreen.brightness` already moves the way Control Center's slider
 * does, so a swipe's level is the brightness itself.
 */

/// The part of the video's height a swipe crosses to go from nothing to full.
public let SWIPE_FULL_RANGE = 0.66

/// Seconds a sideways swipe moves the video for each point the finger travels.
public let SWIPE_SECONDS_PER_POINT = 0.25

/// How fast the video plays while a finger holds it.
public let HOLD_SPEED: Float = 2

/// A brightness or volume, from 0 to 1, that started at `start` after the
/// finger moved `dragY` points down a video `height` points high. Up raises it.
public func swipeLevel(start: Double, dragY: Double, height: Double) -> Double {
  let from = start.isNaN ? 0 : min(1, max(0, start))
  guard height > 0, !dragY.isNaN else { return from }
  return min(1, max(0, from - dragY / (height * SWIPE_FULL_RANGE)))
}

/// Where a sideways swipe of `dragX` points lands from `from` seconds, kept within the video.
public func swipeSeek(from: Double, dragX: Double, duration: Double) -> Double {
  guard !dragX.isNaN else { return seekClamp(from, duration: duration) }
  return seekClamp(from + dragX * SWIPE_SECONDS_PER_POINT, duration: duration)
}
