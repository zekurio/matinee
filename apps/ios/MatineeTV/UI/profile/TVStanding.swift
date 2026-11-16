import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvStanding.kt: where the signed-in person stands on the leaderboard for
 * the range, a card per board with their place between the people just
 * above and below them. Select opens the board whole in the right-edge
 * panel, the top places and then their neighbourhood set off, focus on
 * their own place. Boards they aren't on are left out, and with none the
 * row is too. The places are the server's, shown as it ranks them.
 */

/// A board's card in the row: Android's 300 dp.
private let BOARD_WIDTH: CGFloat = 600
/// A place's line on a board's card: Android's 40 dp.
private let PLACE_HEIGHT: CGFloat = 80

struct Standing: View {
  let board: Leaderboard?
  let range: String
  let memory: TVFocusMemory
  @State private var open: OpenBoard?

  var body: some View {
    let found = standings(board)
    if !found.isEmpty {
      // The cards are as tall as the one with the most places, so the row reads as one.
      let rows = found.map(\.places.count).max() ?? 1
      TVRow(
        Str.statsStandingTitle, key: ProfileRow.standing, items: found, itemKey: \.board.metric, memory: memory,
        spacing: TVSpace.s7
      ) { standing in
        BoardCard(standing: standing, rows: rows) { open = OpenBoard(board: standing.board) }
      }
      .profileRow(ProfileRow.standing)
      .tvSidePanel(item: $open, title: { metricName($0.board.metric) }, description: { _ in rangeName(range) }) {
        open in BoardPlaces(board: open.board)
      }
    }
  }
}

private struct OpenBoard: Identifiable {
  let board: LeaderboardBoard
  var id: String { board.metric }
}

/// A board's name and the person's place with their neighbours. Focused,
/// it fills with the text color, as a control does.
private struct BoardCard: View {
  let standing: BoardStanding
  let rows: Int
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    TVControlButton(
      shape: RoundedRectangle.kit(TVRadius.lg), rest: palette.foreground.opacity(0.07), scale: 1.03, action: action
    ) {
      BoardFace(standing: standing, rows: rows)
    }
    .frame(width: BOARD_WIDTH)
    .accessibilityLabel(metricName(standing.board.metric))
  }
}

private struct BoardFace: View {
  let standing: BoardStanding
  let rows: Int
  @Environment(\.tvFocused) private var focused
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: TVSpace.s2) {
      HStack(spacing: TVSpace.s2) {
        Text(metricName(standing.board.metric)).textStyle(.label).lineLimit(1)
          .frame(maxWidth: .infinity, alignment: .leading)
        LucideIcon(.chevronRight, size: 36, scales: false)
      }
      .opacity(0.7)
      .padding(.horizontal, TVSpace.s2)
      VStack(spacing: TVSpace.s1) {
        ForEach(standing.places, id: \.rank) { place in
          PlaceLine(place: place, value: metricValue(standing.board.metric, place.value), inverted: focused)
            .frame(height: PLACE_HEIGHT)
        }
      }
      .frame(height: PLACE_HEIGHT * CGFloat(rows) + TVSpace.s1 * CGFloat(rows - 1), alignment: .top)
    }
    .padding(.horizontal, TVSpace.s5)
    .padding(.vertical, TVSpace.s6)
  }
}

/// A place: the rank, the podium's in the accent fading from first to
/// third, the person, and the value; the person's own lit unless `lit` is
/// off, for a row that lights it itself. `inverted` is a place drawn on a
/// focused control, its text the page's color.
private struct PlaceLine: View {
  let place: LeaderboardEntry
  let value: String
  let inverted: Bool
  var lit = true
  var large = false
  @Environment(\.palette) private var palette

  var body: some View {
    let content = inverted ? palette.background : palette.foreground
    let (podium, ink): (Color, Color) =
      switch place.rank {
      case 1: (palette.accent, palette.accentForeground)
      case 2: (palette.accent.opacity(0.6), palette.accentForeground)
      case 3: (palette.accent.opacity(0.3), content)
      default: (.clear, inverted ? content.opacity(0.7) : palette.mutedForeground)
      }
    let fill: Color = !place.isSelf || !lit ? .clear : inverted ? palette.background.opacity(0.1) : palette.accentSoft
    let style: TVTextStyle = large ? .facts : .label
    HStack(spacing: TVSpace.s4) {
      Text(formatCount(place.rank)).textStyle(.caption, weight: .semibold).monospacedDigit()
        .foregroundStyle(ink)
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        .frame(width: 56, height: 56)
        .background(podium, in: Circle())
      ProfileAvatar(user: place.user, size: large ? 64 : 56)
      (Text(place.user.name) + Text(place.isSelf ? " \(Str.statsYou)" : "").foregroundStyle(content.opacity(0.65)))
        .textStyle(style)
        .foregroundStyle(content)
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
      // The figure keeps its width; the name gives way to it.
      Text(value).textStyle(style).monospacedDigit().foregroundStyle(content).lineLimit(1)
        .fixedSize()
    }
    .padding(.horizontal, TVSpace.s2)
    .frame(maxHeight: .infinity)
    .background(fill, in: RoundedRectangle.kit(TVRadius.sm * 2))
    .accessibilityElement(children: .combine)
  }
}

/// A person on a board, their picture or their initials.
private struct ProfileAvatar: View {
  let user: ProfileUser
  let size: CGFloat
  @Environment(\.api) private var api

  var body: some View {
    Avatar(user.name, size: size) {
      Picture(user.avatarId.flatMap { id in api.flatMap { ImageSource($0.paths.avatar(id)) } })
    }
    .accessibilityHidden(true)
  }
}

/// A whole board in the side panel: the top places, then the person's
/// neighbourhood, set off unless it carries straight on. Each place takes
/// focus so a long board scrolls; focus starts on their own.
private struct BoardPlaces: View {
  let board: LeaderboardBoard
  @FocusState private var focused: Int?
  @Environment(\.palette) private var palette

  var body: some View {
    ForEach(Array(board.entries.enumerated()), id: \.offset) { index, place in
      TVControlButton(
        shape: RoundedRectangle.kit(TVListItems.radius), rest: place.isSelf ? palette.accentSoft : .clear,
        scale: TVFocus.rowScale, action: {}
      ) {
        PlaceRowFace(place: place, value: metricValue(board.metric, place.value))
      }
      .focused($focused, equals: index)
      .padding(.top, startsNeighborhood(board, index) ? TVSpace.s6 : 0)
    }
    .defaultFocus($focused, board.entries.firstIndex(where: \.isSelf) ?? 0)
  }
}

private struct PlaceRowFace: View {
  let place: LeaderboardEntry
  let value: String
  @Environment(\.tvFocused) private var focused

  var body: some View {
    PlaceLine(place: place, value: value, inverted: focused, lit: false, large: true)
      .padding(.horizontal, TVListItems.inset - TVSpace.s2)
      .frame(height: TVListItems.height)
  }
}
