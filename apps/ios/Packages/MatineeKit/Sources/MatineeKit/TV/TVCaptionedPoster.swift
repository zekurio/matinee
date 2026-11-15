#if os(tvOS)
  import SwiftUI

  /// A `TVPosterCard` with a caption under it, as in a grid or a row of
  /// seasons: `name` and a dimmer `detail`, and a `badge` at its corner,
  /// like a count of new episodes, while it isn't watched. Only the poster
  /// takes focus.
  ///
  ///     TVCaptionedPoster("Season 2", detail: "10 episodes", url: poster) { open(season) }
  public struct TVCaptionedPoster<Art: View>: View {
    let name: String
    let detail: String?
    let badge: String?
    let watched: Bool
    let width: CGFloat?
    let action: () -> Void
    let onLongPress: (() -> Void)?
    let onPlayPause: (() -> Void)?
    @ViewBuilder let art: () -> Art
    @Environment(\.palette) private var palette

    public init(
      _ name: String, detail: String? = nil, badge: String? = nil, watched: Bool = false,
      width: CGFloat? = TVCards.posterWidth, action: @escaping () -> Void, onLongPress: (() -> Void)? = nil,
      onPlayPause: (() -> Void)? = nil, @ViewBuilder art: @escaping () -> Art
    ) {
      self.name = name
      self.detail = detail
      self.badge = badge
      self.watched = watched
      self.width = width
      self.action = action
      self.onLongPress = onLongPress
      self.onPlayPause = onPlayPause
      self.art = art
    }

    public var body: some View {
      VStack(alignment: .leading, spacing: 0) {
        TVPosterCard(
          name, watched: watched, width: width, action: action, onLongPress: onLongPress, onPlayPause: onPlayPause
        ) {
          ZStack(alignment: .topTrailing) {
            art()
            if let badge, !watched {
              Text(badge).textStyle(.caption, weight: .semibold)
                .foregroundStyle(palette.accentForeground)
                .padding(.horizontal, 16)
                .background(palette.accent, in: Capsule())
                .padding(16)
            }
          }
        }
        Text(name).textStyle(.label).lineLimit(1)
          .padding(.top, TVFocus.captionGap)
        if let detail {
          Text(detail).textStyle(.caption).foregroundStyle(palette.mutedForeground).lineLimit(1)
        }
      }
      .frame(width: width, alignment: .leading)
    }
  }

  extension TVCaptionedPoster where Art == TVPicture {
    /// A captioned poster loaded from `url`.
    public init(
      _ name: String, detail: String? = nil, badge: String? = nil, watched: Bool = false, url: URL?,
      width: CGFloat? = TVCards.posterWidth, action: @escaping () -> Void, onLongPress: (() -> Void)? = nil,
      onPlayPause: (() -> Void)? = nil
    ) {
      self.init(
        name, detail: detail, badge: badge, watched: watched, width: width, action: action, onLongPress: onLongPress,
        onPlayPause: onPlayPause
      ) { TVPicture(url) }
    }
  }

#endif
