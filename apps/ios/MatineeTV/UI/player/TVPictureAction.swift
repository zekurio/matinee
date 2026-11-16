import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvPictureButton.kt: the one thing the player offers by itself, Skip
 * intro while a segment the server found plays, or the next episode once
 * the credits start. While the controls are away it shows alone on the
 * picture, at the bottom right, and takes focus there: Select presses it,
 * Left and Right still skip, Up, Down, and a tap bring the controls, and
 * Menu puts it away. With the controls up it's in their row, beside the
 * menus, as on Android TV.
 *
 * Android TV draws the next episode as a button alone; here it's a card,
 * the next episode's picture and name with the button under them, since a
 * TV is where someone decides from across the room whether to go on. The
 * button is still the card's one focusable thing, so the arrows do what
 * they do without it.
 */

/// What the player offers by itself now: Skip intro or the like, or the next episode.
enum TVPictureAction: Equatable {
  /// The segment that plays, which Select skips.
  case skip(MediaSegment)
  /// The next episode, counting down to it with `seconds` left, or waiting for Play when nil.
  case next(MediaItem, seconds: Int?)

  var label: String {
    switch self {
    case .skip(let segment): tvSkipSegmentLabel(segment.kind)
    case .next: Str.playerNextEpisode
    }
  }

  var icon: Lucide {
    switch self {
    case .skip: .skipForward
    case .next: .play
    }
  }

  /// "· 7", the countdown after the label, dimmer.
  var detail: String? {
    if case .next(_, let seconds?) = self { return "· \(seconds)" }
    return nil
  }

  /// Which offer it is, apart from its countdown, so focus follows a new one and not each second.
  var key: String {
    switch self {
    case .skip(let segment): "skip-\(segment.kind)-\(segment.start)"
    case .next(let item, _): "next-\(item.id)"
    }
  }
}

/// The action's button: dark at rest, since the picture behind it can be
/// any frame, with a shadow that keeps its edge on a white one once focus
/// fills it, as Android's `TvPictureButton`. In the up-next card, which
/// already says what's next, it says when: "Playing in 7", or Play.
struct TVPictureActionButton: View {
  let action: TVPictureAction
  var inCard = false
  let run: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    if inCard, case .next(_, let seconds) = action {
      TVButton(seconds.map(Str.playerUpNextIn) ?? Str.playerPlay, icon: .play, action: run)
        .monospacedDigit()
    } else {
      TVButton(
        action.label, icon: action.icon, detail: action.detail, rest: palette.background.opacity(0.72), action: run
      )
      .shadow(color: .black.opacity(0.45), radius: 16, y: 6)
      .monospacedDigit()
    }
  }
}

/// The next episode, while the credits roll and the controls are away: its
/// picture, Up next, its number and name, and the button that plays it.
struct TVUpNextCard<Action: View>: View {
  let item: MediaItem
  @ViewBuilder let button: () -> Action
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette

  var body: some View {
    let label = itemLabel(item)
    let name = episodeCode(item).map { Str.mediaCodeTitle($0, label.title) } ?? label.title
    HStack(alignment: .center, spacing: TVSpace.s6) {
      Picture(api?.landscape(item) ?? [])
        .frame(width: 352, height: 198)
        .background(palette.muted)
        .clipShape(RoundedRectangle.kit(TVRadius.card))
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 0) {
        Text(Str.playerUpNext).textStyle(.label).foregroundStyle(palette.mutedForeground)
        Text(name).textStyle(.title).lineLimit(2)
          .padding(.top, 4)
        button().padding(.top, TVSpace.s5)
      }
      .frame(maxWidth: 560, alignment: .leading)
      .fixedSize(horizontal: false, vertical: true)
    }
    .padding(TVSpace.s6)
    .background(palette.popover.opacity(0.94), in: RoundedRectangle.kit(TVRadius.lg))
    .overlay { RoundedRectangle.kit(TVRadius.lg).strokeBorder(palette.hairline) }
    .shadow(color: .black.opacity(0.5), radius: 32, y: 12)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Str.playerUpNext)
  }
}
