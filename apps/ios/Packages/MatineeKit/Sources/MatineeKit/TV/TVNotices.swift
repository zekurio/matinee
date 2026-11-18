#if os(tvOS)
  import SwiftUI

  /*
   * What a TV page shows in place of what it couldn't show: a row still
   * loading, a row that failed or came back empty, and a page with nothing
   * at all on it. Android TV's `RowNotice`, `Loading`, and `Message` in
   * ui/tv/home/TvHome.kt. The words are the screen's; the kit draws them.
   */

  /// The button a notice offers, like Retry: its label, icon, and action.
  public struct TVNoticeAction {
    public let label: String
    public let icon: Lucide?
    public let action: () -> Void

    public init(_ label: String, icon: Lucide? = nil, action: @escaping () -> Void) {
      self.label = label
      self.icon = icon
      self.action = action
    }
  }

  /// The room a notice takes under a row's heading when it has no height
  /// of its own: a line of text and a button.
  public let TVRowNoticeHeight: CGFloat = 192

  /// A row of a page that has no cards to show: its `title` as a row's
  /// heading, then why, `headline` over `message`, with `action` beside, as
  /// Retry. Without a `headline` the row is still loading, and shows a
  /// spinner. `height` is the room under the heading, a poster row's
  /// (`TVRowNotice.posterHeight`) for one that will hold posters, so the
  /// rows under it stay put when its cards come.
  ///
  ///     TVRowNotice("Recently added in Movies", headline: "Couldn't load these", message: error,
  ///       action: TVNoticeAction("Try again", icon: .refreshCw) { shelf.reload() })
  public struct TVRowNotice: View {
    let title: String?
    let headline: String?
    let message: String?
    let height: CGFloat
    let action: TVNoticeAction?
    @Environment(\.palette) private var palette

    /// The room a row of posters takes under its heading.
    public static let posterHeight: CGFloat = TVCards.posterWidth * 1.5

    public init(
      _ title: String?, headline: String? = nil, message: String? = nil, height: CGFloat = TVRowNoticeHeight,
      action: TVNoticeAction? = nil
    ) {
      self.title = title
      self.headline = headline
      self.message = message
      self.height = height
      self.action = action
    }

    public var body: some View {
      VStack(alignment: .leading, spacing: TVCards.titleGap) {
        if let title {
          Text(title).textStyle(.title).lineLimit(1)
            .frame(height: TVCards.titleHeight, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
        }
        HStack(spacing: TVSpace.s7) {
          if let headline {
            VStack(alignment: .leading, spacing: 4) {
              Text(headline).textStyle(.body).foregroundStyle(palette.foreground.opacity(0.85))
              if let message {
                Text(message).textStyle(.caption).foregroundStyle(palette.mutedForeground).lineLimit(2)
              }
            }
            .layoutPriority(1)
            if let action { TVButton(action.label, icon: action.icon, action: action.action) }
          } else {
            Spinner(size: 56, tint: palette.mutedForeground)
          }
        }
        .frame(height: height, alignment: .leading)
        .focusSection()
      }
      .padding(.leading, TVPage.start)
      .padding(.trailing, TVPage.end)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  /// A spinner across the page, for a page's rows still on their way.
  public struct TVLoadingRow: View {
    let height: CGFloat
    @Environment(\.palette) private var palette

    public init(height: CGFloat = TVRowNoticeHeight) { self.height = height }

    public var body: some View {
      Spinner(size: 64, tint: palette.mutedForeground)
        .frame(maxWidth: .infinity)
        .frame(height: height)
    }
  }

  /// A page, or a part of one, that has only something to say: `title` in
  /// the page's heading size, `message` under it, and `action` under both,
  /// as Retry on a page that failed to load, or nothing for an empty one,
  /// like a library with no titles yet. `icon` goes above, for an empty
  /// page. Laid out from the page's start, centred down what it's given;
  /// `centered: false` puts it at the top, as a note among rows.
  public struct TVMessage: View {
    let title: String
    let message: String?
    let icon: Lucide?
    let centered: Bool
    let action: TVNoticeAction?
    let actionFocus: FocusState<Bool>.Binding?
    @Environment(\.palette) private var palette

    /// `actionFocus` binds the action's focus, for a page that starts on it.
    public init(
      _ title: String, message: String? = nil, icon: Lucide? = nil, centered: Bool = true,
      action: TVNoticeAction? = nil, actionFocus: FocusState<Bool>.Binding? = nil
    ) {
      self.title = title
      self.message = message
      self.icon = icon
      self.centered = centered
      self.action = action
      self.actionFocus = actionFocus
    }

    public var body: some View {
      VStack(alignment: .leading, spacing: 0) {
        if let icon {
          LucideIcon(icon, size: 72, tint: palette.mutedForeground, scales: false)
            .padding(.bottom, TVSpace.s6)
        }
        Text(title).textStyle(.headline).foregroundStyle(palette.foreground)
          .accessibilityAddTraits(.isHeader)
        if let message {
          Text(message).textStyle(.body).foregroundStyle(palette.mutedForeground)
            .frame(maxWidth: 1280, alignment: .leading)
            .padding(.top, TVSpace.s2)
        }
        if let action {
          Group {
            if let actionFocus {
              TVButton(action.label, icon: action.icon, action: action.action).focused(actionFocus)
            } else {
              TVButton(action.label, icon: action.icon, action: action.action)
            }
          }
          .padding(.top, TVSpace.s8)
        }
      }
      .padding(.leading, TVPage.start)
      .padding(.trailing, TVPage.end)
      .frame(maxWidth: .infinity, maxHeight: centered ? .infinity : nil, alignment: .leading)
      .focusSection()
    }
  }
#endif
