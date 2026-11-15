import Foundation

/*
 * The wall of artwork behind the sign-in screens, as the web's login page
 * has it (apps/web/src/components/login-backdrop.tsx) and Android's
 * LoginBackdrop.kt draws it: rows of posters and thumbs that drift in
 * turns left and right, the wall sloped, blurred, and faded into the
 * background. Each row is its own shuffle of the tiles, with the web's
 * seeded generator, so a row falls as it does in the browser.
 *
 * What's here is the wall's arithmetic and the fetch; the app draws it.
 * The server serves these images without a session while the backdrop is on.
 */
public enum LoginBackdropLayout {
  /// How far the wall leans, in degrees.
  public static let slopeDegrees = -12.0
  /// How much larger than the screen the wall is, so its edges stay off it once sloped.
  public static let oversize = 1.7
  /// Seconds a row takes to drift 30 row heights, per row: the web's per copy.
  public static let durations: [Double] = [96, 120, 104, 132, 100, 124, 112, 140, 108, 128]
  /// How wide a copy of a row is on the web, in row heights, which `durations` are timed for.
  public static let webRowWidth = 30.0
  /// Dark text loses contrast against artwork faster, so a light theme shows the wall weaker.
  public static let lightStrength = 0.35
  /// Points between tiles and between rows, the web's `gap-3`.
  public static let gap = 12.0

  /// Width over height of a tile: a poster 2:3, a thumb 16:9.
  public static func aspect(of tile: LoginBackdropTile) -> Double {
    tile.kind == LoginBackdropKind.poster ? 2.0 / 3.0 : 16.0 / 9.0
  }

  /// A row's height on a screen `height` points tall: `clamp(88px, 16cqh, 200px)`.
  public static func rowHeight(screenHeight height: Double) -> Double {
    min(max(height * 0.16, 88), 200)
  }

  /// How many rows fill the sloped wall on a screen `height` points tall.
  public static func rowCount(screenHeight height: Double, rowHeight: Double) -> Int {
    Int((height * oversize / (rowHeight + gap)).rounded(.up)) + 1
  }

  /// How wide a copy of a row must be, in row heights, for a screen `width`
  /// points wide: wider than the sloped wall, so the row loops without a
  /// gap. The web makes every copy 30 row heights, for a 21:9 screen; a
  /// phone needs a fraction of that, and draws a fraction of the tiles.
  public static func minRowWidth(screenWidth width: Double, rowHeight: Double) -> Double {
    min(webRowWidth, (width * oversize / rowHeight).rounded(.up) + 2)
  }

  /// One copy of each of `count` rows: its own shuffle of `tiles`, repeated
  /// until it's `minWidth` row heights wide.
  public static func rows(
    _ tiles: [LoginBackdropTile], count: Int, minWidth: Double = webRowWidth
  ) -> [[LoginBackdropTile]] {
    guard !tiles.isEmpty else { return Array(repeating: [], count: max(0, count)) }
    return (0..<max(0, count)).map { row in
      let order = shuffled(tiles, seed: UInt32(row + 1))
      var copy: [LoginBackdropTile] = []
      var width = 0.0
      var index = 0
      while width < minWidth {
        let tile = order[index % order.count]
        copy.append(tile)
        width += aspect(of: tile)
        index += 1
      }
      return copy
    }
  }

  /// Points one copy of `row` takes at `rowHeight`, tiles and gaps: what a
  /// row drifts by before it starts over on the same picture.
  public static func copyWidth(_ row: [LoginBackdropTile], rowHeight: Double) -> Double {
    row.reduce(0) { $0 + rowHeight * aspect(of: $1) + gap }
  }

  /// Seconds row `index` takes to drift one copy of `copyWidth` points, at
  /// the web's speed whatever the copy's length.
  public static func duration(row index: Int, copyWidth: Double, rowHeight: Double) -> Double {
    let seconds = durations[index % durations.count]
    return seconds * (copyWidth / rowHeight) / webRowWidth
  }

  /// How strongly the wall shows: what the fade leaves of it, weaker on a light theme.
  public static func strength(_ settings: LoginBackdrop, dark: Bool) -> Double {
    let fade = min(max(Double(settings.fade), 0), 100)
    return (1 - fade / 100) * (dark ? 1 : lightStrength)
  }

  /// The tiles `settings` ask for, from `api`'s server: none while it's
  /// off, and none from an older server or one that went away, which
  /// leaves the plain background.
  public static func tiles(_ api: MatineeApi, settings: LoginBackdrop) async -> [LoginBackdropTile] {
    guard settings.enabled else { return [] }
    do {
      return try await api.auth.loginBackdrop().tiles
    } catch {
      return []
    }
  }

  /// `list` in the order the web's `shuffled(list, seed)` puts it.
  static func shuffled<T>(_ list: [T], seed: UInt32) -> [T] {
    var next = SeededRandom(seed: seed)
    var out = list
    var i = out.count - 1
    while i > 0 {
      let j = Int(next.next() * Double(i + 1))
      out.swapAt(i, j)
      i -= 1
    }
    return out
  }
}

/// The web's small seeded generator (mulberry32), number for number, so a
/// row keeps the order the browser gives it.
struct SeededRandom {
  private var state: UInt32

  init(seed: UInt32) { state = seed }

  /// The next number in [0, 1).
  mutating func next() -> Double {
    state = state &+ 0x6D2B_79F5
    var x = state
    x = (x ^ (x >> 15)) &* (x | 1)
    x ^= x &+ ((x ^ (x >> 7)) &* (x | 61))
    return Double(x ^ (x >> 14)) / 4_294_967_296
  }
}
