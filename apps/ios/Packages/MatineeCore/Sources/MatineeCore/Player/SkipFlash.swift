import Foundation

/*
 * The note a skip flashes over the picture, so a press says how far it
 * went: the web player's (video-player.tsx, `skip`, after #52), which
 * every skip shows, from the buttons, the keys, and the media keys alike,
 * for `FLASH_MS` after the last press. Android's players have none.
 *
 * The web says each press's own step; the Apple TV player, after Apple
 * TV's own, adds up presses in a row, and both Apple players do that
 * now: a press the same way while the note still shows adds its step,
 * and one the other way, or after the note went, starts again.
 */

/// How long a skip's note stays after the last press: the web's `FLASH_MS`.
public let SKIP_FLASH_MS = 700

/// What a skip's note says: which way, and how far the presses in a row went together.
public struct SkipFlash: Equatable, Sendable {
  /// Forward, or back.
  public let forward: Bool
  /// Seconds, added up over the presses in a row.
  public let seconds: Int
  /// When the last press came, in milliseconds on any steady clock.
  public let atMs: Double
  /// Counts presses, so each one starts the note's time again.
  public let id: Int

  public init(forward: Bool, seconds: Int, atMs: Double, id: Int) {
    self.forward = forward
    self.seconds = seconds
    self.atMs = atMs
    self.id = id
  }

  /// When the note goes, `SKIP_FLASH_MS` after the last press.
  public var endsAtMs: Double { atMs + Double(SKIP_FLASH_MS) }

  /// Whether the note still shows at `atMs`.
  public func shows(atMs now: Double) -> Bool { now < endsAtMs }

  /// The note after a skip `by` seconds, forward above 0 and back below,
  /// `atMs`, following `previous`: the same way while it still shows adds
  /// up; the other way, or once it went, starts again. Nil for no skip.
  public static func after(_ previous: SkipFlash?, by: Double, atMs: Double) -> SkipFlash? {
    guard by.isFinite, by != 0, atMs.isFinite else { return nil }
    let forward = by > 0
    let step = Int(abs(by).rounded())
    let id = (previous?.id ?? 0) + 1
    if let previous, previous.forward == forward, previous.shows(atMs: atMs) {
      return SkipFlash(forward: forward, seconds: previous.seconds + step, atMs: atMs, id: id)
    }
    return SkipFlash(forward: forward, seconds: step, atMs: atMs, id: id)
  }
}
