import MatineeCore
import MatineeKit
import SwiftUI

/*
 * LoginBackdrop.kt: the wall of artwork behind the sign-in screens, as the
 * web's login page has it (apps/web/src/components/login-backdrop.tsx):
 * rows of posters and thumbs that drift in turns left and right, the wall
 * sloped, blurred, and faded into the background. Its arithmetic, the
 * rows' shuffles, and the fetch are MatineeCore's `LoginBackdropLayout`.
 */

/// The backdrop `settings` describe, from `api`'s server, filling the
/// screen behind what's over it. Nothing while it's off, or when the
/// server has nothing to show or can't be asked. One pick of artwork per
/// visit, as the web keeps it, so the wall doesn't reshuffle under the form.
struct LoginBackdropWall: View {
  let api: MatineeApi
  let settings: LoginBackdrop
  @State private var tiles: [LoginBackdropTile] = []
  @Environment(\.MatineeKit::palette) private var palette
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    GeometryReader { proxy in
      if settings.enabled, !tiles.isEmpty, proxy.size.width > 0, proxy.size.height > 0 {
        wall(proxy.size)
          .transition(.opacity)
      }
    }
    .animation(MatineeKit.Motion.animation(MatineeKit.Motion.move, reduceMotion: reduceMotion), value: tiles.isEmpty)
    .ignoresSafeArea()
    .allowsHitTesting(false)
    .accessibilityHidden(true)
    .task(id: settings.enabled) { tiles = await LoginBackdropLayout.tiles(api, settings: settings) }
  }

  private func wall(_ size: CGSize) -> some View {
    let rowHeight = LoginBackdropLayout.rowHeight(screenHeight: size.height)
    let rows = LoginBackdropLayout.rows(
      tiles, count: LoginBackdropLayout.rowCount(screenHeight: size.height, rowHeight: rowHeight),
      minWidth: LoginBackdropLayout.minRowWidth(screenWidth: size.width, rowHeight: rowHeight))
    let oversize = LoginBackdropLayout.oversize
    return VStack(spacing: LoginBackdropLayout.gap) {
      ForEach(rows.indices, id: \.self) { index in
        WallRow(
          api: api, tiles: rows[index], height: rowHeight, index: index, reverse: index % 2 == 1,
          still: reduceMotion)
      }
    }
    .frame(width: size.width * oversize, height: size.height * oversize)
    .rotationEffect(.degrees(LoginBackdropLayout.slopeDegrees))
    .blur(radius: CGFloat(max(0, settings.blur)))
    .opacity(LoginBackdropLayout.strength(settings, dark: palette.isDark))
    .frame(width: size.width, height: size.height)
    .clipped()
    // The rows run off their leading edge and drift by it, whichever way text reads.
    .environment(\.layoutDirection, .leftToRight)
  }
}

/// One row: two copies of its tiles side by side, moving by one copy's
/// width and starting over, so it lands on the same picture each time.
/// Still under Reduce Motion, as the web's.
private struct WallRow: View {
  let api: MatineeApi
  let tiles: [LoginBackdropTile]
  let height: CGFloat
  let index: Int
  let reverse: Bool
  let still: Bool
  @State private var moving = false
  @Environment(\.MatineeKit::palette) private var palette

  var body: some View {
    let copy = LoginBackdropLayout.copyWidth(tiles, rowHeight: height)
    let seconds = LoginBackdropLayout.duration(row: index, copyWidth: copy, rowHeight: height)
    // Forward goes from the first copy to the second; reverse comes back.
    let start = reverse ? -copy : 0
    let end = reverse ? 0 : -copy
    HStack(spacing: LoginBackdropLayout.gap) {
      ForEach(Array((tiles + tiles).enumerated()), id: \.offset) { _, tile in
        // TODO(shell): the shared artwork view with its blurhash placeholder.
        Picture(api.art(tile.artwork, size: .small))
          .frame(width: height * LoginBackdropLayout.aspect(of: tile), height: height)
          .background(palette.foreground.opacity(0.05))
          .clipShape(RoundedRectangle.kit(Radius.lg))
      }
    }
    .fixedSize()
    .offset(x: still ? start : moving ? end : start)
    .frame(maxWidth: .infinity, alignment: .leading)
    .frame(height: height)
    .onAppear {
      guard !still else { return }
      withAnimation(.linear(duration: seconds).repeatForever(autoreverses: false)) { moving = true }
    }
  }
}
