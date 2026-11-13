public struct FreezeWatch: Sendable {
  private var lastFrameAt: Int64 = -1
  private var watchingSince: Int64 = -1
  private let limitMs: Int64
  public init(limitMs: Int64 = 5000) { self.limitMs = limitMs }
  public mutating func frame(atMs: Int64) { lastFrameAt = atMs }
  public mutating func reset() { lastFrameAt = -1; watchingSince = -1 }
  public mutating func check(nowMs: Int64, playing: Bool, shown: Bool) -> Bool {
    guard playing && shown else { watchingSince = -1; return false }
    if watchingSince == -1 { watchingSince = nowMs }
    return nowMs - max(lastFrameAt, watchingSince) >= limitMs
  }
}
